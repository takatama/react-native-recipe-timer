import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRecipeHtml,
  fetchPublicRecipeText,
  isPublicAddress,
  parseDuration,
  parseTextRecipe,
  validatePublicUrl,
} from "./importer.mjs";

test("durations preserve minutes, seconds, fullwidth digits, range and hours", () => {
  assert.equal(parseDuration("２分３０秒炒める"), 150);
  assert.equal(parseDuration("8〜10分煮込む"), 600);
  assert.equal(parseDuration("1時間10分置く"), 4200);
  assert.equal(parseDuration("Bake 12 minutes"), 720);
  assert.equal(parseDuration("水を入れる"), undefined);
});

test("text importer preserves untimed procedures and conservative sequential dependencies", () => {
  const result = parseTextRecipe(
    "トマトソース\n材料（3人分）\nトマト 2個\n塩 少々\n手順\nトマトを切る\n鍋で2分炒める\n弱火で10分煮込む\n盛り付ける",
  );
  assert.equal(result.method, "text");
  assert.equal(result.recipe.name, "トマトソース");
  assert.equal(result.recipe.servings, 3);
  assert.deepEqual(result.recipe.ingredients, [
    { name: "トマト", amount: "2個" },
    { name: "塩", amount: "少々" },
  ]);
  assert.equal(result.recipe.steps.length, 4);
  assert.equal(result.recipe.steps[0].durationSec, 60);
  assert.match(result.recipe.steps[0].detail, /仮に 1 分/);
  assert.equal(result.recipe.steps[1].kind, "hands");
  assert.equal(result.recipe.steps[1].resource, "burner");
  assert.equal(result.recipe.steps[2].kind, "wait");
  assert.deepEqual(result.recipe.steps[3].dependsOn, [
    result.recipe.steps[2].id,
  ]);
  assert.match(result.warnings.join(" "), /1、4/);
});

test("a duration in first line is a procedure, not dropped as a title", () => {
  const result = parseTextRecipe("野菜を3分炒める\n皿に盛る");
  assert.equal(result.recipe.steps.length, 2);
  assert.equal(result.recipe.steps[0].durationSec, 180);
});

test("normal Japanese inline materials and numbered procedures import as three steps", () => {
  const result = parseTextRecipe(
    "じゃがいもの塩ゆで\n材料：じゃがいも 2個、塩 少々\n1. じゃがいもを洗って切る（3分）\n2. 鍋でゆでる（12分）\n3. 水を切り、塩で味を調える（1分）",
  );
  assert.equal(result.recipe.name, "じゃがいもの塩ゆで");
  assert.deepEqual(result.recipe.ingredients, [
    { name: "じゃがいも", amount: "2個" },
    { name: "塩", amount: "少々" },
  ]);
  assert.equal(result.recipe.steps.length, 3);
  assert.deepEqual(
    result.recipe.steps.map((step) => step.durationSec),
    [180, 720, 60],
  );
  assert.equal(result.recipe.steps[0].title, "じゃがいもを洗って切る（3分）");
});

test("ingredient section stops at a numbered action without a procedure header", () => {
  const result = parseTextRecipe(
    "サラダ\n材料\nトマト 2個\n塩 少々\n1. トマトを切る\n2. 塩を混ぜる",
  );
  assert.deepEqual(result.recipe.ingredients, [
    { name: "トマト", amount: "2個" },
    { name: "塩", amount: "少々" },
  ]);
  assert.equal(result.recipe.steps.length, 2);
});

test("ambiguous material text is preserved with a warning, quantities are not guessed", () => {
  const result = parseTextRecipe(
    "ソース\n材料：自家製 ブレンドソース、トマト 2,000g\n作り方\n2分混ぜる",
  );
  assert.deepEqual(result.recipe.ingredients, [
    { name: "自家製 ブレンドソース", amount: "" },
    { name: "トマト", amount: "2,000g" },
  ]);
  assert.match(result.warnings.join(" "), /名前と分量を分けられません/);
});

