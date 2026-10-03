import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_TEXT = 20_000;
const clean = (value) =>
  load(`<span>${String(value ?? "")}</span>`)("span")
    .text()
    .replace(/\s+/g, " ")
    .trim();

export function isPublicAddress(address) {
  try {
    return (
      ipaddr.process(address.replace(/^\[|\]$/g, "")).range() === "unicast"
    );
  } catch {
    return false;
  }
}

export async function validatePublicUrl(value, lookup = dnsLookup) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserError("正しいレシピページの URL を入力してください。");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new UserError(
      "認証情報や特別なポートを含まない http / https の URL を使ってください。",
    );
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    /\.(?:localhost|local|internal)$/.test(hostname)
  ) {
    throw new UserError("公開されているレシピページの URL を使ってください。");
  }
  let addresses;
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UserError("ページのアドレスを確認できませんでした。", 422);
  }
  if (
    !addresses.length ||
    addresses.some((entry) => !isPublicAddress(entry.address))
  ) {
    throw new UserError("公開されているレシピページの URL を使ってください。");
  }
  url.hash = "";
  return { url, address: addresses[0] };
}

export function pinnedAgent(address) {
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        callback(
          null,
          options.all ? [address] : address.address,
          options.all ? undefined : address.family,
        );
      },
      timeout: 8000,
    },
  });
}

function deadline(promise, signal) {
  if (signal.aborted)
    return Promise.reject(
      new UserError(
        "ページの取得に時間がかかっています。文章を貼り付けてください。",
        504,
      ),
    );
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new UserError(
          "ページの取得に時間がかかっています。文章を貼り付けてください。",
          504,
        ),
      );
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function fetchPublicRecipeText(value, options = {}) {
  const {
    lookup = dnsLookup,
    fetchImpl = undiciFetch,
    agentFactory = pinnedAgent,
    timeoutMs = 12_000,
  } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  let next = value;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const { url, address } = await deadline(
      validatePublicUrl(next, lookup),
      signal,
    );
    const agent = agentFactory(address);
    try {
      const response = await fetchImpl(url, {
        dispatcher: agent,
        redirect: "manual",
        signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain",
          "User-Agent": "KitchenFlow/2.0 RecipeReader",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location)
          throw new UserError("移動先のページを確認できませんでした。", 422);
        next = new URL(location, url).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new UserError(
          "ページを読み取れませんでした。レシピの文章を貼り付けてください。",
          422,
        );
      }
      const contentType = response.headers.get("content-type") || "";
      if (
        !/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/i.test(
          contentType,
        )
      ) {
        await response.body?.cancel();
        throw new UserError(
          "HTML またはテキストのレシピページを使ってください。",
          422,
        );
      }
      if (Number(response.headers.get("content-length")) > MAX_PAGE_BYTES) {
        await response.body?.cancel();
        throw new UserError(
          "ページが大きすぎます。レシピの文章を貼り付けてください。",
          422,
        );
      }
      const reader = response.body.getReader();
      let bytes = 0;
      const chunks = [];
      while (true) {
        const { value: chunk, done } = await deadline(reader.read(), signal);
        if (done) break;
        bytes += chunk.byteLength;
        if (bytes > MAX_PAGE_BYTES) {
          await reader.cancel();
          throw new UserError(
            "ページが大きすぎます。レシピの文章を貼り付けてください。",
            422,
          );
        }
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      return {
        ...(/text\/plain/i.test(contentType)
          ? { text: body.slice(0, MAX_TEXT), warnings: [] }
          : extractRecipeHtml(body)),
        source: url.href,
      };
    } catch (error) {
      if (error instanceof UserError) throw error;
      if (signal.aborted)
        throw new UserError(
          "ページの取得に時間がかかっています。文章を貼り付けてください。",
          504,
        );
      throw new UserError(
        "ページを読み取れませんでした。レシピの文章を貼り付けてください。",
        422,
      );
    } finally {
      await agent.close();
    }
  }
  throw new UserError(
    "ページの転送が多すぎます。レシピの文章を貼り付けてください。",
    422,
  );
}

function findRecipe(nodes) {
  const stack = [nodes];
  let visited = 0;
  while (stack.length && visited++ < 5000) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (
      [node["@type"]]
        .flat()
        .some((type) => /^(?:https?:\/\/schema.org\/)?Recipe$/.test(type))
    )
      return node;
    stack.push(
      ...Object.values(node).filter(
        (value) => value && typeof value === "object",
      ),
    );
  }
}

function instructionLines(value) {
  if (typeof value === "string")
    return value.split(/\n+/).map(clean).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(instructionLines);
  if (value && typeof value === "object")
    return value.itemListElement
      ? instructionLines(value.itemListElement)
      : instructionLines(value.text || value.name);
  return [];
}

