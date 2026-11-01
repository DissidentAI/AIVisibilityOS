CREATE TABLE "geo_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'to_review' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"due_date" date,
	"target_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"evidence" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_action_request_unique" UNIQUE("org_id","request_id"),
	CONSTRAINT "geo_action_status_valid" CHECK ("geo_actions"."status" in ('to_review','planned','in_progress','published'))
);
--> statement-breakpoint
CREATE TABLE "query_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "query_view_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD COLUMN "theme" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD COLUMN "intent" text DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "geo_actions" ADD CONSTRAINT "geo_actions_project_id_org_id_projects_id_org_id_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_views" ADD CONSTRAINT "query_views_project_id_org_id_projects_id_org_id_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_actions_project_idx" ON "geo_actions" USING btree ("org_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "query_views_project_idx" ON "query_views" USING btree ("org_id","project_id");--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD CONSTRAINT "query_intent_valid" CHECK ("tracked_queries"."intent" in ('unspecified','discovery','comparison','purchase','support'));--> statement-breakpoint
ALTER TABLE "tracked_queries" ADD CONSTRAINT "query_priority_valid" CHECK ("tracked_queries"."priority" in ('low','normal','high'));