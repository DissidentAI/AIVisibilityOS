ALTER TABLE "ai_responses" DROP CONSTRAINT "response_sample_unique";--> statement-breakpoint
ALTER TABLE "ai_responses" ADD COLUMN "slot_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_responses" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "measurement_runs" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "measurement_runs" ADD CONSTRAINT "measurement_runs_campaign_id_org_id_measurement_runs_id_org_id_fk" FOREIGN KEY ("campaign_id","org_id") REFERENCES "public"."measurement_runs"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "responses_slot_idx" ON "ai_responses" USING btree ("org_id","slot_id","attempt");--> statement-breakpoint
CREATE INDEX "runs_campaign_idx" ON "measurement_runs" USING btree ("campaign_id","org_id");--> statement-breakpoint
ALTER TABLE "ai_responses" ADD CONSTRAINT "response_sample_unique" UNIQUE("run_id","query_text","provider","sample","attempt");--> statement-breakpoint
ALTER TABLE "ai_responses" ADD CONSTRAINT "response_attempt_positive" CHECK ("ai_responses"."attempt" >= 1);--> statement-breakpoint
-- Retain historical retry rows while exposing one canonical campaign.
-- Parent lookup uses text equality, so malformed legacy JSON cannot trigger UUID casts.
WITH RECURSIVE campaign_tree AS (
  SELECT r.id,r.org_id,r.project_id,r.id AS root_id,ARRAY[r.id] AS visited
  FROM measurement_runs r WHERE NOT EXISTS(
    SELECT 1 FROM measurement_runs parent WHERE parent.id::text=r.snapshot#>>'{parameters,retry,sourceRunId}'
      AND parent.org_id=r.org_id AND parent.project_id=r.project_id AND parent.id<>r.id
  )
  UNION ALL
  SELECT child.id,child.org_id,child.project_id,parent.root_id,parent.visited||child.id
  FROM measurement_runs child JOIN campaign_tree parent
    ON child.snapshot#>>'{parameters,retry,sourceRunId}'=parent.id::text
    AND child.org_id=parent.org_id AND child.project_id=parent.project_id
  WHERE NOT child.id=ANY(parent.visited) AND cardinality(parent.visited)<1000
)
UPDATE measurement_runs r SET campaign_id=tree.root_id FROM campaign_tree tree
WHERE r.id=tree.id AND r.org_id=tree.org_id AND tree.id<>tree.root_id;
--> statement-breakpoint
WITH RECURSIVE attempt_tree AS (
  SELECT a.id,a.org_id,a.slot_id,1 AS ordinal,ARRAY[a.id] AS visited
  FROM ai_responses a WHERE NOT EXISTS(SELECT 1 FROM response_retries edge WHERE edge.retry_response_id=a.id AND edge.org_id=a.org_id)
  UNION ALL
  SELECT child.id,child.org_id,parent.slot_id,parent.ordinal+1,parent.visited||child.id
  FROM attempt_tree parent JOIN response_retries edge ON edge.source_response_id=parent.id AND edge.org_id=parent.org_id
    JOIN ai_responses child ON child.id=edge.retry_response_id AND child.org_id=edge.org_id
  WHERE NOT child.id=ANY(parent.visited) AND cardinality(parent.visited)<1000
)
UPDATE ai_responses a SET slot_id=tree.slot_id,attempt=tree.ordinal FROM attempt_tree tree
WHERE a.id=tree.id AND a.org_id=tree.org_id;
