export const METHODOLOGY = "explicit-mention-v1";
export function servingProvider(parameters?: Record<string, unknown>) {
  const execution = parameters?.execution;
  if (!execution || typeof execution !== "object") return null;
  const value = (execution as Record<string, unknown>).servingProvider;
  return typeof value === "string" && value.trim() ? value : null;
}
export function comparisonSignature(
  rows: {
    status: string;
    query_text: string;
    provider: string;
    returned_model: string | null;
    parameters?: Record<string, unknown>;
  }[],
) {
  if (
    !rows.length ||
    rows.some(
      (r) =>
        r.status !== "succeeded" ||
        !r.returned_model ||
        (r.provider === "openrouter" && !servingProvider(r.parameters)),
    )
  )
    return null;
  return JSON.stringify(
    rows
      .map((r) => [
        r.query_text,
        r.provider,
        r.returned_model,
        ...(r.provider === "openrouter" ? [servingProvider(r.parameters)] : []),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
export type Brand = { id: string; name: string; domain: string; is_primary?: boolean };
export function detectMentions(answer: string, brands: Brand[]) {
  return brands.flatMap((brand) => {
    for (const alias of [brand.name, brand.domain].filter(Boolean)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").exec(
        answer,
      );
      if (match)
        return [
          {
            brandId: brand.id,
            brandName: brand.name,
            matchedAlias: alias,
            excerpt: answer.slice(
              Math.max(0, match.index - 100),
              Math.min(answer.length, match.index + match[0].length + 160),
            ),
            sentiment: "not_classified",
          },
        ];
    }
    return [];
  });
}
export function mentionRate(mentioned: number, valid: number) {
  if (valid === 0) return { rate: null, low: null, high: null, n: 0 };
  if (mentioned < 0 || mentioned > valid) throw new Error("Invalid denominator");
  const p = mentioned / valid,
    z = 1.96,
    d = 1 + (z * z) / valid;
  const center = (p + (z * z) / (2 * valid)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / valid + (z * z) / (4 * valid * valid))) / d;
  return {
    rate: p * 100,
    low: Math.max(0, (center - half) * 100),
    high: Math.min(100, (center + half) * 100),
    n: valid,
  };
}
export function csvCell(value: unknown) {
  let s = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function toCsv(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0] ?? {});
  return (
    "\uFEFF" +
    [
      keys.map(csvCell).join(","),
      ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(",")),
    ].join("\r\n")
  );
}
