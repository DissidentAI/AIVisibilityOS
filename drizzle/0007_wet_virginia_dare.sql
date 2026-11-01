CREATE TABLE "audit_ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"returned_model" text,
	"channel" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"answer" text,
	"raw" jsonb,
	"grounding" jsonb,
	"request_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "audit_ai_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"depth" integer NOT NULL,
	"http_status" integer,
	"error_code" text,
	"response_ms" integer,
	"bytes" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"facts" jsonb,
	CONSTRAINT "audit_page_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "audit_page_url_unique" UNIQUE("site_id","url")
);
--> statement-breakpoint
CREATE TABLE "audit_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"target" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"reason" text,
	"state" jsonb NOT NULL,
	"max_pages" integer NOT NULL,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	CONSTRAINT "audit_site_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "crawl_hosts" (
	"domain" text PRIMARY KEY NOT NULL,
	"next_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"language" text NOT NULL,
	"max_pages" integer NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "audit_ai_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_ai_jobs" ADD CONSTRAINT "audit_ai_jobs_audit_id_org_id_site_audits_id_org_id_fk" FOREIGN KEY ("audit_id","org_id") REFERENCES "public"."site_audits"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_site_id_org_id_audit_sites_id_org_id_fk" FOREIGN KEY ("site_id","org_id") REFERENCES "public"."audit_sites"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_sites" ADD CONSTRAINT "audit_sites_audit_id_org_id_site_audits_id_org_id_fk" FOREIGN KEY ("audit_id","org_id") REFERENCES "public"."site_audits"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_project_id_org_id_projects_id_org_id_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_ai_queue_idx" ON "audit_ai_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "audit_ai_rate_idx" ON "audit_ai_jobs" USING btree ("org_id","provider","model","started_at");--> statement-breakpoint
CREATE INDEX "audit_sites_queue_idx" ON "audit_sites" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "audit_project_idx" ON "site_audits" USING btree ("org_id","project_id","created_at");--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_audit_ai_id_audit_ai_jobs_id_fk" FOREIGN KEY ("audit_ai_id") REFERENCES "public"."audit_ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_audit_ai_id_unique" UNIQUE("audit_ai_id");