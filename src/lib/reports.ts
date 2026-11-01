import { z } from "zod";
import sharp from "sharp";
import { sql } from "../db/client";
import { AppError } from "./errors";
import { comparisonSignature, mentionRate } from "./measurement";
import { getRun, ownedProject, uuidSchema } from "./service";
import type { RunDetail, User } from "./types";
export type Branding = { agency_name: string; logo_data: string | null };
export type ReportPayload = {
  version: 1;
  createdAt: string;
  locale: "fr" | "en" | "zh-CN";
  notes: string;
  branding: Branding;
  current: RunDetail;
  previous: RunDetail | null;
};
export function comparable(a: RunDetail, b: RunDetail) {
  const signature = comparisonSignature(a.responses);
  return (
    a.run.id !== b.run.id &&
    a.run.project_id === b.run.project_id &&
    a.run.config_hash === b.run.config_hash &&
    signature !== null &&
    signature === comparisonSignature(b.responses) &&
    new Date(b.run.created_at) < new Date(a.run.created_at)
  );
}
export function reportMetrics(detail: RunDetail) {
  const valid = new Set(detail.responses.filter((r) => r.status === "succeeded").map((r) => r.id));
  return [...detail.run.snapshot.brands]
    .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))
    .map((b) => {
      const count = new Set(
        detail.mentions
          .filter((m) => m.brand_id === b.id && valid.has(m.response_id))
          .map((m) => m.response_id),
      ).size;
      return { ...b, mentioned: count, ...mentionRate(count, valid.size) };
    });
}
export async function getBranding(user: User): Promise<Branding> {
  const [branding] = await sql<
    Branding[]
  >`select agency_name,logo_data from report_branding where org_id=${user.org_id}`;
  return branding ?? { agency_name: "AI Visibility OS", logo_data: null };
}
export async function saveBranding(user: User, data: unknown) {
  const p = z
    .object({
      agencyName: z.string().trim().min(1).max(100),
      logoData: z.string().max(350_000).nullable(),
    })
    .parse(data);
  let logo: string | null = null;
  if (p.logoData) {
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(p.logoData);
    if (!m) throw new AppError("invalid_logo");
    try {
      const source = Buffer.from(m[2], "base64");
      if (source.length > 250_000) throw new Error("size");
      const input = sharp(source, { limitInputPixels: 1_048_576, failOn: "warning" });
      const metadata = await input.metadata();
      if (!["png", "jpeg"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1)
        throw new Error("format");
      const normalized = await input
        .rotate()
        .resize({ width: 512, height: 256, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      if (normalized.length > 250_000) throw new Error("size");
      logo = `data:image/png;base64,${normalized.toString("base64")}`;
    } catch {
      throw new AppError("invalid_logo");
    }
  }
  await sql`insert into report_branding(org_id,agency_name,logo_data) values (${user.org_id},${p.agencyName},${logo}) on conflict(org_id) do update set agency_name=excluded.agency_name,logo_data=excluded.logo_data`;
}
export async function createReport(user: User, data: unknown) {
  const p = z
    .object({
      runId: z.uuid(),
      previousRunId: z.uuid().nullable().default(null),
      locale: z.enum(["fr", "en", "zh-CN"]),
      notes: z.string().trim().max(2000).default(""),
    })
    .parse(data);
  const current = await getRun(user, p.runId);
  if (current.run.pending) throw new AppError("report_campaign_pending", 409);
  if (!current.run.valid) throw new AppError("report_no_valid_responses", 409);
  const previous = p.previousRunId ? await getRun(user, p.previousRunId) : null;
  if (previous && !comparable(current, previous)) throw new AppError("report_not_comparable", 409);
  const branding = await getBranding(user);
  const payload: ReportPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    locale: p.locale,
    notes: p.notes,
    branding,
    current,
    previous,
  };
  return sql.begin(async (tx) => {
    await tx`select id from organizations where id=${user.org_id} for update`;
    const [count] = await tx`select count(*)::int as n from reports where org_id=${user.org_id}`;
    if (count.n >= 200) throw new AppError("report_limit", 409);
    const title = `${current.run.snapshot.project.name} · ${new Date(current.run.created_at).toISOString().slice(0, 10)}`;
    const [report] =
      await tx`insert into reports(org_id,project_id,title,payload) values (${user.org_id},${current.run.project_id},${title},${JSON.stringify(payload)}::jsonb) returning id`;
    return { id: report.id as string };
  });
}
export async function listReports(user: User, projectId: string) {
  await ownedProject(user, projectId);
  return sql`select id,title,created_at,payload->>'locale' as locale from reports where org_id=${user.org_id} and project_id=${projectId} order by created_at desc limit 100`;
}
export async function getReport(user: User, id: string) {
  uuidSchema.parse(id);
  const [report] = await sql<
    { id: string; title: string; payload: ReportPayload }[]
  >`select id,title,payload from reports where id=${id} and org_id=${user.org_id}`;
  if (!report) throw new AppError("not_found", 404);
  return report;
}
