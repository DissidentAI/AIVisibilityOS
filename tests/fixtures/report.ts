import type { ReportPayload } from "../../src/lib/reports";
import type { RunDetail } from "../../src/lib/types";
const date = "2026-11-01T10:00:00.000Z";
/** Synthetic fixtures only, never seeded into an application database. */
export function reportFixture(locale: ReportPayload["locale"], long = false): ReportPayload {
  const primary = {
    id: "00000000-0000-4000-a000-000000000001",
    name: locale === "zh-CN" ? "测试品牌 · 合成样本" : "Atelier Démonstration · TEST SYNTHÉTIQUE",
    domain: "atelier.example",
    is_primary: true,
  };
  const competitor = {
    id: "00000000-0000-4000-a000-000000000002",
    name: "Concurrent Exemple",
    domain: "concurrent.example",
    is_primary: false,
  };
  const questions = Array.from({ length: long ? 50 : 4 }, (_, i) => ({
    id: `q${i}`,
    project_id: "project",
    text:
      locale === "zh-CN"
        ? `${i + 1}. 哪些办公家具适合小型企业？` +
          (long ? "这是用于检查中文分页的合成测试文本。".repeat(35) : "")
        : `${i + 1}. Quels bureaux ergonomiques choisir pour une petite entreprise ?` +
          (long
            ? " Contenu de test pour vérifier les retours à la ligne et la pagination.".repeat(10)
            : ""),
  }));
  const responses = questions.flatMap((q, i) =>
    [0, 1].map((j) => ({
      id: `response-${i}-${j}`,
      run_id: "campaign",
      query_text: q.text,
      provider: j === 0 ? ("openai" as const) : ("gemini" as const),
      model: "synthetic-model",
      returned_model: "synthetic-model-v1",
      channel: "official_api",
      sample: 1,
      attempt: 1,
      parameters: {},
      status: i === 3 && j === 1 ? "failed" : "succeeded",
      answer: "SYNTHETIC TEST. 测试回答，仅用于验证排版。",
      grounding: null,
      error_code: null,
      request_id: null,
      input_tokens: 50,
      output_tokens: 30,
      cost_micros: 105,
      started_at: date,
      finished_at: date,
    })),
  );
  const mentions = responses
    .filter((r) => r.status === "succeeded")
    .flatMap((r, i) =>
      [...(i % 2 === 0 ? [primary] : []), competitor].map((b) => ({
        response_id: r.id,
        brand_id: b.id,
        brand_name: b.name,
        excerpt: `${b.name} : ${locale === "zh-CN" ? "此摘录仅为合成测试数据。该品牌在回答中被明确提及，但提及并不意味着推荐。" : "Cet extrait est une donnée de test synthétique. Une mention explicite ne signifie pas une recommandation."}`,
        matched_alias: b.name,
        sentiment: "not_classified",
      })),
    );
  const d: RunDetail = {
    run: {
      id: "campaign",
      project_id: "project",
      created_at: date,
      config_hash: "a".repeat(64),
      snapshot: {
        project: { name: primary.name, domain: primary.domain, language: locale, country: "FR" },
        brands: [primary, competitor],
        queries: questions,
        providers: ["openai", "gemini"],
        models: { openai: "synthetic-model", gemini: "synthetic-model" },
        samples: 1,
        methodology: "SYNTHETIC-FIXTURE",
        system: "Synthetic test, no real provider call.",
        parameters: { search: false },
        pricing: {},
      },
      total: responses.length,
      valid: responses.filter((r) => r.status === "succeeded").length,
      failed: 1,
      pending: 0,
    },
    responses,
    mentions,
    citations: [],
  };
  return {
    version: 1,
    createdAt: date,
    locale,
    notes:
      locale === "zh-CN"
        ? "此文档仅用于自动化测试和版式检查，所有数据均为合成数据。"
        : "Document de test uniquement. Données synthétiques pour vérifier la mise en page, pas une analyse réelle.",
    branding: { agency_name: "Studio Exemple · SYNTHETIC TEST", logo_data: null },
    current: d,
    previous: null,
  };
}

export function manyBrandsReportFixture(): ReportPayload {
  const payload = reportFixture("zh-CN");
  payload.current.run.snapshot.brands = [
    payload.current.run.snapshot.brands[0],
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `many-brand-${i}`,
      name: `品牌${String(i + 1).padStart(2, "0")}：${"这是用于测试长名称分页的虚构公司".repeat(5)}`,
      domain: `brand${i}.example`,
      is_primary: false,
    })),
  ];
  return payload;
}
