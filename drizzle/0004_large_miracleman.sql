CREATE TABLE "response_retries" (
	"org_id" uuid NOT NULL,
	"source_response_id" uuid PRIMARY KEY NOT NULL,
	"retry_response_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_retries_retry_response_id_unique" UNIQUE("retry_response_id"),
	CONSTRAINT "retry_distinct_responses" CHECK ("response_retries"."source_response_id" <> "response_retries"."retry_response_id")
);
--> statement-breakpoint
ALTER TABLE "response_retries" ADD CONSTRAINT "response_retries_source_response_id_org_id_ai_responses_id_org_id_fk" FOREIGN KEY ("source_response_id","org_id") REFERENCES "public"."ai_responses"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_retries" ADD CONSTRAINT "response_retries_retry_response_id_org_id_ai_responses_id_org_id_fk" FOREIGN KEY ("retry_response_id","org_id") REFERENCES "public"."ai_responses"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retries_org_idx" ON "response_retries" USING btree ("org_id");