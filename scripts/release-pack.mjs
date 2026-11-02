import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { collectNotices } from "./third-party-notices.mjs";

// Deliberately archives committed files only. Local .env files, databases and uploads cannot enter a bundle.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--untracked-files=no"))
  throw new Error("Commit tracked changes before packing a release.");
const pkg = JSON.parse(git("show", "HEAD:package.json"));
if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(pkg.version))
  throw new Error("Expected an explicit beta version.");
const version = `v${pkg.version}`,
  commit = git("rev-parse", "HEAD");
const sourceFiles = git("ls-files").split("\n");
const forbidden = sourceFiles.filter(
  (p) =>
    /(?:^|\/)(?:\.local|node_modules|backups|test-results)(?:\/|$)|\.(?:dump|pem|key)$/.test(p) ||
    (/(?:^|\/)\.env(?:\.|$)/.test(p) && p !== ".env.example"),
);
if (forbidden.length) throw new Error("Private files are tracked; review before packaging.");
const compose = git("show", "HEAD:deploy/compose.hostinger.yaml");
if (!compose.includes(`AIVisibilityOS.git#${version}`))
  throw new Error("Hostinger source ref differs from package version.");
const directory = resolve(".local", "releases", version);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const sourceName = `ai-visibility-os-${version}-source.tar.gz`;
execFileSync("git", [
  "archive",
  "--format=tar.gz",
  `--prefix=ai-visibility-os-${version}/`,
  `--output=${join(directory, sourceName)}`,
  "HEAD",
]);
const submissionName = `ai-visibility-os-${version}-hostinger.zip`;
execFileSync("git", [
  "archive",
  "--format=zip",
  `--prefix=ai-visibility-os-${version}/`,
  `--output=${join(directory, submissionName)}`,
  "HEAD",
  "--",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs",
  "deploy/compose.hostinger.yaml",
  "scripts/setup-hostinger.mjs",
  "scripts/hostinger-config.mjs",
  "src/assets/brand-mark.png",
]);
const notices = join(directory, "third-party");
collectNotices(notices);
execFileSync("tar", [
  "-czf",
  join(directory, "third-party-notices.tar.gz"),
  "-C",
  directory,
  "third-party",
]);
const sbom = execFileSync(
  "npm",
  ["sbom", "--sbom-format", "cyclonedx", "--package-lock-only", "--omit=dev"],
  { maxBuffer: 16 * 1024 * 1024 },
);
JSON.parse(sbom.toString());
writeFileSync(join(directory, "sbom.cdx.json"), sbom);
copyFileSync("docs/HOSTINGER-SUBMISSION.md", join(directory, "HOSTINGER-SUBMISSION.md"));
writeFileSync(
  join(directory, "release-manifest.json"),
  JSON.stringify(
    {
      name: pkg.name,
      version,
      commit,
      license: pkg.license,
      repository: "https://github.com/DissidentAI/AIVisibilityOS",
      sourceArchive: sourceName,
      submissionArchive: submissionName,
      compose: `https://github.com/DissidentAI/AIVisibilityOS/blob/${version}/deploy/compose.hostinger.yaml`,
      validation: `https://github.com/DissidentAI/AIVisibilityOS/actions?query=branch%3Acodex%2Fcommunity-mvp`,
      scope: "Community beta; one owner per installation; official API observations only.",
      pendingAtPackaging: [
        "Anonymous repository/tag/download access to verify at publication",
        "Hostinger review and actual VPS installation",
        "Account-specific live provider acceptance",
        "Official partner button issuance",
      ],
    },
    null,
    2,
  ) + "\n",
);
const files = [
  sourceName,
  submissionName,
  "third-party-notices.tar.gz",
  "sbom.cdx.json",
  "HOSTINGER-SUBMISSION.md",
  "release-manifest.json",
];
writeFileSync(
  join(directory, "SHA256SUMS"),
  files
    .map(
      (name) =>
        `${createHash("sha256")
          .update(readFileSync(join(directory, name)))
          .digest("hex")}  ${name}`,
    )
    .join("\n") + "\n",
);
console.log(`Prepared ${version} from ${commit}: ${directory}`);
console.log("No release was published, no registry upload or Hostinger deployment was performed.");
