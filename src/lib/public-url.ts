// Browser-safe URL validation shared by forms and server-side evidence handling.
export function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port)
      return null;
    // Citations are links only. No arbitrary URLs are ever fetched by the server.
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
