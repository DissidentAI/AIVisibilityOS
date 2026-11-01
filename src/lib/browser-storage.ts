import { z } from "zod";
import { PROVIDERS, OPENROUTER_MODEL_IDS } from "./provider-config";
export const BROWSER_RETENTION_MS = 30 * 86400_000;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function browserStore(): Store | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
export function accountStorageKey(
  kind: string,
  user: { id: string; org_id: string },
  projectId = "",
) {
  return `avos:v1:${user.org_id}:${user.id}:${kind}${projectId ? `:${projectId}` : ""}`;
}
export function clearBrowserValue(key: string, storage = browserStore()) {
  try {
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
export function readBrowserValue<T>(
  key: string,
  schema: z.ZodType<T>,
  storage = browserStore(),
  now = Date.now(),
): { value: T | null; available: boolean } {
  if (!storage) return { value: null, available: false };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { value: null, available: true };
    if (raw.length > 100_000) throw new Error("oversized_draft");
    const envelope = z
      .object({ version: z.literal(1), savedAt: z.number().finite(), value: schema })
      .parse(JSON.parse(raw));
    if (envelope.savedAt > now + 60_000 || now - envelope.savedAt > BROWSER_RETENTION_MS)
      throw new Error("expired_draft");
    return { value: envelope.value, available: true };
  } catch {
    return { value: null, available: clearBrowserValue(key, storage) };
  }
}
export function saveBrowserValue<T>(
  key: string,
  value: T,
  schema: z.ZodType<T>,
  storage = browserStore(),
  now = Date.now(),
) {
  try {
    if (!storage) return false;
    // Schema parsing strips unknown fields. Passwords and API keys have no storage schema.
    const checked = schema.parse(value);
    storage.setItem(key, JSON.stringify({ version: 1, savedAt: now, value: checked }));
    return true;
  } catch {
    return false;
  }
}
const draftBrand = z.object({ name: z.string().max(100), domain: z.string().max(2048) });
export const projectDraftSchema = z.object({
  step: z.number().int().min(1).max(3),
  name: z.string().max(100),
  domain: z.string().max(2048),
  industry: z.string().max(120),
  country: z.string().max(2),
  language: z.enum(["fr", "en"]),
  competitors: z.array(draftBrand).length(2),
  questions: z.string().max(50000),
});
export type ProjectDraft = z.infer<typeof projectDraftSchema>;
export function emptyProjectDraft(): ProjectDraft {
  return {
    step: 1,
    name: "",
    domain: "",
    industry: "",
    country: "FR",
    language: "fr",
    competitors: [
      { name: "", domain: "" },
      { name: "", domain: "" },
    ],
    questions: "",
  };
}
export function hasProjectDraft(draft: ProjectDraft) {
  return !!(
    draft.name ||
    draft.domain ||
    draft.industry ||
    draft.questions ||
    draft.country !== "FR" ||
    draft.language !== "fr" ||
    draft.competitors.some((c) => c.name || c.domain)
  );
}
export const workspacePreferenceSchema = z.object({
  projectId: z.string().uuid().or(z.literal("")),
});
export const campaignPreferenceSchema = z.object({
  providers: z
    .array(z.enum(PROVIDERS))
    .max(PROVIDERS.length)
    .refine((values) => new Set(values).size === values.length),
  samples: z.number().int().min(1).max(5),
  mode: z.enum(["baseline", "web"]),
  openrouterModel: z.enum(OPENROUTER_MODEL_IDS),
});
