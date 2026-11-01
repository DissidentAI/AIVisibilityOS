import { z } from "zod";
import { PROVIDERS, type Provider } from "./provider-config";
import { AppError } from "./errors";

export const credentialCheckSchema = z.object({
  provider: z.enum(PROVIDERS),
  key: z.string().trim().min(20).max(512).regex(/^\S+$/).optional(),
});
// Read-only authentication endpoints. Never send a credential to a caller-supplied URL.
const endpoints: Record<Provider, string> = {
  openai: "https://api.openai.com/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
  kimi: "https://api.moonshot.ai/v1/models",
  openrouter: "https://openrouter.ai/api/v1/key",
  mimo: "https://api.xiaomimimo.com/v1/models",
};
export async function verifyProviderCredential(provider: Provider, key: string) {
  let response: Response;
  try {
    response = await fetch(endpoints[provider], {
      method: "GET",
      headers:
        provider === "gemini"
          ? { "x-goog-api-key": key }
          : provider === "mimo"
            ? { "api-key": key }
            : { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new AppError(`provider_check_unavailable_${provider}`, 502);
  }
  // The upstream payload may echo secrets. Never expose or log it.
  await response.body?.cancel();
  if (response.status === 401) throw new AppError(`provider_auth_rejected_${provider}`, 400);
  if (response.status === 403) throw new AppError(`provider_access_denied_${provider}`, 400);
  if (!response.ok) throw new AppError(`provider_check_unavailable_${provider}`, 502);
  return { provider, valid: true, checkedAt: new Date().toISOString() };
}
