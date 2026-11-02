import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, statSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  createHostingerConfig,
  deploymentDomain,
  validateHostingerConfig,
} from "../scripts/hostinger-config.mjs";

const parse = (config: string) =>
  Object.fromEntries(
    config
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
describe("Hostinger installation configuration", () => {
  it("generates independent secrets, a canonical HTTPS origin and valid limits", () => {
    const a = parse(createHostingerConfig("Visibility.Example.com"));
    const b = parse(createHostingerConfig("visibility.example.com"));
    expect(validateHostingerConfig(a)).toEqual({
      domain: "visibility.example.com",
      url: "https://visibility.example.com",
    });
    for (const key of ["ENCRYPTION_KEY", "POSTGRES_PASSWORD", "BOOTSTRAP_TOKEN"])
      expect(a[key]).not.toBe(b[key]);
    expect(deploymentDomain("visibilité.example.com")).toMatch(/^xn--/);
  });
  it("rejects injected configuration, private hosts and malformed domains", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "10.0.0.1",
      "a.local",
      "https://example.com",
      "example.com:443",
      "example.com/a",
      "a.com\nTOKEN=x",
      "a.com${EVIL}",
      "*.example.com",
      "a..com",
      "a.com#x",
      "a.com ",
    ])
      expect(() => deploymentDomain(host)).toThrow();
  });
  it("fails closed before migration for unsafe secrets, mismatched origins and invalid bounds", () => {
    const env = parse(createHostingerConfig("visibility.example.com"));
    for (const patch of [
      { APP_URL: "http://visibility.example.com" },
      { APP_URL: "https://other.example.com" },
      { APP_URL: env.APP_URL + "/" },
      { ENCRYPTION_KEY: "short" },
      { POSTGRES_PASSWORD: "password" },
      { BOOTSTRAP_TOKEN: env.POSTGRES_PASSWORD },
      { RETENTION_DAYS: "0" },
      { WORKER_CONCURRENCY: "33" },
      { MAX_MONTHLY_BUDGET_USD: "1001" },
    ])
      expect(() => validateHostingerConfig({ ...env, ...patch })).toThrow();
  });
  it("creates a private file without printing secrets and never overwrites an existing file or symlink", () => {
    const cwd = mkdtempSync(join(tmpdir(), "visibility-hostinger-"));
    const script = resolve("scripts/setup-hostinger.mjs");
    const run = () =>
      spawnSync(process.execPath, [script, "--domain", "visibility.example.com"], {
        cwd,
        encoding: "utf8",
      });
    try {
      const first = run();
      expect(first.status).toBe(0);
      const file = join(cwd, ".env.hostinger"),
        content = readFileSync(file, "utf8");
      expect(statSync(file).mode & 0o777).toBe(0o600);
      for (const key of ["ENCRYPTION_KEY", "POSTGRES_PASSWORD", "BOOTSTRAP_TOKEN"])
        expect(first.stdout + first.stderr).not.toContain(parse(content)[key]);
      expect(run().status).toBe(1);
      expect(readFileSync(file, "utf8")).toBe(content);
      rmSync(file);
      symlinkSync(join(cwd, "nonexistent-target"), file);
      expect(run().status).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
