export const AUDIT_VERSION = "public-html-v1";
export const AUDIT_AGENT = "AIVisibilityOSAudit";
export const AUDIT_LIMITS = {
  maxSites: 4,
  maxPages: 100,
  defaultPages: 50,
  maxDepth: 5,
  maxDiscovered: 1000,
  maxSitemaps: 5,
  maxBytes: 1_500_000,
  maxSiteBytes: 50_000_000,
  resourceTimeoutMs: 12_000,
  siteDurationMs: 20 * 60_000,
  minimumDelayMs: 1000,
} as const;
export type PageIssue = { code: string; severity: "error" | "warning" | "info"; evidence: string };
export type PageFacts = {
  title: string;
  description: string;
  language: string;
  canonical: string | null;
  noindex: boolean;
  robots: string;
  headings: { level: number; text: string }[];
  h1Count: number;
  wordCount: number;
  excerpt: string;
  contentHash: string;
  structuredTypes: string[];
  invalidJsonLd: number;
  images: number;
  imagesWithoutAlt: number;
  internalLinks: string[];
  externalLinkCount: number;
  issues: PageIssue[];
};
export type AuditTarget = { brandId: string; name: string; domain: string; primary: boolean };
export type CrawlEntry = { url: string; depth: number };
export type RobotsEvidence = {
  origin: string;
  url: string;
  status: number | null;
  body: string;
  error: string | null;
  fetchedAt: string;
};
export type CrawlState = {
  queue: CrawlEntry[];
  discovered: string[];
  robots: RobotsEvidence[];
  sitemaps: { url: string; status: number | null; error: string | null; urls: number }[];
  initialized: boolean;
  limits: string[];
  requests: number;
  bytes: number;
  nextAt: string | null;
};
export type AuditSite = {
  id: string;
  org_id: string;
  audit_id: string;
  target: AuditTarget;
  status: "queued" | "running" | "completed" | "partial" | "blocked" | "failed" | "cancelled";
  reason: string | null;
  state: CrawlState;
  max_pages: number;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  lease_token: string | null;
  lease_until: string | null;
};
export type AuditPage = {
  id: string;
  org_id: string;
  site_id: string;
  url: string;
  final_url: string | null;
  depth: number;
  http_status: number | null;
  error_code: string | null;
  response_ms: number | null;
  bytes: number;
  fetched_at: string;
  facts: PageFacts | null;
};
export type SiteAudit = {
  id: string;
  org_id: string;
  project_id: string;
  created_at: string;
  language: "fr" | "en" | "zh-CN";
  max_pages: number;
  version: string;
};