export function extractRecipeHtml(html) {
  const $ = load(html);
  let recipe;
  $('script[type="application/ld+json"]').each((_index, element) => {
    if (recipe) return;
    try {
      recipe = findRecipe(JSON.parse($(element).text()));
    } catch {
      /* Ignore malformed metadata; preserve visible text below. */
    }
  });
  if (recipe) {
    const instructions = instructionLines(recipe.recipeInstructions);
    if (instructions.length) {
      const ingredients = [recipe.recipeIngredient ?? []]
        .flat()
        .map(clean)
        .filter(Boolean);
      const text = [
        clean(recipe.name) || "取り込んだレシピ",
        "材料",
        ...ingredients,
        "手順",
        ...instructions,
      ].join("\n");
      if (text.length > MAX_TEXT)
        throw new UserError(
          "レシピが長すぎます。必要な部分の文章を貼り付けてください。",
          422,
        );
      return { text, warnings: [] };
    }
  }
  $("script,style,nav,header,footer,aside,noscript").remove();
  $("br").replaceWith("\n");
  $("p,li,h1,h2,h3,section").append("\n");
  const text = (
    $("article").first().text() ||
    $("main").first().text() ||
    $("body").text()
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
  return {
    text,
    warnings: [
      "ページ本文から読み取りました。広告や抜けた手順がないか確認してください。",
    ],
  };
}

export function parseDuration(line) {
  const text = line.normalize("NFKC");
  const matches = [
    ...text.matchAll(
      /(\d+(?:\.\d+)?)\s*(?:[〜～~–-]\s*(\d+(?:\.\d+)?))?\s*(時間|分|秒|hours?|minutes?|mins?|seconds?|secs?)/gi,
    ),
  ];
  let seconds = 0;
  for (const match of matches) {
    const unit = match[3].toLowerCase();
    seconds +=
      Number(match[2] || match[1]) *
      (/^(時間|hour)/.test(unit) ? 3600 : /^(分|min)/.test(unit) ? 60 : 1);
  }
  return seconds
    ? Math.max(1, Math.min(21_600, Math.round(seconds)))
    : undefined;
}

function classify(line) {
  const oven = /オーブン|予熱|oven|bake/i.test(line);
  const burner =
    /火|鍋|フライパン|煮|茹|ゆで|炒|焼|沸|蒸|boil|simmer|fry|pan/i.test(line);
  const passive =
    /置く|置き|放置|待つ|冷ます|冷や|漬け|寝かせ|炊く|炊き|煮込|煮る|茹でる|ゆでる|蒸す|オーブン|予熱|simmer|rest|chill|bake|boil|steam/i.test(
      line,
    );
  const active = /混ぜながら|かき混ぜ|炒め|炒る|揚げ|stir|fry/i.test(line);
  return {
    kind: passive && !active ? "wait" : "hands",
    resource: oven ? "oven" : burner ? "burner" : "none",
  };
}

function looksLikeProcedure(line) {
  const action =
    /切る|切り分ける|混ぜる|煮る|焼く|炒める|茹でる|ゆでる|蒸す|盛り付ける|入れる|洗う|水を切|味を調え/;
  return (
    (parseDuration(line) !== undefined && action.test(line)) ||
    /(?:切る|切り分ける|混ぜる|煮る|焼く|炒める|茹でる|ゆでる|蒸す|盛り付ける|入れる|洗う)[。.!！]?$/.test(
      line,
    ) ||
    /^(wash|cut|mix|boil|cook|chop|stir|serve)\b/i.test(line)
  );
}

function ingredientItems(text) {
  const items = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (/[（([{]/.test(character)) depth++;
    if (/[）)\]}]/.test(character)) depth = Math.max(0, depth - 1);
    const numericComma =
      character === "," &&
      /\d/.test(text[index - 1] || "") &&
      /\d/.test(text[index + 1] || "");
    if (!depth && /[、,，;；]/.test(character) && !numericComma) {
      if (current.trim()) items.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function parseIngredient(line) {
  // A separator followed by a recognizable quantity is evidence; otherwise
  // retain the complete source as the name and ask for review, without guessing.
  const amountStart =
    "(?:[0-9０-９¼½¾⅓⅔]|少々|適量|お好み|ひとつまみ|一つまみ|大さじ|小さじ|少量|たっぷり|to taste|a pinch|as needed)";
  const suffix = line.match(
    new RegExp(
      `^(.+?)(?:\\s+|[:：]\\s*|[…・.]{2,}\\s*)(${amountStart}.*)$`,
      "i",
    ),
  );
  if (suffix)
    return {
      ingredient: {
        name: suffix[1].trim().slice(0, 150),
        amount: suffix[2].trim().slice(0, 80),
      },
      unclear: false,
    };
  const prefix = line.match(
    /^(\d+(?:[./]\d+)?\s*(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|grams?|kg|g|ml|liters?|l|oz|ounces?)\b)\s+(.+)$/i,
  );
  if (prefix)
    return {
      ingredient: {
        name: prefix[2].slice(0, 150),
        amount: prefix[1].slice(0, 80),
      },
      unclear: false,
    };
  return {
    ingredient: { name: line.slice(0, 150), amount: "" },
    unclear: true,
  };
}

export function parseTextRecipe(text, source) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => ({
      text: line.replace(/^\s*(?:[-*•]|[0-9０-９]+[.)、．）])\s*/, "").trim(),
      numbered: /^\s*[0-9０-９]+[.)、．）]/.test(line),
    }))
    .filter((line) => line.text);
  if (!lines.length) throw new UserError("レシピの文章を入力してください。");
  if (lines.length > 120)
    throw new UserError("1 つの料理の材料と手順に絞って入力してください。");
  let name = "取り込んだレシピ";
  const first = lines[0].text;
  const looksLikeAction = looksLikeProcedure(first);
  if (
    lines.length > 1 &&
    !parseDuration(first) &&
    !looksLikeAction &&
    !/^(材料|手順|作り方|ingredients\b|instructions\b|method\b|steps\b)/i.test(
      first,
    )
  )
    name = lines.shift().text.slice(0, 100);
  const ingredients = [];
  const procedures = [];
  const unclearIngredients = [];
  const addIngredients = (line) => {
    for (const item of ingredientItems(line)) {
      const { ingredient, unclear } = parseIngredient(item);
      ingredients.push(ingredient);
      if (unclear) unclearIngredients.push(item);
    }
  };
  let section = "steps";
  for (const entry of lines) {
    const line = entry.text;
    const ingredientHeader = line.match(
      /^(?:材料|ingredients)(?=\s|[（(:：]|$)\s*(?:[（(][^）)]*[）)])?\s*[:：]?\s*(.*)$/i,
    );
    if (ingredientHeader) {
      section = "ingredients";
      if (ingredientHeader[1]) addIngredients(ingredientHeader[1]);
      continue;
    }
    if (
      /^(手順|作り方|調理手順|instructions|method|steps)\s*[:：]?$/i.test(line)
    ) {
      section = "steps";
      continue;
    }
    if (section === "ingredients" && entry.numbered && looksLikeProcedure(line))
      section = "steps";
    if (section === "ingredients") {
      addIngredients(line);
    } else procedures.push(line);
  }
  if (!procedures.length)
    throw new UserError(
      "料理の手順が見つかりませんでした。「手順」の後に作業を 1 行ずつ入力してください。",
      422,
    );
  if (procedures.length > 60)
    throw new UserError("手順は 60 件以内に整理してください。", 422);
  const id = randomUUID();
  const estimated = [];
  const steps = procedures.map((line, index) => {
    const duration = parseDuration(line);
    if (!duration) estimated.push(index + 1);
    return {
      id: `${id}-s${index + 1}`,
      title: line.slice(0, 100),
      detail: duration
        ? line
        : `${line}\n時間の記載がないため、仮に 1 分としています。調理前に確認してください。`,
      durationSec: duration ?? 60,
      ...classify(line),
      dependsOn: index ? [`${id}-s${index}`] : [],
    };
  });
  const warnings = [
    "作業・待ち時間・器具の区分は推定です。保存前に確認してください。",
  ];
  if (unclearIngredients.length)
    warnings.push(
      `材料 ${unclearIngredients.map((line) => `「${line.slice(0, 100)}」`).join("、")} の名前と分量を分けられませんでした。原文を材料名に残しています。確認してください。`,
    );
  const servings = text.match(/(\d+)\s*人(?:分|前)/);
  if (!servings)
    warnings.push(
      "人数の記載がないため、仮に 2 人分としています。材料の量は原文のままです。",
    );
  if (estimated.length)
    warnings.push(`手順 ${estimated.join("、")} の時間は仮の 1 分です。`);
  if (/\d\s*[〜～~–-]\s*\d/.test(text))
    warnings.push("時間の幅がある手順は長い方の時間を採用しています。");
  return {
    recipe: {
      id,
      name,
      description: "取り込んだ文章から作成した確認用の下書き",
      servings: servings ? Math.max(1, Math.min(50, Number(servings[1]))) : 2,
      ingredients,
      steps,
      color: "#db7953",
      ...(source ? { source } : {}),
    },
    method: "text",
    warnings,
  };
}
