import express from "express";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  fetchPublicRecipeText,
  parseTextRecipe,
  UserError,
} from "./importer.mjs";
import { GeminiClient } from "./gemini.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const imageSchema = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    data: z
      .string()
      .min(4)
      .max(5_592_408)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.data.length % 4 !== 0 ||
      Buffer.from(value.data, "base64").length > 4 * 1024 * 1024
    )
      context.addIssue({ code: "custom", message: "Invalid image size" });
  });
const importSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000).optional(),
    url: z.string().trim().min(1).max(2048).optional(),
    image: imageSchema.optional(),
    useAI: z.boolean().default(false),
  })
  .strict()
  .refine(
    (body) =>
      Number(Boolean(body.text)) +
        Number(Boolean(body.url)) +
        Number(Boolean(body.image)) ===
      1,
  );
const askSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    context: z.unknown(),
  })
  .strict()
  .refine((body) => JSON.stringify(body.context ?? null).length <= 20_000);

const loopback = (address) =>
  address === "127.0.0.1" ||
  address === "::1" ||
  address === "::ffff:127.0.0.1";
const localHost = (hostname) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export function createApp(options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? "";
  const model = options.model ?? process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  const ai = options.ai ?? new GeminiClient({ apiKey, model });
  const importUrl = options.importUrl ?? fetchPublicRecipeText;
  const app = express();
  app.disable("x-powered-by");
  const limit = options.rateLimit ?? 6;
  const dailyLimit =
    options.dailyLimit ??
    Math.max(
      1,
      Math.min(1000, Number(process.env.AI_DAILY_REQUEST_LIMIT) || 50),
    );
  let requests = [];
  let active = 0;
  let aiDay = new Date().toISOString().slice(0, 10);
  let aiCount = 0;

  app.use("/api", (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    let host;
    try {
      host = new URL(`http://${request.headers.host}`);
    } catch {
      return response
        .status(403)
        .json({ error: "このアプリから操作してください。" });
    }
    if (
      !loopback(request.socket.remoteAddress) ||
      !localHost(host.hostname) ||
      request.headers["sec-fetch-site"] === "cross-site"
    )
      return response
        .status(403)
        .json({ error: "このアプリから操作してください。" });
    if (request.headers.origin) {
      let origin;
      try {
        origin = new URL(request.headers.origin);
      } catch {
        return response
          .status(403)
          .json({ error: "このアプリから操作してください。" });
      }
      if (
        origin.origin !== `http://${request.headers.host}` ||
        !localHost(origin.hostname)
      )
        return response
          .status(403)
          .json({ error: "このアプリから操作してください。" });
    }
    next();
  });
  app.use("/api", express.json({ limit: "6mb", strict: true }));
  app.get("/api/capabilities", (_request, response) =>
    response.json({ ai: Boolean(apiKey), model }),
  );
  app.use("/api", (request, response, next) => {
    if (request.method !== "POST") return next();
    if (!request.is("application/json"))
      return response
        .status(415)
        .json({ error: "JSON 形式の入力を送信してください。" });
    const now = Date.now();
    requests = requests.filter((time) => now - time < 60_000);
    if (requests.length >= limit) {
      response.setHeader("Retry-After", "60");
      return response
        .status(429)
        .json({ error: "操作が続いています。1 分待ってから試してください。" });
    }
    requests.push(now);
    next();
  });

  const exclusive = (handler) => async (request, response) => {
    if (active >= 1)
      throw new UserError(
        "読み取り中です。完了してから次の操作を行ってください。",
        429,
      );
    active++;
    try {
      await handler(request, response);
    } finally {
      active--;
    }
  };

  function chargeAI() {
    if (!apiKey)
      throw new UserError(
        "AI が未設定です。サーバーに GEMINI_API_KEY を設定してください。",
        503,
      );
    const today = new Date().toISOString().slice(0, 10);
    if (today !== aiDay) {
      aiDay = today;
      aiCount = 0;
    }
    if (aiCount >= dailyLimit)
      throw new UserError(
        "今日の AI リクエスト上限に達しました。文章の読み取りは利用できます。",
        429,
      );
    aiCount++;
  }

  app.post(
    "/api/import",
    exclusive(async (request, response) => {
      const parsed = importSchema.safeParse(request.body);
      if (!parsed.success)
        throw new UserError(
          "文章・URL・写真のいずれか 1 つを入力してください。文章は 2 万文字、写真は 4 MB 以内です。",
        );
      const body = parsed.data;
      if (body.image && !body.useAI)
        throw new UserError("写真を読み取るには AI を有効にしてください。");
      if (body.useAI && !apiKey) chargeAI();
      const extracted = body.url
        ? await importUrl(body.url)
        : { text: body.text, warnings: [] };
      let result;
      if (body.useAI) {
        chargeAI();
        result = await ai.importRecipe({ ...extracted, image: body.image });
      } else result = parseTextRecipe(extracted.text, extracted.source);
      response.json({
        ...result,
        warnings: [...(extracted.warnings || []), ...result.warnings],
      });
    }),
  );
  app.post(
    "/api/ask",
    exclusive(async (request, response) => {
      const parsed = askSchema.safeParse(request.body);
      if (!parsed.success)
        throw new UserError(
          "質問は 1000 文字以内、料理の文脈は 2 万文字以内で入力してください。",
        );
      chargeAI();
      response.json(await ai.ask(parsed.data));
    }),
  );
  app.use("/api", (_request, response) =>
    response.status(404).json({ error: "この操作は見つかりませんでした。" }),
  );
  app.use((error, _request, response, _next) => {
    if (error instanceof UserError)
      return response.status(error.status).json({ error: error.message });
    if (error.type === "entity.too.large")
      return response
        .status(413)
        .json({
          error: "入力が大きすぎます。写真を 4 MB 以内にしてください。",
        });
    if (error.type === "entity.parse.failed")
      return response
        .status(400)
        .json({ error: "入力を読み取れませんでした。" });
    response
      .status(500)
      .json({
        error: "読み取り中に問題が起きました。もう一度試してください。",
      });
  });
  return app;
}

export async function startServer({
  production = process.argv.includes("--production"),
} = {}) {
  const envPath = resolve(webRoot, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const app = createApp();
  const port = Number(process.env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  if (production) {
    const dist = resolve(webRoot, "dist");
    if (!existsSync(resolve(dist, "index.html")))
      throw new Error("Build the app with npm run build before npm run start.");
    app.use(express.static(dist));
    app.get("/{*path}", (_request, response) =>
      response.sendFile(resolve(dist, "index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: webRoot,
      server: { middlewareMode: true, hmr: { host: "127.0.0.1" } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  return await new Promise((resolveServer, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`KitchenFlow: http://127.0.0.1:${port}`);
      resolveServer(server);
    });
    server.once("error", reject);
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startServer().catch(() => {
    console.error(
      "KitchenFlow を起動できませんでした。ポートとビルドを確認してください。",
    );
    process.exitCode = 1;
  });
}