test("English ingredients retain multiword names and explicit quantities", () => {
  const result = parseTextRecipe(
    "Tomato soup\nIngredients: extra virgin olive oil 2 tbsp, 2 cups tomato juice\nInstructions\nBoil for 5 minutes",
  );
  assert.deepEqual(result.recipe.ingredients, [
    { name: "extra virgin olive oil", amount: "2 tbsp" },
    { name: "tomato juice", amount: "2 cups" },
  ]);
  assert.equal(result.recipe.steps.length, 1);
});

test("JSON-LD extracts nested Recipe and HowToSection with untimed steps", () => {
  const html =
    '<h1>広告</h1><script type="application/ld+json">' +
    JSON.stringify({
      "@graph": [
        {
          "@type": ["Recipe"],
          name: "きのこスープ",
          recipeIngredient: ["しめじ 1袋"],
          recipeInstructions: [
            {
              "@type": "HowToSection",
              itemListElement: [
                { "@type": "HowToStep", text: "しめじをほぐす" },
                { "@type": "HowToStep", text: "<b>5分</b>煮る" },
              ],
            },
          ],
        },
      ],
    }) +
    "</script>";
  const result = extractRecipeHtml(html);
  assert.match(
    result.text,
    /きのこスープ\n材料\nしめじ 1袋\n手順\nしめじをほぐす\n5分煮る/,
  );
  assert.equal(parseTextRecipe(result.text).recipe.steps.length, 2);
  assert.equal(result.warnings.length, 0);
});

test("visible HTML fallback removes script and navigation but keeps procedure lines", () => {
  const result = extractRecipeHtml(
    "<nav>広告</nav><main><h1>サラダ</h1><p>野菜を切る</p><p>混ぜる</p></main><script>secret</script>",
  );
  assert.match(result.text, /サラダ/);
  assert.match(result.text, /混ぜる/);
  assert.doesNotMatch(result.text, /secret|広告/);
  assert.equal(result.warnings.length, 1);
});

test("SSRF public-address validation rejects all local and mapped ranges", async () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("93.184.216.34"), true);
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/test",
    "http://127.0.0.1",
    "https://user:secret@example.com",
    "https://example.com:4317",
  ])
    await assert.rejects(validatePublicUrl(url, lookup));
  await assert.rejects(
    validatePublicUrl("https://example.com", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
});

test("fetch pins the validated address, bounds page size, and revalidates redirects", async () => {
  let called = 0;
  let closed = 0;
  const agent = {
    close: async () => {
      closed++;
    },
  };
  const options = {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    agentFactory: (address) => {
      assert.equal(address.address, "93.184.216.34");
      return agent;
    },
    fetchImpl: async (_url, request) => {
      called++;
      assert.equal(request.dispatcher, agent);
      assert.equal(request.redirect, "manual");
      return new Response("", {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" },
      });
    },
  };
  await assert.rejects(
    fetchPublicRecipeText("https://example.com", options),
    /公開されている/,
  );
  assert.equal(called, 1);
  assert.equal(closed, 1);
  await assert.rejects(
    fetchPublicRecipeText("https://example.com", {
      ...options,
      fetchImpl: async () =>
        new Response("x", {
          headers: {
            "Content-Type": "text/html",
            "Content-Length": 2 * 1024 * 1024,
          },
        }),
    }),
    /大きすぎ/,
  );
});

test("public recipe page preserves source and metadata extraction", async () => {
  const result = await fetchPublicRecipeText(
    "https://example.com/recipe#comment",
    {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      agentFactory: () => ({ close: async () => {} }),
      fetchImpl: async () =>
        new Response("<main><h1>スープ</h1><p>5分煮る</p></main>", {
          headers: { "Content-Type": "text/html;charset=utf-8" },
        }),
    },
  );
  assert.equal(result.source, "https://example.com/recipe");
  assert.match(result.text, /5分煮る/);
});
