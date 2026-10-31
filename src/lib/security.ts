import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import { AppError } from "./errors";
const scrypt = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scryptCb(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex || hex.length !== 128) return false;
  const key = await scrypt(password, salt);
  return timingSafeEqual(key, Buffer.from(hex, "hex"));
}
function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new AppError("encryption_not_configured", 503);
  return Buffer.from(key, "hex");
}
export function encryptSecret(secret: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString("base64")).join(".");
}
export function decryptSecret(secret: string, context: string) {
  const [iv, tag, encrypted] = secret.split(".").map(s => Buffer.from(s, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8");
}
export function assertOrigin(request: Request) {
  const configured = process.env.APP_URL;
  if (!configured || request.headers.get("origin") !== new URL(configured).origin) throw new AppError("invalid_origin", 403);
}
export function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    // Citations are links only. No arbitrary URLs are ever fetched by the server.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}
