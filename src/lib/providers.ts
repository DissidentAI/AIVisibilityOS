import { z } from "zod";
import { safePublicUrl } from "./security";
import { rateFeedback, type RateFeedback } from "./execution-policy";
import {
  MODELS,
  modelConfiguration,
  supportsWebSearch,
  requestEndpoint,
  type Provider,
  type ModelConfiguration,
} from "./provider-config";
export {
  PROVIDERS,
  MODELS,
  modelConfiguration,
  supportsWebSearch,
  type Provider,
} from "./provider-config";
export const MEASUREMENT_MODES = ["baseline", "web"] as const;
export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];
// Full paid rates: provider free allowances cannot be known across installations.
export const SEARCH_PRICING = {
  openai: { toolMicros: 10_000, contentTokens: 8_000, maxCalls: 1 },
  gemini: { toolMicros: 35_000, contentTokens: 0, maxCalls: 1 },
  kimi: { toolMicros: 5_000, contentTokens: 0, maxCalls: 1 },
  openrouter: { toolMicros: 7_000, contentTokens: 0, maxCalls: 1 },
  mimo: { toolMicros: 5_000, contentTokens: 0, maxCalls: 1 },
} as const;
export const MAX_OUTPUT = 1200;
export type Grounding = {
  searched: boolean;
  toolCalls: number;
  usageKnown?: boolean;
  queries: string[];
  searchEntryHtml: string | null;
  links: { end: number; url: string; title: string }[];
  // Retrieved pages are not necessarily cited in the answer. Never count them as citations.
  sources?: { url: string; domain: string; title: string; provenance: string }[];
};
export const PRICE_DATE = "2026-11-01";
export function instructions(language: string, country: string) {
  return `Answer the user's question in ${language === "fr" ? "French" : "English"}. The user is interested in the market ${country}. Be factual and indicate uncertainty. Do not invent sources. This is a fresh conversation.`;
}
export function reserveMicros(
  provider: Provider,
  query: string,
  system: string,
  mode: MeasurementMode = "baseline",
  model: ModelConfiguration = MODELS[provider],
) {
  if (mode === "web" && !supportsWebSearch(provider))
    throw new ProviderError("web_search_unsupported");
  const search = SEARCH_PRICING[provider];
  const web = mode === "web";
  // OpenRouter's server tool may run the model before and after the search.
  const modelCalls = web && provider === "openrouter" ? 2 : 1;
  // Retrieval context is variable. This is a documented reserve, not a provider invoice cap.
  const retrievalTokens = web && ["kimi", "mimo", "openrouter"].includes(provider) ? 32_000 : 0;
  // UTF-8 byte count plus framing is a conservative text-token upper estimate.
  return Math.ceil(
    (Buffer.byteLength(query + system, "utf8") + 256) * model.input * modelCalls +
      model.maxOutput * model.output * modelCalls +
      retrievalTokens * model.input +
      (mode === "web"
        ? search.toolMicros +
          // Conservatively cover reported usage plus a separate fixed search-content block.
          2 * search.contentTokens * model.input
        : 0),
  );
}
export type ProviderResult = {
  rateFeedback?: RateFeedback;
  status: "succeeded" | "invalid";
  text: string;
  model: string | null;
  requestId: string | null;
  input: number | null;
  output: number | null;
  raw: unknown;
  reportedCostMicros?: number | null;
  cachedInput?: number | null;
  servingProvider?: string | null;
  grounding?: Grounding;
  citations: { url: string; domain: string; title: string; provenance: string }[];
};
const count = z.number().int().nonnegative();
const openaiSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    status: z.string(),
    output: z.array(
      z
        .object({
          type: z.string(),
          action: z
            .object({
              query: z.string().optional(),
              queries: z.array(z.string()).optional(),
              sources: z
                .array(
                  z.object({ type: z.string(), url: z.string(), title: z.string().optional() }),
                )
                .optional(),
            })
            .passthrough()
            .optional(),
          content: z
            .array(
              z
                .object({
                  type: z.string(),
                  text: z.string().optional(),
                  annotations: z
                    .array(
                      z
                        .object({
                          type: z.string(),
                          url: z.string().optional(),
                          title: z.string().optional(),
                          end_index: count.optional(),
                        })
                        .passthrough(),
                    )
                    .optional(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    ),
    usage: z
      .object({
        input_tokens: count,
        output_tokens: count,
        input_tokens_details: z.object({ cached_tokens: count.optional() }).optional(),
      })
      .nullish(),
  })
  .passthrough();
const geminiSchema = z
  .object({
    modelVersion: z.string().optional(),
    responseId: z.string().optional(),
    candidates: z
      .array(
        z
          .object({
            finishReason: z.string().optional(),
            content: z
              .object({
                parts: z.array(
                  z
                    .object({ text: z.string().optional(), thought: z.boolean().optional() })
                    .passthrough(),
                ),
              })
              .optional(),
            groundingMetadata: z
              .object({
                webSearchQueries: z.array(z.string()).optional(),
                searchEntryPoint: z
                  .object({ renderedContent: z.string().max(200_000).optional() })
                  .optional(),
                groundingSupports: z
                  .array(
                    z.object({
                      segment: z
                        .object({
                          partIndex: count.optional(),
                          startIndex: count.optional(),
                          endIndex: count.optional(),
                          text: z.string().optional(),
                        })
                        .optional(),
                      groundingChunkIndices: z.array(count).optional(),
                    }),
                  )
                  .optional(),
                groundingChunks: z
                  .array(
                    z.object({
                      web: z.object({ uri: z.string(), title: z.string().optional() }).optional(),
                    }),
                  )
                  .optional(),
              })
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    usageMetadata: z
      .object({
        promptTokenCount: count.optional(),
        candidatesTokenCount: count.optional(),
        thoughtsTokenCount: count.optional(),
      })
      .optional(),
  })
  .passthrough();
function citation(url: string, title: string, provenance: string) {
  const valid = safePublicUrl(url);
  return valid ? [{ url: valid.href, domain: valid.hostname, title, provenance }] : [];
}
const chatSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    provider: z.string().max(200).optional(),
    choices: z.array(
      z.object({
        finish_reason: z.string().nullable(),
        message: z
          .object({
            content: z.string().nullish(),
            refusal: z.string().nullish(),
            tool_calls: z.array(z.unknown()).nullish(),
            error_message: z.string().nullish(),
            annotations: z
              .array(
                z
                  .object({
                    type: z.string(),
                    url: z.string().optional(),
                    title: z.string().optional(),
                    url_citation: z
                      .object({
                        url: z.string(),
                        title: z.string().optional(),
                        end_index: count.optional(),
                      })
                      .optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      }),
    ),
    usage: z
      .object({
        prompt_tokens: count.optional(),
        completion_tokens: count.optional(),
        cached_tokens: count.optional(),
        prompt_tokens_details: z
          .object({ cached_tokens: count.optional() })
          .passthrough()
          .nullish(),
        cost: z.number().finite().nonnegative().max(2000).nullish(),
        server_tool_use_details: z
          .object({ web_search_requests: count.optional() })
          .passthrough()
          .nullish(),
        web_search_usage: z
          .object({ tool_usage: count.optional(), page_usage: count.optional() })
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();
export function parseResponse(provider: Provider, data: unknown): ProviderResult {
  const kimiResponses =
    provider === "kimi" && typeof data === "object" && data !== null && "output" in data;
  if (!kimiResponses && (provider === "kimi" || provider === "openrouter" || provider === "mimo")) {
    const d = chatSchema.parse(data),
      choice = d.choices[0];
    const text = choice?.message.content ?? "";
    const annotations = choice?.message.annotations ?? [];
    const citations = annotations.flatMap((a) => {
      if (provider === "openrouter" && a.type === "url_citation" && a.url_citation)
        return citation(
          a.url_citation.url,
          a.url_citation.title ?? "",
          "openrouter_url_annotation",
        );
      if (provider === "mimo" && a.type === "url_citation" && a.url)
        return citation(a.url, a.title ?? "", "mimo_web_search_annotation");
      return [];
    });
    const searches =
      provider === "openrouter"
        ? d.usage?.server_tool_use_details?.web_search_requests
        : provider === "mimo"
          ? d.usage?.web_search_usage?.tool_usage
          : undefined;
    const cachedInput =
      d.usage?.prompt_tokens_details?.cached_tokens ?? d.usage?.cached_tokens ?? null;
    if (
      cachedInput != null &&
      d.usage?.prompt_tokens != null &&
      cachedInput > d.usage.prompt_tokens
    )
      throw new ProviderError("invalid_provider_payload");
    return {
      status:
        choice?.finish_reason === "stop" &&
        text.trim() &&
        !choice.message.refusal &&
        !choice.message.error_message &&
        !choice.message.tool_calls?.length
          ? "succeeded"
          : "invalid",
      text,
      model: d.model,
      requestId: d.id,
      input: d.usage?.prompt_tokens ?? null,
      // Chat Completions completion_tokens already includes reasoning; never add it again.
      output: d.usage?.completion_tokens ?? null,
      cachedInput,
      reportedCostMicros:
        provider === "openrouter" && d.usage?.cost != null ? Math.ceil(d.usage.cost * 1e6) : null,
      servingProvider:
        provider === "openrouter"
          ? (d.provider ?? null)
          : provider === "mimo"
            ? "Xiaomi"
            : "Moonshot AI",
      raw: data,
      // Missing usage must stay unknown for cost accounting, even when annotations exist.
      grounding:
        searches != null || citations.length
          ? {
              searched: (searches ?? 0) > 0 || citations.length > 0,
              toolCalls: searches ?? 0,
              usageKnown: searches != null,
              queries: [],
              searchEntryHtml: null,
              links:
                provider === "openrouter"
                  ? annotations.flatMap((a) => {
                      const c = a.type === "url_citation" ? a.url_citation : undefined;
                      const url = c && safePublicUrl(c.url);
                      return url && c?.end_index != null && c.end_index <= text.length
                        ? [{ end: c.end_index, url: url.href, title: c.title || url.hostname }]
                        : [];
                    })
                  : [],
            }
          : undefined,
      citations,
    };
  }
  if (provider === "openai" || kimiResponses) {
    const d = openaiSchema.parse(data);
    const cached = d.usage?.input_tokens_details?.cached_tokens;
    if (cached != null && d.usage && cached > d.usage.input_tokens)
      throw new ProviderError("invalid_provider_payload");
    const parts = d.output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    const text = parts
      .filter((p) => p.type === "output_text")
      .map((p) => p.text ?? "")
      .join("\n");
    const refused = parts.some((p) => p.type === "refusal");
    return {
      status: d.status === "completed" && text.trim() && !refused ? "succeeded" : "invalid",
      text,
      model: d.model,
      requestId: d.id,
      input: d.usage?.input_tokens ?? null,
      output: d.usage?.output_tokens ?? null,
      cachedInput: kimiResponses ? (d.usage?.input_tokens_details?.cached_tokens ?? null) : null,
      servingProvider: kimiResponses ? "Moonshot AI" : "OpenAI",
      raw: data,
      grounding: {
        searched: d.output.some((o) => o.type === "web_search_call"),
        toolCalls: d.output.filter((o) => o.type === "web_search_call").length,
        queries: [
          ...new Set(
            d.output
              .filter((o) => o.type === "web_search_call")
              .flatMap((o) => o.action?.queries ?? (o.action?.query ? [o.action.query] : [])),
          ),
        ],
        searchEntryHtml: null,
        sources: kimiResponses
          ? d.output
              .filter((o) => o.type === "web_search_call")
              .flatMap((o) =>
                (o.action?.sources ?? []).flatMap((s) =>
                  s.type === "url" ? citation(s.url, s.title ?? "", "kimi_search_result") : [],
                ),
              )
          : undefined,
        links: kimiResponses
          ? []
          : parts.flatMap((p, i) =>
              (p.annotations ?? []).flatMap((a) => {
                const url = a.url && safePublicUrl(a.url);
                const end = a.end_index;
                if (a.type !== "url_citation" || !url || end == null || end > (p.text ?? "").length)
                  return [];
                const offset = parts
                  .slice(0, i)
                  .filter((x) => x.type === "output_text")
                  .reduce((sum, x) => sum + (x.text ?? "").length + 1, 0);
                return [{ end: offset + end, url: url.href, title: a.title || url.hostname }];
              }),
            ),
      },
      citations: kimiResponses
        ? []
        : parts.flatMap((p) =>
            (p.annotations ?? []).flatMap((a) =>
              a.type === "url_citation" && a.url
                ? citation(a.url, a.title ?? "", "openai_url_annotation")
                : [],
            ),
          ),
    };
  }
  const d = geminiSchema.parse(data),
    c = d.candidates?.[0];
  const text = (c?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("\n");
  const grounding = c?.groundingMetadata;
  const visibleParts = (c?.content?.parts ?? []).filter((p) => !p.thought);
  return {
    status: c?.finishReason === "STOP" && text.trim() ? "succeeded" : "invalid",
    text,
    model: d.modelVersion ?? null,
    requestId: d.responseId ?? null,
    input: d.usageMetadata?.promptTokenCount ?? null,
    output:
      d.usageMetadata?.candidatesTokenCount == null
        ? null
        : d.usageMetadata.candidatesTokenCount + (d.usageMetadata.thoughtsTokenCount ?? 0),
    raw: data,
    grounding: {
      searched: !!(grounding?.webSearchQueries?.length || grounding?.groundingChunks?.length),
      toolCalls: grounding?.webSearchQueries?.length || grounding?.groundingChunks?.length ? 1 : 0,
      queries: grounding?.webSearchQueries ?? [],
      searchEntryHtml: grounding?.searchEntryPoint?.renderedContent ?? null,
      links: (grounding?.groundingSupports ?? []).flatMap((s) => {
        const part = c?.content?.parts?.[s.segment?.partIndex ?? 0];
        if (!part || part.thought || s.segment?.endIndex == null) return [];
        // Gemini segment offsets are UTF-8 bytes within the referenced part.
        const bytes = Buffer.from(part.text ?? "", "utf8");
        if (s.segment.endIndex > bytes.length) return [];
        const offset = visibleParts
          .slice(0, visibleParts.indexOf(part))
          .reduce((sum, p) => sum + (p.text ?? "").length + 1, 0);
        const end = offset + bytes.subarray(0, s.segment.endIndex).toString("utf8").length;
        return (s.groundingChunkIndices ?? []).flatMap((i) => {
          const web = grounding?.groundingChunks?.[i]?.web;
          const url = web && safePublicUrl(web.uri);
          return url ? [{ end, url: url.href, title: web?.title || url.hostname }] : [];
        });
      }),
    },
    citations: (c?.groundingMetadata?.groundingChunks ?? []).flatMap((g) =>
      g.web ? citation(g.web.uri, g.web.title ?? "", "gemini_grounding_metadata") : [],
    ),
  };
}
export class ProviderError extends Error {
  constructor(
    public code: string,
    public rateFeedback?: RateFeedback,
  ) {
    super(code);
  }
}
export function requestOptions(
  provider: Provider,
  mode: MeasurementMode,
  model: ModelConfiguration = MODELS[provider],
) {
  if (mode === "web" && !supportsWebSearch(provider))
    throw new ProviderError("web_search_unsupported");
  if (provider === "kimi" && mode === "web")
    return {
      model: model.id,
      stream: false,
      max_output_tokens: model.maxOutput,
      reasoning: { effort: "low" },
      prompt_cache_options: { mode: "implicit", ttl: "5m" },
      tools: [{ type: "web_search", search_content_types: ["text"] }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
    };
  if (provider === "mimo")
    return {
      model: model.id,
      stream: false,
      max_completion_tokens: model.maxOutput,
      thinking: { type: "disabled" },
      temperature: 0.7,
      ...(mode === "web"
        ? { tools: [{ type: "web_search", force_search: true, max_keyword: 1, limit: 3 }] }
        : {}),
    };
  return provider === "openai"
    ? {
        model: MODELS.openai.id,
        max_output_tokens: MAX_OUTPUT,
        temperature: 0.7,
        store: false,
        ...(mode === "web"
          ? {
              tools: [{ type: "web_search", search_context_size: "low" }],
              max_tool_calls: 1,
              tool_choice: "required",
            }
          : {}),
      }
    : provider === "gemini"
      ? {
          ...(mode === "web" ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            maxOutputTokens: MAX_OUTPUT,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }
      : {
          model: model.id,
          stream: false,
          ...(provider === "kimi"
            ? {
                max_completion_tokens: model.maxOutput,
                reasoning_effort: "low",
                prompt_cache_options: { mode: "implicit", ttl: "5m" },
              }
            : {
                max_tokens: model.maxOutput,
                ...(model.reasoning === "low"
                  ? { reasoning: { effort: "low", exclude: true } }
                  : {
                      temperature: 0.7,
                      ...(model.reasoning === "disabled" ? { reasoning: { enabled: false } } : {}),
                    }),
                provider: {
                  require_parameters: true,
                  allow_fallbacks: true,
                  data_collection: "deny",
                  max_price: { prompt: model.input, completion: model.output, request: 0 },
                },
                // Do not inherit an account's web plugin into baseline measurements.
                plugins: [{ id: "web", enabled: false }],
                ...(mode === "web"
                  ? {
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
                      max_tool_calls: 1,
                    }
                  : {}),
              }),
        };
}
export async function callProvider(
  provider: Provider,
  key: string,
  query: string,
  system: string,
  mode: MeasurementMode = "baseline",
  modelId = MODELS[provider].id,
): Promise<ProviderResult> {
  const model = modelConfiguration(provider, modelId);
  if (!model) throw new ProviderError("model_configuration_changed");
  if (mode === "web" && !supportsWebSearch(provider))
    throw new ProviderError("web_search_unsupported");
  const body = {
    ...requestOptions(provider, mode, model),
    ...(provider === "openai" || (provider === "kimi" && mode === "web")
      ? { instructions: system, input: query }
      : provider === "gemini"
        ? {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: query }] }],
          }
        : {
            messages: [
              { role: "system", content: system },
              { role: "user", content: query },
            ],
          }),
  };
  let response: Response;
  try {
    response = await fetch(requestEndpoint(provider, mode, model), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provider === "gemini"
          ? { "x-goog-api-key": key }
          : provider === "mimo"
            ? { "api-key": key }
            : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(model.reasoning === "low" ? 90_000 : 60_000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError("network_or_timeout");
  }
  if (!response.ok) {
    if (provider === "mimo" && response.status === 400) {
      // Inspect only this known capability rejection. Never expose upstream text,
      // which can echo a key or a user's prompt, and bound even an error response.
      const reader = response.body?.getReader();
      try {
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 16_384) break;
            chunks.push(value);
          }
          if (size <= 16_384) {
            const error = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.error;
            if (
              error?.param ===
              "web search tool found in the request body, but webSearchEnabled is false"
            )
              throw new ProviderError("mimo_web_search_disabled");
          }
        }
      } catch (error) {
        if (error instanceof ProviderError && error.code === "mimo_web_search_disabled")
          throw error;
      } finally {
        await reader?.cancel().catch(() => {});
      }
      throw new ProviderError("provider_http_400");
    }
    await response.body?.cancel();
    throw new ProviderError(
      `provider_http_${response.status}`,
      rateFeedback(provider, response.headers),
    );
  }
  // Bound responses without logging provider payloads or credentials.
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError("empty_body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new ProviderError("response_too_large");
    }
    chunks.push(value);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ProviderError("invalid_provider_payload");
  }
  // OpenRouter can return a non-streaming error envelope after HTTP 200.
  // Preserve only the documented numeric status; upstream messages may contain secrets.
  const envelope = z
    .object({ error: z.object({ code: z.union([z.literal(429), z.literal(503)]) }) })
    .safeParse(payload);
  if (provider === "openrouter" && envelope.success)
    throw new ProviderError(
      `provider_http_${envelope.data.error.code}`,
      rateFeedback(provider, response.headers),
    );
  try {
    return {
      ...parseResponse(provider, payload),
      rateFeedback: rateFeedback(provider, response.headers),
    };
  } catch {
    throw new ProviderError("invalid_provider_payload");
  }
}
