import { describe, test, expect, vi, afterEach } from "vitest";
import { MODELS, OPENROUTER_MODELS } from "../src/lib/provider-config";
import {
  parseResponse,
  callProvider,
  reserveMicros,
  instructions,
  MAX_OUTPUT,
  SEARCH_PRICING,
} from "../src/lib/providers";
// Synthetic fixtures only. Never seeded into an application database.
export const openaiFixture = {
  id: "fixture-response",
  model: "gpt-4.1-mini-2025-04-14",
  status: "completed",
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "Karburo est une option. Concurrent Test aussi.",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.com/fixture",
              title: "Synthetic citation",
            },
          ],
        },
      ],
    },
  ],
  usage: { input_tokens: 200, output_tokens: 100 },
};
describe("official API normalization with synthetic fixtures", () => {
  afterEach(() => vi.restoreAllMocks());
  const chatFixture = {
    id: "synthetic-chat",
    model: "kimi-k3.1-pro",
    provider: "Synthetic serving provider",
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: "Karburo et Gasoil Now.",
          reasoning_content: "Synthetic private reasoning mentioning a different brand",
        },
      },
    ],
    usage: {
      prompt_tokens: 200,
      completion_tokens: 100,
      completion_tokens_details: { reasoning_tokens: 60 },
      prompt_tokens_details: { cached_tokens: 50, cache_write_tokens: 100 },
      cost: 0.001234,
    },
  };
  test("Kimi counts the final answer only and preserves total reasoning-inclusive usage", () => {
    const result = parseResponse("kimi", chatFixture);
    expect(result.text).toBe("Karburo et Gasoil Now.");
    expect(result.status).toBe("succeeded");
    expect(result.output).toBe(100);
    expect(result.cachedInput).toBe(50);
    expect(result.reportedCostMicros).toBeNull();
    expect(result.citations).toEqual([]);
  });
  test("OpenRouter preserves the serving provider, returned model and reported cost including zero", () => {
    const result = parseResponse("openrouter", chatFixture);
    expect(result.servingProvider).toBe("Synthetic serving provider");
    expect(result.model).toBe("kimi-k3.1-pro");
    expect(result.reportedCostMicros).toBe(1234);
    expect(
      parseResponse("openrouter", { ...chatFixture, usage: { ...chatFixture.usage, cost: 0 } })
        .reportedCostMicros,
    ).toBe(0);
    expect(
      parseResponse("openrouter", { ...chatFixture, usage: undefined }).reportedCostMicros,
    ).toBeNull();
  });
  test("chat truncations, empty answers, refusals and unfinished tool calls are invalid", () => {
    for (const message of [
      { content: "" },
      { content: "No", refusal: "Refused" },
      { content: "Partial", tool_calls: [{}] },
    ])
      expect(
        parseResponse("kimi", { ...chatFixture, choices: [{ finish_reason: "stop", message }] })
          .status,
      ).toBe("invalid");
    expect(
      parseResponse("openrouter", {
        ...chatFixture,
        choices: [{ finish_reason: "length", message: { content: "Partial" } }],
      }).status,
    ).toBe("invalid");
    expect(() =>
      parseResponse("openrouter", { error: { message: "Synthetic upstream error" } }),
    ).toThrow();
    expect(() =>
      parseResponse("openrouter", { ...chatFixture, usage: { ...chatFixture.usage, cost: -1 } }),
    ).toThrow();
  });
  test("Kimi uses its documented fixed endpoint, reasoning budget and cache TTL", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(chatFixture)));
    await callProvider("kimi", "fixture-key-only", "Question?", "French");
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe("https://api.moonshot.ai/v1/chat/completions");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer fixture-key-only" });
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({
      model: "kimi-k3.1-pro",
      max_completion_tokens: 8192,
      reasoning_effort: "low",
      prompt_cache_options: { mode: "implicit", ttl: "5m" },
      messages: [
        { role: "system", content: "French" },
        { role: "user", content: "Question?" },
      ],
    });
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(options?.redirect).toBe("error");
    expect(reserveMicros("kimi", "Question?", "French")).toBeGreaterThan(8192 * MODELS.kimi.output);
  });
  test("OpenRouter fixes the selected model and bounds routing prices without model fallbacks", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(chatFixture)));
    await callProvider(
      "openrouter",
      "fixture-router-key",
      "Question?",
      "French",
      "baseline",
      "moonshotai/kimi-k3.1-pro",
    );
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({
      model: "moonshotai/kimi-k3.1-pro",
      max_tokens: 8192,
      reasoning: { effort: "low", exclude: true },
      provider: {
        require_parameters: true,
        max_price: { prompt: 2, completion: 10, request: 0 },
        data_collection: "deny",
      },
    });
    expect(body.models).toBeUndefined();
    expect(body.plugins).toEqual([{ id: "web", enabled: false }]);
    expect(
      reserveMicros(
        "openrouter",
        "Q?",
        "fr",
        "baseline",
        OPENROUTER_MODELS["moonshotai/kimi-k3.1-pro"],
      ),
    ).toBeGreaterThan(81920);
  });
  test("arbitrary model IDs are rejected before a paid request", async () => {
    const mock = vi.spyOn(globalThis, "fetch");
    await expect(
      callProvider("openrouter", "fixture-key", "Q?", "fr", "baseline", "openrouter/auto"),
    ).rejects.toThrow("model_configuration_changed");
    expect(mock).not.toHaveBeenCalled();
  });
  test("Kimi web uses Responses and keeps retrieved pages separate from answer citations", async () => {
    const fixture = {
      ...openaiFixture,
      model: MODELS.kimi.id,
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: {
            query: "synthetic query",
            sources: [
              { type: "url", url: "https://example.com/source", title: "Fixture" },
              { type: "url", url: "http://127.0.0.1/private" },
            ],
          },
        },
        ...openaiFixture.output,
      ],
      usage: { input_tokens: 200, output_tokens: 100, input_tokens_details: { cached_tokens: 50 } },
    };
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(fixture)));
    const result = await callProvider("kimi", "synthetic-key", "Question?", "French", "web");
    expect(mock.mock.calls[0][0]).toBe("https://api.moonshot.ai/v1/responses");
    const body = JSON.parse(mock.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      max_output_tokens: 8192,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      tool_choice: "auto",
    });
    expect(body.search_context_size).toBeUndefined();
    expect(body.max_tool_calls).toBeUndefined();
    expect(result.citations).toEqual([]);
    expect(result.grounding?.sources).toHaveLength(1);
    expect(result.grounding).toMatchObject({
      searched: true,
      toolCalls: 1,
      queries: ["synthetic query"],
    });
    expect(result.cachedInput).toBe(50);
    expect(reserveMicros("kimi", "Q?", "fr", "web")).toBeGreaterThan(
      reserveMicros("kimi", "Q?", "fr") + 5000,
    );
    expect(parseResponse("kimi", { ...fixture, status: "incomplete" }).status).toBe("invalid");
  });
  test("OpenRouter web pins the search engine and bounds the server loop, parses only structured citations", async () => {
    const fixture = {
      ...chatFixture,
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: "Karburo. https://invented.example",
            annotations: [
              {
                type: "url_citation",
                url_citation: { url: "https://example.com/source", title: "Fixture", end_index: 8 },
              },
              {
                type: "url_citation",
                url_citation: { url: "http://localhost/private", end_index: 8 },
              },
            ],
          },
        },
      ],
      usage: {
        ...chatFixture.usage,
        server_tool_use_details: { web_search_requests: 1 },
        cost: 0.008234,
      },
    };
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(fixture)));
    const result = await callProvider(
      "openrouter",
      "synthetic-key",
      "Q?",
      "fr",
      "web",
      "xiaomi/mimo-v2.6-pro",
    );
    const body = JSON.parse(mock.mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({
      model: "xiaomi/mimo-v2.6-pro",
      max_tool_calls: 1,
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            engine: "exa",
            mode: "fast",
            max_uses: 1,
            max_results: 3,
            max_total_results: 3,
            max_characters: 1500,
          },
        },
      ],
    });
    expect(result.reportedCostMicros).toBe(8234);
    expect(result.citations).toHaveLength(1);
    expect(result.grounding).toMatchObject({
      searched: true,
      toolCalls: 1,
      usageKnown: true,
      links: [{ end: 8, url: "https://example.com/source" }],
    });
    expect(
      parseResponse("openrouter", {
        ...fixture,
        usage: { prompt_tokens: 200, completion_tokens: 100 },
      }).grounding?.usageKnown,
    ).toBe(false);
  });
  test("Xiaomi MiMo accepts its own API key and normalizes web annotations and cached input", async () => {
    const fixture = {
      ...chatFixture,
      model: MODELS.mimo.id,
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: "Karburo",
            annotations: [
              { type: "url_citation", url: "https://example.com/mimo", title: "MiMo fixture" },
            ],
          },
        },
      ],
      usage: { ...chatFixture.usage, web_search_usage: { tool_usage: 1, page_usage: 3 } },
    };
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(fixture)));
    const result = await callProvider("mimo", "synthetic-xiaomi-key", "Q?", "fr", "web");
    expect(mock.mock.calls[0][0]).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    expect(mock.mock.calls[0][1]?.headers).toMatchObject({ "api-key": "synthetic-xiaomi-key" });
    expect(JSON.parse(mock.mock.calls[0][1]!.body as string)).toMatchObject({
      model: "mimo-v2.6-pro",
      max_completion_tokens: 1200,
      thinking: { type: "disabled" },
      tools: [{ type: "web_search", force_search: true, max_keyword: 1, limit: 3 }],
    });
    expect(result.servingProvider).toBe("Xiaomi");
    expect(result.cachedInput).toBe(50);
    expect(result.reportedCostMicros).toBeNull();
    expect(result.citations[0].provenance).toBe("mimo_web_search_annotation");
    expect(result.grounding?.toolCalls).toBe(1);
    expect(
      parseResponse("mimo", {
        ...fixture,
        choices: [
          {
            finish_reason: "stop",
            message: { content: "Partial", error_message: "Search not enabled" },
          },
        ],
      }).status,
    ).toBe("invalid");
  });
  test("MiMo's disabled Web Search error is classified without exposing provider text or retrying", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "400",
            message: "Param Incorrect synthetic-private-key",
            param: "web search tool found in the request body, but webSearchEnabled is false",
          },
        }),
        { status: 400 },
      ),
    );
    await expect(
      callProvider("mimo", "synthetic-private-key", "question", "system", "web"),
    ).rejects.toThrow(/^mimo_web_search_disabled$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("other, oversized and malformed MiMo errors stay generic and never leak upstream messages", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const body of [
      "not json synthetic-private-key",
      JSON.stringify({ error: { message: "Invalid parameter synthetic-private-key" } }),
      JSON.stringify({
        padding: "x".repeat(17000),
        error: {
          param: "web search tool found in the request body, but webSearchEnabled is false",
        },
      }),
    ]) {
      fetch.mockResolvedValueOnce(new Response(body, { status: 400 }));
      await expect(
        callProvider("mimo", "synthetic-private-key", "question", "system", "web"),
      ).rejects.toThrow(/^provider_http_400$/);
    }
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            param: "web search tool found in the request body, but webSearchEnabled is false",
          },
        }),
        { status: 400 },
      ),
    );
    await expect(
      callProvider("openrouter", "synthetic-private-key", "question", "system", "web"),
    ).rejects.toThrow(/^provider_http_400$/);
  });
  test("OpenAI preserves returned model, usage and structured citation", () => {
    const r = parseResponse("openai", openaiFixture);
    expect(r.status).toBe("succeeded");
    expect(r.model).toBe(openaiFixture.model);
    expect(r.input).toBe(200);
    expect(r.citations[0].provenance).toBe("openai_url_annotation");
  });
  test("truncations and refusals are not valid absences", () => {
    expect(parseResponse("openai", { ...openaiFixture, status: "incomplete" }).status).toBe(
      "invalid",
    );
    expect(
      parseResponse("openai", {
        ...openaiFixture,
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      }).status,
    ).toBe("invalid");
    expect(parseResponse("gemini", { promptFeedback: { blockReason: "SAFETY" } }).status).toBe(
      "invalid",
    );
  });
  test("Gemini ignores thoughts, includes thinking usage and parses grounding only", () => {
    const r = parseResponse("gemini", {
      modelVersion: "returned-model",
      responseId: "fixture-google",
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: "private reasoning", thought: true },
              { text: "Karburo and https://unverified.example" },
            ],
          },
          groundingMetadata: {
            groundingChunks: [{ web: { uri: "https://example.com/source", title: "Fixture" } }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 },
    });
    expect(r.status).toBe("succeeded");
    expect(r.output).toBe(25);
    expect(r.text).not.toContain("reasoning");
    expect(r.citations).toHaveLength(1);
  });
  test("missing usage is unknown and generated URLs are not citations", () => {
    const r = parseResponse("gemini", {
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: "See https://example.com" }] } },
      ],
    });
    expect(r.input).toBeNull();
    expect(r.output).toBeNull();
    expect(r.model).toBeNull();
    expect(r.citations).toEqual([]);
  });
  test("rejects malformed payloads", () => {
    expect(() =>
      parseResponse("openai", { ...openaiFixture, usage: { input_tokens: -1, output_tokens: 2 } }),
    ).toThrow();
  });
  test("uses fixed official endpoints, finite output, timeout and no redirects", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(openaiFixture), { status: 200 }));
    await callProvider("openai", "fixture-not-a-real-key", "Question?", instructions("fr", "FR"));
    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(opts?.redirect).toBe("error");
    expect(JSON.parse(opts?.body as string)).toMatchObject({
      max_output_tokens: MAX_OUTPUT,
      store: false,
    });
    expect(opts?.signal).toBeDefined();
  });
  test("HTTP errors are sanitized, with no automatic retry", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("secret token in upstream error", { status: 401 }));
    await expect(
      callProvider("gemini", "fixture-not-a-real-key", "Question?", "French"),
    ).rejects.toThrow("provider_http_401");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  test("reservation covers byte-based input upper estimate and bounded output", () => {
    expect(reserveMicros("openai", "été?", "fr")).toBeGreaterThan(MAX_OUTPUT * 1.6);
  });
  test("web search is explicit, bounded and absent from baseline payloads", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(openaiFixture)));
    await callProvider("openai", "fixture-key", "Question?", "French", "web");
    expect(JSON.parse(mock.mock.calls[0][1]!.body as string)).toMatchObject({
      tools: [{ type: "web_search", search_context_size: "low" }],
      max_tool_calls: 1,
      tool_choice: "required",
    });
    mock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Fixture" }] } }],
        }),
      ),
    );
    await callProvider("gemini", "fixture-key", "Question?", "French", "web");
    expect(JSON.parse(mock.mock.calls[1][1]!.body as string).tools).toEqual([
      { google_search: {} },
    ]);
    mock.mockResolvedValue(new Response(JSON.stringify(openaiFixture)));
    await callProvider("openai", "fixture-key", "Question?", "French");
    expect(JSON.parse(mock.mock.calls[2][1]!.body as string).tools).toBeUndefined();
  });
  test("grounded budgets include full paid search fees and conservative input allowance", () => {
    expect(reserveMicros("gemini", "Q?", "fr", "web") - reserveMicros("gemini", "Q?", "fr")).toBe(
      SEARCH_PRICING.gemini.toolMicros,
    );
    expect(reserveMicros("openai", "Q?", "fr", "web") - reserveMicros("openai", "Q?", "fr")).toBe(
      16_400,
    );
  });
  test("OpenAI structured citations retain their exact offsets and actual search invocation", () => {
    const fixture = structuredClone(openaiFixture);
    (fixture.output[0].content[0].annotations[0] as Record<string, unknown>).end_index = 7;
    const r = parseResponse("openai", {
      ...fixture,
      output: [{ type: "web_search_call", status: "completed" }, ...fixture.output],
    });
    expect(r.grounding).toMatchObject({
      searched: true,
      toolCalls: 1,
      links: [{ end: 7, url: "https://example.com/fixture" }],
    });
  });
  test("Gemini preserves search evidence and converts UTF-8 offsets without inventing citations", () => {
    const r = parseResponse("gemini", {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: "Été Karburo." }] },
          groundingMetadata: {
            webSearchQueries: ["fixture query"],
            searchEntryPoint: { renderedContent: "<div>Google fixture</div>" },
            groundingChunks: [
              { web: { uri: "https://example.com/source" } },
              { web: { uri: "http://127.0.0.1/secret" } },
            ],
            groundingSupports: [
              {
                segment: { endIndex: Buffer.byteLength("Été Karburo.") },
                groundingChunkIndices: [0, 1, 99],
              },
            ],
          },
        },
      ],
    });
    expect(r.grounding?.links).toEqual([
      { end: "Été Karburo.".length, url: "https://example.com/source", title: "example.com" },
    ]);
    expect(r.grounding?.toolCalls).toBe(1);
    expect(r.grounding?.searchEntryHtml).toContain("Google fixture");
    expect(r.citations).toHaveLength(1);
  });
});

test("OpenRouter mid-generation 429 retains safe retry hints without exposing the upstream message", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 429, message: "sensitive upstream content" } }),
        { status: 200, headers: { "retry-after": "120" } },
      ),
    );
  try {
    await expect(
      callProvider("openrouter", "synthetic-key", "Synthetic question", "Synthetic instructions"),
    ).rejects.toMatchObject({
      code: "provider_http_429",
      rateFeedback: { retryAfterMs: 120000 },
      message: "provider_http_429",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally {
    fetch.mockRestore();
  }
});
