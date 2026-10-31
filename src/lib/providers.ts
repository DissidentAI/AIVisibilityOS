import { z } from "zod";
import { safePublicUrl } from "./security";
export const PROVIDERS = ["openai", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];
// USD / million tokens, captured 2026-10-31. Estimates, not billing invoices.
export const MODELS = {
  openai: {
    id: "gpt-4.1-mini-2025-04-14",
    input: 0.4,
    output: 1.6,
    endpoint: "https://api.openai.com/v1/responses",
  },
  gemini: {
    id: "gemini-2.5-flash-lite",
    input: 0.1,
    output: 0.4,
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
  },
} as const;
export const MEASUREMENT_MODES = ["baseline", "web"] as const;
export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];
// Full paid rates: provider free allowances cannot be known across installations.
export const SEARCH_PRICING = {
  openai: { toolMicros: 10_000, contentTokens: 8_000, maxCalls: 1 },
  gemini: { toolMicros: 35_000, contentTokens: 0, maxCalls: 1 },
} as const;
export const MAX_OUTPUT = 1200;
export type Grounding = {
  searched: boolean;
  toolCalls: number;
  queries: string[];
  searchEntryHtml: string | null;
  links: { end: number; url: string; title: string }[];
};
export const PRICE_DATE = "2026-10-31";
export function instructions(language: string, country: string) {
  return `Answer the user's question in ${language === "fr" ? "French" : "English"}. The user is interested in the market ${country}. Be factual and indicate uncertainty. Do not invent sources. This is a fresh conversation.`;
}
export function reserveMicros(
  provider: Provider,
  query: string,
  system: string,
  mode: MeasurementMode = "baseline",
) {
  // UTF-8 byte count plus framing is a conservative text-token upper estimate.
  return Math.ceil(
    (Buffer.byteLength(query + system, "utf8") + 256) * MODELS[provider].input +
      MAX_OUTPUT * MODELS[provider].output +
      (mode === "web"
        ? SEARCH_PRICING[provider].toolMicros +
          // Conservatively cover reported usage plus a separate fixed search-content block.
          2 * SEARCH_PRICING[provider].contentTokens * MODELS[provider].input
        : 0),
  );
}
export type ProviderResult = {
  status: "succeeded" | "invalid";
  text: string;
  model: string | null;
  requestId: string | null;
  input: number | null;
  output: number | null;
  raw: unknown;
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
            .object({ query: z.string().optional(), queries: z.array(z.string()).optional() })
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
    usage: z.object({ input_tokens: count, output_tokens: count }).nullish(),
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
export function parseResponse(provider: Provider, data: unknown): ProviderResult {
  if (provider === "openai") {
    const d = openaiSchema.parse(data);
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
        links: parts.flatMap((p, i) =>
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
      citations: parts.flatMap((p) =>
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
  constructor(public code: string) {
    super(code);
  }
}
export async function callProvider(
  provider: Provider,
  key: string,
  query: string,
  system: string,
  mode: MeasurementMode = "baseline",
): Promise<ProviderResult> {
  const openai = provider === "openai";
  const body = openai
    ? {
        model: MODELS.openai.id,
        instructions: system,
        input: query,
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
    : {
        ...(mode === "web" ? { tools: [{ google_search: {} }] } : {}),
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: query }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
  let response: Response;
  try {
    response = await fetch(MODELS[provider].endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(openai ? { Authorization: `Bearer ${key}` } : { "x-goog-api-key": key }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError("network_or_timeout");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(`provider_http_${response.status}`);
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
  try {
    return parseResponse(provider, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new ProviderError("invalid_provider_payload");
  }
}
