import { z } from "zod";
import { normalizeWebsiteDomain } from "./project-validation";
import { MAX_COMPETITORS } from "./project-limits";
export const suggestionContextSchema = z.object({
  name: z.string().trim().max(100),
  domain: z.string().trim().max(253),
  industry: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  country: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(["fr", "en", "zh-CN"]),
  questions: z.array(z.string().trim().max(1000)).max(50),
  competitors: z
    .array(z.object({ name: z.string().trim().max(100), domain: z.string().trim().max(253) }))
    .max(MAX_COMPETITORS),
});
export type SuggestionContext = z.infer<typeof suggestionContextSchema>;
const resultSchema = z.object({
  questions: z.array(z.string().trim().min(5).max(1000)).max(10),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(100),
        domain: z.string().max(253).nullable(),
        reason: z.string().trim().min(5).max(300),
      }),
    )
    .max(8),
});
export type Suggestions = z.infer<typeof resultSchema>;
export function parseSuggestions(text: string | null): Suggestions | null {
  try {
    const data = resultSchema.parse(
      JSON.parse((text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "")),
    );
    const names = new Set<string>();
    return {
      questions: [...new Set(data.questions)],
      competitors: data.competitors
        .filter((c) => {
          const key = c.name.toLocaleLowerCase();
          if (names.has(key)) return false;
          names.add(key);
          return true;
        })
        .map((c) => ({ ...c, domain: c.domain ? normalizeWebsiteDomain(c.domain) : null })),
    };
  } catch {
    return null;
  }
}
