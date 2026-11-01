import { isProjectIssue, type ProjectIssue } from "./project-validation";

export class ApiError extends Error {
  readonly issues: ProjectIssue[];
  constructor(code: string, issues?: unknown) {
    super(code);
    this.issues = Array.isArray(issues) ? issues.filter(isProjectIssue).slice(0, 60) : [];
  }
}
export const isAborted = (error: unknown) => error instanceof Error && error.name === "AbortError";

/** Read requests belong to the current page. Never cancel or retry a mutation on navigation. */
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const read = method === "GET";
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  if (read && typeof window !== "undefined")
    window.addEventListener("pagehide", abort, { once: true });
  try {
    const res = await fetch(`/api/${path}`, {
      method,
      signal: controller.signal,
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    let result;
    try {
      result = await res.json();
    } catch (error) {
      if (controller.signal.aborted || isAborted(error))
        throw new DOMException("Request cancelled", "AbortError");
      throw new ApiError("invalid_server_response");
    }
    if (!res.ok) throw new ApiError(result?.error ?? "internal_error", result?.issues);
    return result;
  } catch (error) {
    if (controller.signal.aborted || isAborted(error))
      throw new DOMException("Request cancelled", "AbortError");
    if (error instanceof ApiError) throw error;
    throw new ApiError("network_unavailable");
  } finally {
    signal?.removeEventListener("abort", abort);
    if (read && typeof window !== "undefined") window.removeEventListener("pagehide", abort);
  }
}
