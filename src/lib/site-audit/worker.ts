import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { sql } from "../../db/client";
import { CrawlError, type CrawlFetcher } from "./network";
import { crawlSiteStep } from "./crawler";
import type { AuditSite, AuditPage } from "./types";
const CRAWL_LOCK = 824764;
async function pauseHost(domain: string, delay: number) {
  await sql`insert into crawl_hosts(domain,next_at,last_at) values(${domain},now()+${delay}*interval '1 millisecond',now()-interval '1 minute')
    on conflict(domain) do update set next_at=greatest(crawl_hosts.next_at,excluded.next_at)`;
}
async function paceHost(domain: string, delay: number) {
  const wait = await sql.begin(async (tx) => {
    await tx`insert into crawl_hosts(domain,next_at,last_at) values(${domain},now(),now()-interval '1 minute') on conflict do nothing`;
    const [slot] =
      await tx`select greatest(0,extract(epoch from(greatest(next_at,last_at+${delay}*interval '1 millisecond')-now()))*1000)::int as wait from crawl_hosts where domain=${domain} for update`;
    if (slot.wait > 10_500) throw new CrawlError("site_rate_limited");
    await tx`update crawl_hosts set last_at=now()+${slot.wait}*interval '1 millisecond' where domain=${domain}`;
    return slot.wait as number;
  });
  if (wait > 0) await setTimeout(wait);
}
export async function claimAuditSite(): Promise<AuditSite | undefined> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${CRAWL_LOCK})`;
    const [busy] =
      await tx`select 1 from audit_sites where status='running' and lease_until>now() limit 1`;
    if (busy) return undefined;
    const [site] = await tx<
      AuditSite[]
    >`update audit_sites set status='running',started_at=coalesce(started_at,now()),updated_at=now(),lease_token=${randomUUID()},lease_until=now()+interval '2 minutes'
      where id in(select id from audit_sites where status in ('queued','running') and (lease_until is null or lease_until<=now()) order by updated_at,id for update skip locked limit 1) returning *`;
    return site;
  });
}
export async function workAuditOnce(
  options: { fetcher?: CrawlFetcher; skipPolitenessTestOnly?: boolean } = {},
) {
  if (
    (options.fetcher || options.skipPolitenessTestOnly) &&
    (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  )
    throw new Error("Synthetic crawl fetchers are restricted to isolated test databases");
  const site = await claimAuditSite();
  if (!site) return false;
  const check = async () => {
    const [active] =
      await sql`select status,lease_token from audit_sites where id=${site.id} and org_id=${site.org_id}`;
    if (!active || active.status === "cancelled") throw new CrawlError("audit_cancelled");
    if (active.lease_token !== site.lease_token) throw new CrawlError("audit_lease_lost");
  };
  const heartbeat = setInterval(() => {
    void sql`update audit_sites set lease_until=now()+interval '2 minutes' where id=${site.id} and org_id=${site.org_id} and lease_token=${site.lease_token} and status='running'`.catch(
      () => {},
    );
  }, 15000);
  try {
    const pages = await sql<
      AuditPage[]
    >`select * from audit_pages where site_id=${site.id} and org_id=${site.org_id} order by fetched_at,id`;
    const step = await crawlSiteStep(site, pages, {
      fetcher: options.fetcher,
      check,
      pace: options.skipPolitenessTestOnly ? async () => {} : paceHost,
      pause: options.skipPolitenessTestOnly ? async () => {} : pauseHost,
    });
    await sql.begin(async (tx) => {
      const [active] =
        await tx`select id from audit_sites where id=${site.id} and org_id=${site.org_id} and lease_token=${site.lease_token} and status='running' for update`;
      if (!active) return;
      if (step.page) {
        const p = step.page;
        await tx`insert into audit_pages(org_id,site_id,url,final_url,depth,http_status,error_code,response_ms,bytes,fetched_at,facts)
          values(${site.org_id},${site.id},${p.url},${p.final_url},${p.depth},${p.http_status},${p.error_code},${p.response_ms},${p.bytes},${p.fetched_at},${p.facts ? JSON.stringify(p.facts) : null}::jsonb)
          on conflict(site_id,url) do nothing`;
      }
      await tx`update audit_sites set state=${JSON.stringify(step.state)}::jsonb,status=${step.status},reason=${step.reason},updated_at=now(),lease_token=null,lease_until=null,
        finished_at=case when ${step.status}='running' then null else now() end where id=${site.id} and org_id=${site.org_id}`;
    });
  } catch (error) {
    if (!(
      error instanceof CrawlError && ["audit_cancelled", "audit_lease_lost"].includes(error.code)
    ))
      throw error;
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
