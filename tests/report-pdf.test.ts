import { test, expect } from "vitest";
import { renderReport } from "../src/lib/report-pdf";
import { reportFixture } from "./fixtures/report";
for (const locale of ["fr", "en", "zh-CN"] as const)
  test(`PDF ${locale}: embedded Unicode font, selectable text, bounded pagination`, async () => {
    const bytes = await renderReport(reportFixture(locale), "synthetic-report");
    const content = bytes.toString("latin1");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(content).toContain("/ToUnicode");
    expect(bytes.length).toBeGreaterThan(10000);
    expect(bytes.length).toBeLessThan(500000);
    const pages = (content.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(6);
    expect(pages).toBeLessThan(12);
  });
test("long Chinese evidence and questions paginate without infinite overflow", async () => {
  const b = await renderReport(reportFixture("zh-CN", true), "synthetic-long");
  const pages = (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  expect(pages).toBeGreaterThan(20);
  expect(pages).toBeLessThan(110);
}, 20000);
