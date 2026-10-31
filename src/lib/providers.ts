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
export const MAX_OUTPUT = 1200;
export const PRICE_DATE = "2026-10-31";
export function instructions(language: string, country: string) {
  return `Answer the user's question in ${language === "fr" ? "French" : "English"}. The user is interested in the market ${country}. Be factual and indicate uncertainty. Do not invent sources. This is a fresh conversation.`;
}
export function reserveMicros(provider: Provider, query: string, system: string) {
  // UTF-8 byte count plus framing is a conservative text-token upper estimate.
  return Math.ceil(
    (Buffer.byteLength(query + system, "utf8") + 256) * MODELS[provider].input +
      MAX_OUTPUT * MODELS[provider].output,
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
      }
    : {
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
