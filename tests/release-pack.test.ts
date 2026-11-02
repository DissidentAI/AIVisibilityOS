import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

it("packages only committed source, verifies checksums and refuses tracked secrets or dirty source", () => {
  const root = mkdtempSync(join(tmpdir(), "visibility-release-test-"));
  const write = (file: string, value: string) => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), value);
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const commit = () =>
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-qm",
      "Synthetic packaging fixture",
    );
  const pack = () =>
    spawnSync(process.execPath, [join(root, "scripts/release-pack.mjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, npm_config_offline: "true" },
    });
  try {
    git("init", "-q");
    const pkg = {
      name: "release-fixture",
      version: "0.2.0-beta.1",
      license: "AGPL-3.0-only",
      private: true,
    };
    write("package.json", JSON.stringify(pkg));
    write(
      "package-lock.json",
      JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        lockfileVersion: 3,
        packages: { "": pkg },
      }),
    );
    write(".gitignore", ".env\n.local/\n");
    write("deploy/compose.hostinger.yaml", "# AIVisibilityOS.git#v0.2.0-beta.1\n");
    for (const file of [
      "README.md",
      "LICENSE",
      "SECURITY.md",
      "THIRD_PARTY_NOTICES.md",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "docs/HOSTINGER.md",
      "docs/HOSTINGER-SUBMISSION.md",
      "docs/RELEASE-CHECKLIST.md",
      "docs/DEPLOYMENT.md",
      "docs/VALIDATION.md",
      "docs/screenshots/test.txt",
      "scripts/setup-hostinger.mjs",
      "scripts/hostinger-config.mjs",
      "src/assets/brand-mark.png",
    ])
      write(file, "Explicit synthetic packaging fixture\n");
    for (const file of ["scripts/release-pack.mjs", "scripts/third-party-notices.mjs"])
      copyFileSync(resolve(file), join(root, file));
    git("add", ".");
    commit();
    const secret = randomBytes(24).toString("hex");
    write(".env", `SECRET=${secret}`);
    write(".local/customer-data.json", "private fixture");
    const result = pack();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toContain(secret);
    const folder = join(root, ".local/releases/v0.2.0-beta.1");
    const names = execFileSync(
      "tar",
      ["-tzf", join(folder, "ai-visibility-os-v0.2.0-beta.1-source.tar.gz")],
      { encoding: "utf8" },
    );
    expect(names).toContain("README.md");
    expect(names).not.toContain(".env");
    expect(names).not.toContain(".local");
    for (const line of readFileSync(join(folder, "SHA256SUMS"), "utf8").trim().split("\n")) {
      const [hash, name] = line.split("  ");
      expect(
        createHash("sha256")
          .update(readFileSync(join(folder, name)))
          .digest("hex"),
      ).toBe(hash);
    }
    write("README.md", "Uncommitted change");
    expect(pack().status).not.toBe(0);
    git("add", "README.md");
    commit();
    git("add", "-f", ".env");
    commit();
    const rejected = pack();
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("Private files are tracked");
    expect(rejected.stderr).not.toContain(secret);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
