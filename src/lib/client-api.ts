import { isProjectIssue, type ProjectIssue } from "./project-validation";

export class ApiError extends Error {
  readonly issues: ProjectIssue[];
  constructor(code: string, issues?: unknown) {
    super(code);
    this.issues = Array.isArray(issues) ? issues.filter(isProjectIssue).slice(0, 60) : [];
  }
}
export const isAborted = (error: unknown) => error instanceof Error && error.name === "AbortError";

// A component effect can run during a WebKit reload, before pagehide. Remember
// beforeunload even when no request is pending; pageshow restores a returning page.
const lifecycles = new WeakMap<EventTarget, { leaving: boolean }>();
function lifecycle(page: EventTarget) {
  let state = lifecycles.get(page);
  if (!state) {
    state = { leaving: false };
    const current = state;
    page.addEventListener("beforeunload", () => {
      current.leaving = true;
    });
    page.addEventListener("pagehide", () => {
      current.leaving = true;
    });
    page.addEventListener("pageshow", () => {
      current.leaving = false;
    });
    lifecycles.set(page, state);
  }
  return state;
}

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
  const page = typeof window !== "undefined" ? window : null;
  const state = page ? lifecycle(page) : null;
  const leave = () => {
    if (state) state.leaving = true;
    abort();
  };
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  if (read && page) {
    if (state?.leaving) abort();
    page.addEventListener("pagehide", leave, { once: true });
    // Cancel pending reads too. The lifecycle listener also blocks later effects.
    // Neither listener requests a navigation prompt or replays mutations.
    page.addEventListener("beforeunload", leave, { once: true });
  }
  try {
    controller.signal.throwIfAborted();
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
    if (read && page) {
      page.removeEventListener("pagehide", leave);
      page.removeEventListener("beforeunload", leave);
    }
  }
}
