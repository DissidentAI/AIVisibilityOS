// Browser-safe URL validation shared by forms and server-side evidence handling.
export function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    // Syntax check only. Crawling additionally requires DNS/IP pinning and
    // same-site redirect checks in site-audit/network.ts.
    if (
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
