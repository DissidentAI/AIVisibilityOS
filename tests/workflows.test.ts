import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { reportFixture } from "./fixtures/report";
import {
  evidenceRows,
  evidenceHash,
  readEvidenceHash,
  proofTarget,
  emptyEvidenceFilters,
} from "../src/lib/evidence-navigation";
import { filterQueries, emptyQueryFilters } from "../src/lib/query-organization";
import { historyReasons, sampleReasons } from "../src/lib/history-comparison";
import { actionFieldsSchema } from "../src/lib/geo-actions";

describe("verifiable evidence navigation", () => {
  test("a brand link returns exactly its valid mention numerator, never failed or duplicate responses", () => {
    const d = reportFixture("fr").current;
    const brandId = d.run.snapshot.brands[0].id;
    const one = d.mentions.find((m) => m.brand_id === brandId)!;
    d.mentions.push(one, {
      ...one,
      response_id: d.responses.find((r) => r.status === "failed")!.id,
    });
    const rows = evidenceRows(d, { ...emptyEvidenceFilters, brandId });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
    expect(rows.every((r) => r.status === "succeeded")).toBe(true);
    const filtered = evidenceRows(d, {
      ...emptyEvidenceFilters,
      brandId,
      queryId: d.run.snapshot.queries[0].id,
    });
    expect(filtered).toHaveLength(1);
    expect(evidenceRows(d, { ...emptyEvidenceFilters, queryId: randomUUID() })).toEqual([]);
    expect(evidenceRows(d, { ...emptyEvidenceFilters, brandId: randomUUID() })).toEqual([]);
  });
  test("private links round-trip IDs, Unicode filters and previous attempt IDs; reject malformed targets", () => {
    const target = {
      ...proofTarget(randomUUID(), randomUUID(), "original", {
        search: "Été & 中文 # /",
        queryId: randomUUID(),
        brandId: randomUUID(),
        status: "succeeded",
        provider: "mimo",
      }),
      responseId: randomUUID(),
    };
    expect(readEvidenceHash(evidenceHash(target))).toEqual(target);
    expect(readEvidenceHash("#evidence?project=not-a-uuid&run=1")).toBeNull();
    expect(readEvidenceHash("#other?anything")).toBeNull();
    expect(
      readEvidenceHash(evidenceHash(target).replace("status=succeeded", "status=bogus")),
    ).toBeNull();
  });
  test("legacy questions have neutral metadata and filters distinguish all themes from no theme", () => {
    const queries = [
      { id: "a", project_id: "p", text: "Question historique ?" },
      {
        id: "b",
        project_id: "p",
        text: "Quel produit choisir ?",
        theme: "Comparatifs",
        intent: "comparison" as const,
        priority: "high" as const,
      },
    ];
    expect(filterQueries(queries, emptyQueryFilters)).toHaveLength(2);
    expect(filterQueries(queries, { ...emptyQueryFilters, theme: "" }).map((q) => q.id)).toEqual([
      "a",
    ]);
    expect(
      filterQueries(queries, {
        ...emptyQueryFilters,
        search: "PRODUIT",
        intent: "comparison",
        priority: "high",
      }).map((q) => q.id),
    ).toEqual(["b"]);
  });
});
describe("history exclusions", () => {
  const fixture = () => {
    const d = reportFixture("fr").current;
    d.responses = d.responses.map((r) => ({ ...r, status: "succeeded" }));
    return d;
  };
  test("complete identical samples compare; each partial reference and retry remains excluded", () => {
    const a = fixture(),
      b = structuredClone(a);
    expect(historyReasons(b.run, b.responses, a.run, a.responses, "original")).toEqual([]);
    b.responses[0].status = "failed";
    expect(historyReasons(b.run, b.responses, a.run, a.responses, "original")).toContain(
      "incomplete",
    );
    expect(historyReasons(a.run, a.responses, b.run, b.responses, "original")).toContain(
      "reference_ineligible",
    );
    b.responses[0].status = "succeeded";
    b.responses[0].attempt = 2;
    expect(sampleReasons(b.responses)).toContain("retried");
  });
  test("changed models, unknown returned models and unknown OpenRouter routes are explicit", () => {
    const a = fixture(),
      b = structuredClone(a);
    b.responses[0].returned_model = "another-returned-model";
    expect(historyReasons(b.run, b.responses, a.run, a.responses, "current")).toContain(
      "returned_models",
    );
    b.responses[0].returned_model = null;
    expect(sampleReasons(b.responses)).toContain("missing_model");
    b.responses[0].provider = "openrouter";
    expect(sampleReasons(b.responses)).toContain("unknown_route");
    b.responses[0].parameters = { execution: { servingProvider: "Test provider" } };
    expect(sampleReasons(b.responses)).not.toContain("unknown_route");
  });
  test("current-brand history ignores only the brand-set change, retaining all other configuration boundaries", () => {
    const a = fixture(),
      b = structuredClone(a);
    b.run.config_hash = "different";
    b.run.snapshot.brands.push({
      ...b.run.snapshot.brands[1],
      id: randomUUID(),
      name: "New rival",
    });
    expect(historyReasons(b.run, b.responses, a.run, a.responses, "original")).toContain("brands");
    expect(historyReasons(b.run, b.responses, a.run, a.responses, "current")).toEqual([]);
    b.run.snapshot.parameters.search = true;
    b.run.snapshot.queries[0].text = "New question";
    b.run.snapshot.models.openai = "another-model";
    b.run.snapshot.samples = 2;
    b.run.snapshot.project.language = "en";
    expect(historyReasons(b.run, b.responses, a.run, a.responses, "current")).toEqual(
      expect.arrayContaining(["mode", "questions", "models", "samples", "locale"]),
    );
  });
  test("action inputs reject dangerous URLs and impossible deadlines", () => {
    expect(
      actionFieldsSchema.safeParse({ title: "An action", targetUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      actionFieldsSchema.safeParse({
        title: "An action",
        targetUrl: "https://user:secret@example.com",
      }).success,
    ).toBe(false);
    expect(
      actionFieldsSchema.safeParse({ title: "An action", dueDate: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      actionFieldsSchema.parse({
        title: "An action",
        targetUrl: "https://example.com/page",
        dueDate: "2027-01-01",
      }).status,
    ).toBe("to_review");
  });
});
