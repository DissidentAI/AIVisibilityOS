import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  unique,
  index,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").defaultRandom().primaryKey();
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  budgetMicros: integer("budget_micros").default(10_000_000).notNull(),
  createdAt: created(),
});
export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: created(),
  },
  (t) => [index("users_org_idx").on(t.orgId)],
);
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("session_expiry_idx").on(t.expiresAt)],
);
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const credentials = pgTable(
  "credentials",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.provider] })],
);
export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    industry: text("industry").notNull(),
    language: text("language").notNull(),
    country: text("country").notNull(),
    createdAt: created(),
  },
  (t) => [unique("project_org_unique").on(t.id, t.orgId), index("projects_org_idx").on(t.orgId)],
);
export const brands = pgTable(
  "brands",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    primary: boolean("is_primary").default(false).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.orgId],
      foreignColumns: [projects.id, projects.orgId],
    }).onDelete("cascade"),
    index("brands_project_idx").on(t.projectId, t.orgId),
  ],
);
export const queries = pgTable(
  "tracked_queries",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id").notNull(),
    text: text("text").notNull(),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.orgId],
      foreignColumns: [projects.id, projects.orgId],
    }).onDelete("cascade"),
    unique("query_text_unique").on(t.projectId, t.text),
  ],
);
export const runs = pgTable(
  "measurement_runs",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: created(),
    configHash: text("config_hash").notNull(),
    snapshot: jsonb("snapshot").notNull(),
  },
  (t) => [
    unique("run_org_unique").on(t.id, t.orgId),
    foreignKey({
      columns: [t.projectId, t.orgId],
      foreignColumns: [projects.id, projects.orgId],
    }).onDelete("cascade"),
    index("runs_project_date_idx").on(t.projectId, t.orgId, t.createdAt),
  ],
);
export const responses = pgTable(
  "ai_responses",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    runId: uuid("run_id").notNull(),
    queryText: text("query_text").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    returnedModel: text("returned_model"),
    channel: text("channel").default("official_api").notNull(),
    sample: integer("sample").notNull(),
    parameters: jsonb("parameters").notNull(),
    status: text("status").default("queued").notNull(),
    answer: text("answer"),
    raw: jsonb("raw"),
    errorCode: text("error_code"),
    requestId: text("request_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costMicros: integer("cost_micros"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    foreignKey({ columns: [t.runId, t.orgId], foreignColumns: [runs.id, runs.orgId] }).onDelete(
      "cascade",
    ),
    unique("response_org_unique").on(t.id, t.orgId),
    unique("response_sample_unique").on(t.runId, t.queryText, t.provider, t.sample),
    index("responses_queue_idx").on(t.status, t.createdAt),
    index("responses_run_idx").on(t.runId, t.orgId),
  ],
);
export const mentions = pgTable(
  "brand_mentions",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    responseId: uuid("response_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    brandName: text("brand_name").notNull(),
    excerpt: text("excerpt").notNull(),
    matchedAlias: text("matched_alias").notNull(),
    sentiment: text("sentiment").default("not_classified").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.responseId, t.orgId],
      foreignColumns: [responses.id, responses.orgId],
    }).onDelete("cascade"),
    unique("mention_response_brand_unique").on(t.responseId, t.brandId),
  ],
);
export const citations = pgTable(
  "citations",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    responseId: uuid("response_id").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    provenance: text("provenance").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.responseId, t.orgId],
      foreignColumns: [responses.id, responses.orgId],
    }).onDelete("cascade"),
    index("citations_response_idx").on(t.responseId, t.orgId),
  ],
);
// Deliberately independent of project lifetime: deleting a project cannot reset spending.
export const usage = pgTable(
  "usage_records",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    responseId: uuid("response_id")
      .references(() => responses.id, { onDelete: "set null" })
      .unique(),
    amountMicros: integer("amount_micros").notNull(),
    kind: text("kind").default("reserved").notNull(),
    createdAt: created(),
  },
  (t) => [index("usage_org_date_idx").on(t.orgId, t.createdAt)],
);
export const workerHeartbeats = pgTable("worker_heartbeats", {
  id: text("id").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});
