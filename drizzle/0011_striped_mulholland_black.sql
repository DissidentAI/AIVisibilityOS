CREATE TABLE "assistant_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"purpose" text NOT NULL,
	"context_hash" text NOT NULL,
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
	CONSTRAINT "assistant_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "assistant_id" uuid;--> statement-breakpoint
ALTER TABLE "assistant_jobs" ADD CONSTRAINT "assistant_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_jobs" ADD CONSTRAINT "assistant_jobs_project_id_org_id_projects_id_org_id_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_context_idx" ON "assistant_jobs" USING btree ("org_id","context_hash","created_at");--> statement-breakpoint
CREATE INDEX "assistant_queue_idx" ON "assistant_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "assistant_rate_idx" ON "assistant_jobs" USING btree ("org_id","provider","model","started_at");--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_assistant_id_assistant_jobs_id_fk" FOREIGN KEY ("assistant_id") REFERENCES "public"."assistant_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_assistant_id_unique" UNIQUE("assistant_id");