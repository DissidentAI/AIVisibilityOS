import { describe, expect, test } from "vitest";
import {
  normalizeWebsiteDomain,
  projectSchema,
  projectIssues,
  projectIssueMessage,
} from "../src/lib/project-validation";
import { MAX_COMPETITORS } from "../src/lib/project-limits";

const input = {
  name: "Karburo",
  domain: "karburo.example",
  industry: "Application de station essence et borne de recharge avec IA",
  language: "fr",
  country: "FR",
  competitors: [
    { name: "Karbu France", domain: "karbu-france.example" },
    { name: "Gasoil Now", domain: "gasoil.example" },
  ],
  queries: [
    "Quelles sont les meilleures solutions dans le secteur Application de station essence et borne de recharge avec IA en FR ?",
  ],
};

describe("project creation validation", () => {
  test("accepts copied website URLs and stores their hostnames only", () => {
    for (const value of [
      "karburo.example",
      " https://Karburo.example/fr-fr/ ",
      "HTTPS://KARBURO.EXAMPLE/prix?utm_source=mobile#questions",
      "karburo.example/fr-fr/",
      "//karburo.example/path",
    ]) {
      expect(normalizeWebsiteDomain(value)).toBe("karburo.example");
    }
    const result = projectSchema.parse({
      ...input,
      domain: "https://karburo.example/fr-fr/",
      country: " fr ",
      competitors: [
        { name: "Karbu France", domain: "https://karbu-france.example/prix/" },
        { name: "Gasoil Now", domain: "https://gasoil.example/fr/" },
      ],
    });
    expect(result.domain).toBe("karburo.example");
    expect(result.country).toBe("FR");
    expect(result.competitors.map((brand) => brand.domain)).toEqual([
      "karbu-france.example",
      "gasoil.example",
    ]);
  });

  test("rejects private addresses, credentials, invalid hosts and non-web schemes", () => {
    for (const value of [
      "karbu france",
      "localhost",
      "localhost.local",
      "metadata.internal",
      "127.0.0.1",
      "[::1]",
      "2130706433",
      "https://user:password@karburo.example/path",
      "https://karburo.example:8080/",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://karburo.example",
      "https://-invalid.example",
      "https://one..example",
      "https://example.com\\@localhost/",
      "https://exam\nple.com",
      "https://" + "a".repeat(64) + ".example",
    ]) {
      expect(normalizeWebsiteDomain(value), value).toBeNull();
    }
  });

  test("reports an invalid competitor domain at that competitor, without returning its value", () => {
    const result = projectSchema.safeParse({
      ...input,
      competitors: [
        { name: "Karbu France", domain: "karbu-france.example" },
        { name: "Gasoil Now", domain: "private-invalid-input" },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issues = projectIssues(result.error);
    expect(issues).toEqual([{ field: "competitors.1.domain", code: "public_domain" }]);
    expect(JSON.stringify(issues)).not.toContain("private-invalid-input");
  });

  test("identifies the repeated brand and the exact question that needs correction", () => {
    const result = projectSchema.safeParse({
      ...input,
      competitors: [{ name: " KARBURO ", domain: "karbu-france.example" }],
      queries: [input.queries[0], " " + input.queries[0], "abc"],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(projectIssues(result.error)).toEqual(
      expect.arrayContaining([
        { field: "competitors.0.name", code: "duplicate_brand" },
        { field: "queries.1", code: "duplicate_query" },
        { field: "queries.2", code: "query_length" },
      ]),
    );
    expect(
      projectIssueMessage({ field: "queries.1", code: "duplicate_query" }, (fr) => fr),
    ).toContain("Question 2");
  });

  test("keeps the server limits for question lengths and number of competitors", () => {
    const competitors = Array.from({ length: MAX_COMPETITORS }, (_, index) => ({
      name: `Concurrent ${index}`,
      domain: `brand${index}.example`,
    }));
    expect(projectSchema.parse({ ...input, competitors }).competitors).toHaveLength(50);
    expect(projectSchema.safeParse({ ...input, queries: [] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...input, queries: ["a".repeat(1001)] }).success).toBe(false);
    expect(
      projectSchema.safeParse({
        ...input,
        queries: Array.from({ length: 51 }, (_, index) => `Question ${index} ?`),
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...input,
        competitors: Array.from({ length: MAX_COMPETITORS + 1 }, (_, index) => ({
          name: `Concurrent ${index}`,
          domain: `brand${index}.example`,
        })),
      }).success,
    ).toBe(false);
  });
});
