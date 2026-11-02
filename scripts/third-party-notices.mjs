import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Preserve installed production dependency notices; no package or source download. */
export function collectNotices(output, root = process.cwd()) {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const entries = new Map();
  mkdirSync(output, { recursive: true });
  for (const [path, metadata] of Object.entries(lock.packages)) {
    if (!path || metadata.dev || !existsSync(join(root, path, "package.json"))) continue;
    const folder = join(root, path);
    const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
    const id = `${pkg.name}@${pkg.version}`;
    if (entries.has(id)) continue;
    let license = typeof pkg.license === "string" ? pkg.license : null;
    // png-js 2.0.0 omits the package field but ships the full MIT text.
    if (
      !license &&
      pkg.name === "png-js" &&
      readFileSync(join(folder, "LICENSE"), "utf8").startsWith("MIT License")
    )
      license = "MIT";
    if (!license) throw new Error(`Review missing license metadata for ${id}`);
    const slug = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = join(output, slug);
    mkdirSync(target, { recursive: true });
    const files = readdirSync(folder, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /^(?:licen[cs]e|copying|notice|authors|copyright|ofl|readme)(?:[.-].*)?$|^versions\.json$/i.test(
            entry.name,
          ),
      )
      .map((entry) => entry.name);
    for (const name of files) copyFileSync(join(folder, name), join(target, name));
    entries.set(id, {
      name: pkg.name,
      version: pkg.version,
      license,
      source: typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? null),
      packageArchive: metadata.resolved ?? null,
      integrity: metadata.integrity ?? null,
      notices: files.map((name) => `${slug}/${name}`),
    });
  }
  const packages = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(
    join(output, "index.json"),
    JSON.stringify(
      {
        scope:
          "Installed production dependencies for this operating system. Includes upstream licensing READMEs and native library versions. This inventory is not a legal certification.",
        packages,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    join(output, "README.txt"),
    "Third-party notices for installed production dependencies.\nSee index.json for versions, declared licenses, source locations and original notice files.\nThe original application is licensed separately in /app/LICENSE.\nNative libvips dependencies and their licensing are detailed in the corresponding upstream README and versions.json.\n",
  );
  return packages.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const count = collectNotices(resolve(process.argv[2] ?? ".local/third-party"));
  console.log(`Preserved notices for ${count} installed production dependencies.`);
}
