import { z } from "zod";
import type { BrandScope } from "./brand-analysis";
import type { Brand } from "./measurement";
import type { ResponseRecord, Mention, Citation } from "./types";

export const ACTION_STATUSES = ["to_review", "planned", "in_progress", "published"] as const;
export const actionFieldsSchema = z.object({
  title: z.string().trim().min(3).max(200),
  status: z.enum(ACTION_STATUSES).default("to_review"),
  owner: z.string().trim().max(120).default(""),
  dueDate: z.iso.date().nullable().default(null),
  targetUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(2048)
        .refine((value) => {
          const u = new URL(value);
          return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
        }),
    ])
    .default(""),
  notes: z.string().trim().max(5000).default(""),
});
export type ActionFields = z.infer<typeof actionFieldsSchema>;
export type ActionEvidence = {
  campaignId: string;
  campaignDate: string;
  configHash: string;
  methodology: string;
  system: string;
  capturedAt: string;
  scope: BrandScope;
  brands: Brand[];
  queryId: string;
  query: string;
  valid: number;
  failed: number;
  pending: number;
  responses: ResponseRecord[];
  mentions: Mention[];
  citations: Citation[];
};
export type GeoAction = {
  id: string;
  project_id: string;
  title: string;
  status: ActionFields["status"];
  owner: string;
  due_date: string | null;
  target_url: string;
  notes: string;
  version: number;
  created_at: string;
  updated_at: string;
  evidence: ActionEvidence;
};
export type GeoActionSummary = Omit<GeoAction, "evidence"> & {
  campaign_id: string;
  query: string;
  evidence_count: number;
};
