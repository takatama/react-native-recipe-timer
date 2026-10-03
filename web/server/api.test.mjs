import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "./index.mjs";
import { GeminiClient } from "./gemini.mjs";

async function withApp(options, callback) {
  const server = createApp({ apiKey: "", ...options }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    await callback(request, base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("capabilities hides key and non-AI text import works with no configuration", async () => {
  await withApp({}, async (request, origin) => {
    const capabilities = await request("/api/capabilities");
    assert.deepEqual(await capabilities.json(), {
      ai: false,
      model: "gemini-3.8-flash",
    });
    const response = await request(
      "/api/import",
      { text: "ゆで卵\n5分ゆでる\n殻をむく" },
      { Origin: origin },
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.method, "text");
    assert.equal(result.recipe.steps.length, 2);
    assert.equal(result.recipe.steps[1].durationSec, 60);
  });
});

test("AI ask and AI photo return honest no-key errors without requests", async () => {
  let called = 0;
  await withApp(
    {
      ai: {
        ask: async () => {
          called++;
        },
        importRecipe: async () => {
          called++;
        },
      },
    },
    async (request) => {
      const ask = await request("/api/ask", {
        question: "次は何をする？",
        context: {},
      });
      assert.equal(ask.status, 503);
      assert.match((await ask.json()).error, /GEMINI_API_KEY/);
      const photo = await request("/api/import", {
        image: { mimeType: "image/png", data: "YWJjZA==" },
        useAI: true,
      });
      assert.equal(photo.status, 503);
      assert.equal(called, 0);
    },
  );
});

test("third-party origins, opaque origins, and cross-site browsers cannot use local API", async () => {
  await withApp({}, async (request, base) => {
    for (const headers of [
      { Origin: "https://attacker.example" },
      { Origin: "null" },
      { "Sec-Fetch-Site": "cross-site" },
    ]) {
      const response = await request(
        "/api/import",
        { text: "1分混ぜる" },
        headers,
      );
      assert.equal(response.status, 403, JSON.stringify(headers));
    }
    const status = await new Promise((resolve, reject) => {
      const raw = http.get(
        `${base}/api/capabilities`,
        { headers: { Host: "attacker.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      raw.on("error", reject);
    });
    assert.equal(status, 403);
  });
});

test("malformed schema and image opt-in are rejected before any AI call", async () => {
  await withApp({}, async (request) => {
    for (const body of [
      {},
      { text: "1分混ぜる", url: "https://example.com" },
      { text: "abc", useAI: "true" },
      { image: { mimeType: "text/html", data: "YWJjZA==" }, useAI: true },
      { image: { mimeType: "image/png", data: "notbase64" }, useAI: true },
      { image: { mimeType: "image/png", data: "YWJjZA==" } },
    ]) {
      assert.equal((await request("/api/import", body)).status, 400);
    }
  });
});

test("rate limit caps repeated work and daily AI cap stops paid path", async () => {
  await withApp({ rateLimit: 1 }, async (request) => {
    assert.equal(
      (await request("/api/import", { text: "1分混ぜる" })).status,
      200,
    );
    assert.equal(
      (await request("/api/import", { text: "1分混ぜる" })).status,
      429,
    );
  });
  let calls = 0;
  await withApp(
    {
      apiKey: "test-only-key",
      dailyLimit: 1,
      ai: {
        ask: async () => {
          calls++;
          return { answer: "テスト回答" };
        },
      },
    },
    async (request) => {
      assert.equal(
        (await request("/api/ask", { question: "次は？", context: {} })).status,
        200,
      );
      assert.equal(
        (await request("/api/ask", { question: "次は？", context: {} })).status,
        429,
      );
      assert.equal(calls, 1);
    },
  );
});

test("URL import keeps source and warning in resulting draft", async () => {
  await withApp(
    {
      importUrl: async () => ({
        text: "スープ\n2分煮る\n皿に盛る",
        source: "https://example.com/recipe",
        warnings: ["本文から抽出"],
      }),
    },
    async (request) => {
      const response = await request("/api/import", {
        url: "https://example.com/recipe",
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.recipe.source, "https://example.com/recipe");
      assert.ok(result.warnings.includes("本文から抽出"));
    },
  );
});

const draft = {
  name: "卵スープ",
  description: "確認用",
  servings: 2,
  ingredients: [{ name: "卵", amount: "1個" }],
  steps: [
    {
      title: "混ぜる",
      detail: "卵を混ぜる",
      durationSec: 60,
      estimated: true,
      kind: "hands",
      resource: "none",
      dependsOn: [],
    },
  ],
  warnings: [],
};
const aiResponse = (object) =>
  new Response(
    JSON.stringify({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(object) }],
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );

test("Gemini REST stub verifies current schema, server-only key, image and explicit estimates", async () => {
  const client = new GeminiClient({
    apiKey: "test-only-key",
    fetchImpl: async (url, request) => {
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/interactions",
      );
      assert.equal(request.headers["x-goog-api-key"], "test-only-key");
      const body = JSON.parse(request.body);
      assert.equal(body.model, "gemini-3.8-flash");
      assert.equal(body.store, false);
      assert.equal(body.generation_config.max_output_tokens, 8192);
      assert.equal(body.response_format.mime_type, "application/json");
      const transmittedSchema = body.response_format.schema;
      assert.equal(
        JSON.stringify(transmittedSchema).includes('"minLength"'),
        false,
      );
      assert.equal(
        JSON.stringify(transmittedSchema).includes('"maxLength"'),
        false,
      );
      assert.equal(
        JSON.stringify(transmittedSchema).includes('"$schema"'),
        false,
      );
      assert.equal(transmittedSchema.properties.name.type, "string");
      assert.equal(transmittedSchema.additionalProperties, false);
      assert.equal(transmittedSchema.properties.steps.maxItems, 60);
      assert.equal(
        transmittedSchema.properties.steps.items.properties.durationSec.minimum,
        1,
      );
      assert.deepEqual(body.input[1], {
        type: "image",
        data: "YWJjZA==",
        mime_type: "image/png",
      });
      return aiResponse(draft);
    },
  });
  const result = await client.importRecipe({
    image: { mimeType: "image/png", data: "YWJjZA==" },
  });
  assert.equal(result.method, "ai");
  assert.match(result.recipe.steps[0].detail, /AI の推定/);
  assert.match(result.warnings.join(" "), /確認用の下書き/);
  assert.ok(!JSON.stringify(result).includes("test-only-key"));
});

test("Gemini rejects malformed or cyclic model drafts rather than running timers", async () => {
  const badObjects = [
    { ...draft, name: "x".repeat(101) },
    { ...draft, steps: [{ ...draft.steps[0], dependsOn: [0] }] },
    { ...draft, steps: [{ ...draft.steps[0], durationSec: -1 }] },
  ];
  for (const object of badObjects) {
    const client = new GeminiClient({
      apiKey: "test-only-key",
      fetchImpl: async () => aiResponse(object),
    });
    await assert.rejects(
      client.importRecipe({ text: "卵を混ぜる" }),
      (error) => error.status === 502,
    );
  }
});

test("unreadable image can honestly return no steps instead of inventing a recipe", async () => {
  const client = new GeminiClient({
    apiKey: "test-only-key",
    fetchImpl: async () =>
      aiResponse({ ...draft, steps: [], warnings: ["写真が読めません"] }),
  });
  await assert.rejects(
    client.importRecipe({ image: { mimeType: "image/png", data: "YWJjZA==" } }),
    (error) => error.status === 422 && /読み取れません/.test(error.message),
  );
});

test("AI request concurrency remains bounded while first request is pending", async () => {
  let release;
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await withApp(
    {
      apiKey: "test-only-key",
      ai: {
        ask: async () => {
          entered();
          await pending;
          return { answer: "回答" };
        },
      },
    },
    async (request) => {
      const first = request("/api/ask", { question: "次は？", context: {} });
      await ready;
      assert.equal(
        (await request("/api/ask", { question: "次は？", context: {} })).status,
        429,
      );
      release();
      assert.equal((await first).status, 200);
    },
  );
});
