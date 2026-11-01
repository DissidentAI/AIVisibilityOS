import type { TransactionSql } from "postgres";
import { sql } from "../db/client";
/** All paid inference jobs share one execution budget, without sharing visibility metrics. */
export function apiWork(tx: TransactionSql | typeof sql) {
  return tx`(select id,org_id,provider,model,status,parameters,input_tokens,output_tokens,started_at from ai_responses
    union all select id,org_id,provider,model,status,parameters,input_tokens,output_tokens,started_at from audit_ai_jobs)`;
}
export function jobTable(kind?: string) {
  return kind === "site_audit" ? "audit_ai_jobs" : "ai_responses";
}
export function usageColumn(kind?: string) {
  return kind === "site_audit" ? "audit_ai_id" : "response_id";
}
