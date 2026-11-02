import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { randomBytes } from "node:crypto";

export function deploymentDomain(value) {
  if (typeof value !== "string" || value !== value.trim() || /[\s/:@?#$={}\\]/.test(value))
    throw new Error("APP_DOMAIN must be a hostname, without scheme, port or path.");
  const domain = domainToASCII(value).toLowerCase();
  if (
    !domain ||
    domain.length > 253 ||
    isIP(domain) ||
    !domain.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(domain) ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain) ||
    domain.split(".").some((label) => label.length > 63) ||
    !/[a-z]/.test(domain.split(".").at(-1))
  )
    throw new Error("APP_DOMAIN must be a public DNS hostname that you control.");
  return domain;
}

export function validateHostingerConfig(env) {
  const domain = deploymentDomain(env.APP_DOMAIN);
  if (env.APP_DOMAIN !== domain || env.APP_URL !== `https://${domain}`)
    throw new Error(
      "APP_URL must exactly equal https://APP_DOMAIN (canonical hostname, no trailing slash).",
    );
  const lengths = { ENCRYPTION_KEY: 64, POSTGRES_PASSWORD: 48, BOOTSTRAP_TOKEN: 48 };
  for (const [name, length] of Object.entries(lengths))
    if (!new RegExp(`^[a-f0-9]{${length}}$`).test(env[name] ?? ""))
      throw new Error(
        `${name} must contain ${length} lowercase hexadecimal characters; use setup:hostinger.`,
      );
  if (env.POSTGRES_PASSWORD === env.BOOTSTRAP_TOKEN)
    throw new Error("Database and bootstrap credentials must be different.");
  for (const [name, min, max] of [
    ["MAX_MONTHLY_BUDGET_USD", 1, 1000],
    ["RETENTION_DAYS", 1, 3650],
    ["WORKER_CONCURRENCY", 1, 32],
  ]) {
    const value = Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return { domain, url: env.APP_URL };
}

export function createHostingerConfig(value) {
  const domain = deploymentDomain(value);
  const env = {
    APP_DOMAIN: domain,
    APP_URL: `https://${domain}`,
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
    BOOTSTRAP_TOKEN: randomBytes(24).toString("hex"),
    MAX_MONTHLY_BUDGET_USD: "20",
    RETENTION_DAYS: "365",
    WORKER_CONCURRENCY: "12",
  };
  validateHostingerConfig(env);
  return (
    "# Private deployment configuration. Never commit, upload or include in support logs.\n" +
    Object.entries(env)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n") +
    "\n"
  );
}
