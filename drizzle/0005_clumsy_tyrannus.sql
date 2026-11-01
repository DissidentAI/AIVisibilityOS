CREATE TABLE "model_execution_limits" (
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"rpm" integer,
	"tpm" integer,
	"parallel" integer,
	"adaptive_parallel" integer DEFAULT 2 NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	"backoff" integer DEFAULT 0 NOT NULL,
	"next_start_at" timestamp with time zone,
	"observed" jsonb,
	"observed_at" timestamp with time zone,
	CONSTRAINT "model_execution_limits_org_id_provider_model_pk" PRIMARY KEY("org_id","provider","model"),
	CONSTRAINT "execution_limits_bounds" CHECK (("model_execution_limits"."rpm" is null or "model_execution_limits"."rpm" between 1 and 100000) and ("model_execution_limits"."tpm" is null or "model_execution_limits"."tpm" between 1000 and 100000000) and ("model_execution_limits"."parallel" is null or "model_execution_limits"."parallel" between 1 and 16) and "model_execution_limits"."adaptive_parallel" between 1 and 16)
);
--> statement-breakpoint
CREATE TABLE "provider_cooldowns" (
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"paused_until" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_cooldowns_org_id_provider_pk" PRIMARY KEY("org_id","provider")
);
--> statement-breakpoint
ALTER TABLE "model_execution_limits" ADD CONSTRAINT "model_execution_limits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_cooldowns" ADD CONSTRAINT "provider_cooldowns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;