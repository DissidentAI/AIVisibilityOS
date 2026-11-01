import { z } from "zod";
import { safePublicUrl } from "./public-url";
import { AppError } from "./errors";

/** Accept a pasted website address, but store only its validated hostname. Never fetch it. */
export function normalizeWebsiteDomain(value: string): string | null {
  const input = value.trim();
  if (!input || input.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(input)) return null;
  try {
    const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
      ? input
      : input.startsWith("//")
        ? `https:${input}`
        : `https://${input}`;
    const url = safePublicUrl(address);
    if (!url || url.hostname.length > 253) return null;
    if (
      !url.hostname
        .split(".")
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    )
      return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

const brandName = z.string().trim().min(2, "brand_name").max(100, "brand_name");
const domain = z.string().transform((value, ctx) => {
  const normalized = normalizeWebsiteDomain(value);
  if (normalized) return normalized;
  ctx.addIssue({ code: "custom", message: "public_domain" });
  return z.NEVER;
});
export const brandSchema = z.object({ name: brandName, domain });
const competitors = z.array(brandSchema).max(10, "competitors_count").default([]);
export const projectDetailsSchema = z.object({
  name: brandName,
  domain,
  industry: z.string().trim().min(2, "industry_length").max(120, "industry_length"),
  language: z.enum(["fr", "en"], { error: "language_selection" }),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "country_code"),
});
function checkBrandNames(
  p: { name: string; competitors: { name: string }[] },
  ctx: z.RefinementCtx,
) {
  const seen = new Set([p.name.toLowerCase()]);
  p.competitors.forEach((brand, index) => {
    const key = brand.name.toLowerCase();
    if (seen.has(key))
      ctx.addIssue({
        code: "custom",
        path: ["competitors", index, "name"],
        message: "duplicate_brand",
      });
    seen.add(key);
  });
}
export const projectCompetitorsSchema = z
  .object({ name: brandName, competitors })
  .superRefine(checkBrandNames);
export const projectSchema = z
  .object({
    ...projectDetailsSchema.shape,
    competitors,
    queries: z
      .array(z.string().trim().min(5, "query_length").max(1000, "query_length"))
      .min(1, "queries_count")
      .max(50, "queries_count"),
  })
  .superRefine((p, ctx) => {
    checkBrandNames(p, ctx);
    const seen = new Set<string>();
    p.queries.forEach((query, index) => {
      if (seen.has(query))
        ctx.addIssue({ code: "custom", path: ["queries", index], message: "duplicate_query" });
      seen.add(query);
    });
  });

const issueCodes = [
  "brand_name",
  "public_domain",
  "industry_length",
  "language_selection",
  "country_code",
  "competitors_count",
  "query_length",
  "queries_count",
  "duplicate_brand",
  "duplicate_query",
  "invalid_value",
] as const;
export type ProjectIssue = { field: string; code: (typeof issueCodes)[number] };
export function projectIssues(error: z.ZodError): ProjectIssue[] {
  // Return rule identifiers and field paths only, never submitted values or raw error objects.
  return error.issues.slice(0, 60).map((issue) => ({
    field: issue.path.join("."),
    code: issueCodes.includes(issue.message as ProjectIssue["code"])
      ? (issue.message as ProjectIssue["code"])
      : "invalid_value",
  }));
}
export function isProjectIssue(value: unknown): value is ProjectIssue {
  if (!value || typeof value !== "object") return false;
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.field === "string" &&
    /^(|name|domain|industry|country|language|competitors(?:\.\d+\.(?:name|domain))?|queries(?:\.\d+)?)$/.test(
      issue.field,
    ) &&
    issueCodes.includes(issue.code as ProjectIssue["code"])
  );
}
export class ProjectValidationError extends AppError {
  readonly issues: ProjectIssue[];
  constructor(error: z.ZodError) {
    super("invalid_input");
    this.issues = projectIssues(error);
  }
}
export function projectIssueStep(issue: ProjectIssue) {
  return issue.field.startsWith("competitors") ? 2 : issue.field.startsWith("queries") ? 3 : 1;
}
export function projectIssueMessage(issue: ProjectIssue, t: (fr: string, en: string) => string) {
  const messages: Record<ProjectIssue["code"], string> = {
    brand_name: t(
      "Le nom doit contenir de 2 à 100 caractères.",
      "Use a name between 2 and 100 characters.",
    ),
    public_domain: t(
      "Saisissez un domaine public (ex. karburo.io) ou une adresse web HTTP(S) complète.",
      "Enter a public domain (e.g. karburo.io) or a full HTTP(S) website address.",
    ),
    industry_length: t(
      "Le secteur doit contenir de 2 à 120 caractères.",
      "Use an industry between 2 and 120 characters.",
    ),
    language_selection: t("Choisissez le français ou l’anglais.", "Choose French or English."),
    country_code: t(
      "Utilisez un code pays de deux lettres, par exemple FR.",
      "Use a two-letter country code, such as FR.",
    ),
    competitors_count: t("Ajoutez au maximum 10 concurrents.", "Add up to 10 competitors."),
    query_length: t(
      "La question doit contenir de 5 à 1 000 caractères.",
      "The question must contain between 5 and 1,000 characters.",
    ),
    queries_count: t(
      "Ajoutez entre 1 et 50 questions, une par ligne.",
      "Add between 1 and 50 questions, one per line.",
    ),
    duplicate_brand: t(
      "Ce nom est déjà utilisé pour votre marque ou un autre concurrent.",
      "This name is already used by your brand or another competitor.",
    ),
    duplicate_query: t(
      "Cette question est déjà présente. Supprimez le doublon ou reformulez-la.",
      "This question is already present. Remove the duplicate or rephrase it.",
    ),
    invalid_value: t("Vérifiez ce champ.", "Check this field."),
  };
  const question = /^queries\.(\d+)$/.exec(issue.field);
  return question
    ? `${t("Question", "Question")} ${Number(question[1]) + 1} : ${messages[issue.code]}`
    : messages[issue.code];
}
