import { randomBytes } from "node:crypto";
import { z } from "zod";
import { sql } from "../db/client";
import { digest, hashPassword, verifyPassword } from "./security";
import { AppError } from "./errors";
import type { User } from "./types";
const authSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(12).max(128),
  bootstrapToken: z.string().max(200).optional(),
});
export async function rateLimit(key: string, limit: number, seconds = 900) {
  const [row] =
    await sql`insert into rate_limits (key, count, expires_at) values (${digest(key)}, 1, now() + ${seconds} * interval '1 second')
    on conflict (key) do update set count = case when rate_limits.expires_at < now() then 1 else rate_limits.count + 1 end,
    expires_at = case when rate_limits.expires_at < now() then excluded.expires_at else rate_limits.expires_at end returning count`;
  if (row.count > limit) throw new AppError("rate_limited", 429);
}
export function sessionToken(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("avos_session="))
      ?.slice(13) ?? ""
  );
}
export async function requireUser(request: Request): Promise<User> {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("unauthenticated", 401);
  const [user] = await sql<
    User[]
  >`select u.id, u.org_id, u.email from users u join sessions s on s.user_id=u.id where s.token_hash=${digest(token)} and s.expires_at > now()`;
  if (!user) throw new AppError("unauthenticated", 401);
  return user;
}
export async function authenticate(data: unknown, register: boolean) {
  const input = authSchema.parse(data);
  await rateLimit("auth:global", 100);
  await rateLimit(`auth:${input.email}`, 8);
  let user: User;
  if (register) {
    if (
      !process.env.BOOTSTRAP_TOKEN ||
      digest(input.bootstrapToken ?? "") !== digest(process.env.BOOTSTRAP_TOKEN)
    )
      throw new AppError("invalid_bootstrap_token", 403);
    const passwordHash = await hashPassword(input.password);
    user = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(824761)`;
      const [count] = await tx`select count(*)::int as n from users`;
      if (count.n > 0) throw new AppError("registration_closed", 403);
      const [org] = await tx`insert into organizations (name) values ('Community') returning id`;
      const [u] = await tx<
        User[]
      >`insert into users (org_id, email, password_hash) values (${org.id}, ${input.email}, ${passwordHash}) returning id, org_id, email`;
      return u;
    });
  } else {
    const [found] = await sql<
      (User & { password_hash: string })[]
    >`select id, org_id, email, password_hash from users where email=${input.email}`;
    const fakeHash = "0".repeat(32) + ":" + "0".repeat(128);
    const valid = await verifyPassword(input.password, found?.password_hash ?? fakeHash);
    if (!found || !valid) throw new AppError("invalid_credentials", 401);
    user = { id: found.id, org_id: found.org_id, email: found.email };
  }
  const token = randomBytes(32).toString("hex");
  await sql`insert into sessions (token_hash, user_id, expires_at) values (${digest(token)}, ${user.id}, now() + interval '7 days')`;
  return { user, token };
}
export function sessionCookie(token: string, clear = false) {
  return `avos_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 604800}${process.env.APP_URL?.startsWith("https:") ? "; Secure" : ""}`;
}
