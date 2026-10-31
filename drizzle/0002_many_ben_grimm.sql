CREATE TABLE "report_branding" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"agency_name" text NOT NULL,
	"logo_data" text
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"run_id" uuid,
	"missed_slots" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_occurrence_unique" UNIQUE("schedule_id","due_at")
);
--> statement-breakpoint
CREATE TABLE "measurement_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"interval_hours" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_project_unique" UNIQUE("project_id","org_id"),
	CONSTRAINT "schedule_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
ALTER TABLE "ai_responses" ADD COLUMN "grounding" jsonb;--> statement-breakpoint
ALTER TABLE "report_branding" ADD CONSTRAINT "report_branding_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_org_id_projects_id_org_id_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_schedule_id_org_id_measurement_schedules_id_org_id_fk" FOREIGN KEY ("schedule_id","org_id") REFERENCES "public"."measurement_schedules"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_schedules" ADD CONSTRAINT "measurement_schedules_project_id_org_id_projects_id_org_id_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_org_project_idx" ON "reports" USING btree ("org_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "schedule_event_org_idx" ON "schedule_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "schedule_due_idx" ON "measurement_schedules" USING btree ("enabled","next_run_at");