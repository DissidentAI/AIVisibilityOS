import { test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { translator, localeOf } from "../src/lib/i18n";
import chinese from "../src/lib/locales/zh-CN.json";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
test("every static UI translation has Simplified Chinese coverage", () => {
  const missing: string[] = [];
  for (const file of [...files("src/components"), "src/lib/project-validation.ts"]) {
    const s = readFileSync(file, "utf8");
    const pattern = /\bt\(\s*("(?:[^"\\]|\\.)*")\s*,\s*("(?:[^"\\]|\\.)*")\s*,?\s*\)/g;
    for (const m of s.matchAll(pattern)) {
      const en = JSON.parse(m[2]);
      if (!(en in chinese)) missing.push(`${file}: ${en}`);
    }
  }
  expect(missing).toEqual([]);
});
test("locales use explicit Chinese dynamic messages and preserve source language", () => {
  expect(translator("zh-CN")("Vue d’ensemble", "Overview")).toBe("概览");
  expect(translator("zh-CN")("1 réponse", "1 answer", "1 条回答")).toBe("1 条回答");
  expect(localeOf("zh-CN")).toBe("zh-CN");
  expect(localeOf("invalid")).toBe("fr");
});
