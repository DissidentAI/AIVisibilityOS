import { describe, expect, test } from "vitest";
import { comparisonSignature, detectMentions, mentionRate, toCsv } from "../src/lib/measurement";
import {
  encryptSecret,
  decryptSecret,
  safePublicUrl,
  hashPassword,
  verifyPassword,
  assertOrigin,
} from "../src/lib/security";
const brand = { id: "brand-fixture", name: "Karburo", domain: "karburo.example" };
describe("reproducible measurement", () => {
  test("historical comparison requires complete coverage and identical returned models", () => {
    const rows = [
      { status: "succeeded", query_text: "Question?", provider: "gemini", returned_model: "v1" },
    ];
    expect(comparisonSignature(rows)).not.toBe(
      comparisonSignature([{ ...rows[0], returned_model: "v2" }]),
    );
    expect(comparisonSignature([{ ...rows[0], returned_model: null }])).toBeNull();
    expect(comparisonSignature([{ ...rows[0], status: "invalid" }])).toBeNull();
    expect(comparisonSignature([...rows, ...rows])).not.toBe(comparisonSignature(rows));
  });
  test("counts one explicit mention per brand, preserving evidence", () => {
    const mentions = detectMentions("KARBURO est pratique. Karburo reste une option.", [brand]);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].excerpt).toContain("KARBURO");
    expect(mentions[0].sentiment).toBe("not_classified");
  });
  test("rejects substrings and supports Unicode word boundaries", () => {
    expect(detectMentions("SuperKarburo, KarburoPlus, éKarburo, Karburoé", [brand])).toHaveLength(
      0,
    );
    expect(detectMentions("«Karburo»", [brand])).toHaveLength(1);
    expect(
      detectMentions("L’Équipe recommande un autre service.", [{ ...brand, name: "Équipe" }]),
    ).toHaveLength(1);
  });
  test("escapes regex names and supports literal domains", () => {
    expect(detectMentions("Use C++ today", [{ ...brand, name: "C++" }])).toHaveLength(1);
    expect(detectMentions("Visit https://karburo.example/path", [brand])).toHaveLength(1);
  });
  test("uses an explicit denominator and has no score for zero valid responses", () => {
    expect(mentionRate(2, 10).rate).toBe(20);
    expect(mentionRate(0, 0).rate).toBeNull();
    expect(mentionRate(7, 10).rate).toBe(70);
    expect(mentionRate(0, 1).high).toBeGreaterThan(70);
    expect(() => mentionRate(2, 1)).toThrow();
  });
  test("CSV neutralizes spreadsheet formulas including whitespace prefixes", () => {
    const csv = toCsv([{ q: '\t=HYPERLINK("bad")', answer: 'a,"b"\nc', cost: -10 }]);
    expect(csv).toContain("'\t=HYPERLINK");
    expect(csv).toContain('"a,""b""\nc"');
    expect(csv).toContain("'-10");
  });
});
describe("secret and request boundaries", () => {
  test("encrypts authenticated keys bound to tenant and provider", () => {
    const encrypted = encryptSecret("fixture-only-key", "org1:openai");
    expect(encrypted).not.toContain("fixture-only-key");
    expect(decryptSecret(encrypted, "org1:openai")).toBe("fixture-only-key");
    expect(() => decryptSecret(encrypted, "org2:openai")).toThrow();
    expect(() => decryptSecret(encrypted, "org1:gemini")).toThrow();
    expect(encryptSecret("fixture-only-key", "org1:openai")).not.toBe(encrypted);
  });
  test("hashes passwords with salts and verifies safely", async () => {
    const hash = await hashPassword("test-only-strong-password");
    expect(await verifyPassword("test-only-strong-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await hashPassword("test-only-strong-password")).not.toBe(hash);
  });
  test("rejects unsafe citation protocols and local IP links", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://127.0.0.1",
      "http://[::1]",
      "http://localhost",
      "https://user:pass@example.com",
      "http://metadata.internal",
    ])
      expect(safePublicUrl(url)).toBeNull();
    expect(safePublicUrl("https://example.com/evidence")?.hostname).toBe("example.com");
  });
  test("requires exact configured origin for mutations", () => {
    expect(() =>
      assertOrigin(
        new Request("http://localhost:3000/api/runs", { headers: { Origin: "http://evil.com" } }),
      ),
    ).toThrow();
    expect(() => assertOrigin(new Request("http://localhost:3000/api/runs"))).toThrow();
    expect(() =>
      assertOrigin(
        new Request("http://localhost:3000/api/runs", {
          headers: { Origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});
