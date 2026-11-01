import { ArrowUpRight, Lightbulb } from "lucide-react";
import type { RunDetail, ResponseRecord } from "@/lib/types";
import { editorialOpportunities } from "@/lib/run-insights";
import { PROVIDER_LABELS } from "@/lib/provider-config";
import { Button } from "../ui/button";
import { Empty, type Translate } from "./shared";

export function OpportunitiesPanel({
  detail,
  t,
  onOpen,
  date,
}: {
  detail: RunDetail | null;
  t: Translate;
  onOpen: (r: ResponseRecord) => void;
  date: (s: string) => string;
}) {
  const leads = detail ? editorialOpportunities(detail) : [];
  return (
    <section className="opportunities-panel">
      <div className="editorial-intro">
        <span className="section-kicker">
          {t("DES PREUVES AUX ACTIONS", "FROM EVIDENCE TO ACTION")}
        </span>
        <h2>{t("Les questions à approfondir.", "Questions worth exploring.")}</h2>
        <p>
          {t(
            "Des pistes éditoriales issues de vos réponses mesurées. Chaque observation est vérifiable ; les causes restent à examiner sur votre site.",
            "Editorial leads from your measured responses. Each observation can be verified; causes still need to be examined on your website.",
          )}
        </p>
      </div>
      {!leads.length ? (
        <div className="card">
          <Empty
            icon={<Lightbulb size={24} />}
            title={t(
              "Aucune piste étayée pour cette campagne",
              "No supported leads for this campaign",
            )}
          >
            {detail?.run.valid
              ? t(
                  "Aucun concurrent suivi n’est mentionné plus souvent que votre marque sur une même question. Cela ne prouve pas l’absence d’autres opportunités.",
                  "No tracked competitor is mentioned more often than your brand for the same question. This does not prove there are no other opportunities.",
                )
              : t(
                  "Collectez des réponses valides pour faire apparaître des observations vérifiables.",
                  "Collect valid responses to reveal verifiable observations.",
                )}
          </Empty>
        </div>
      ) : (
        leads.map((lead, index) => (
          <article className="opportunity-card" key={lead.query}>
            <div className="opportunity-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="opportunity-content">
              <h3>{lead.query}</h3>
              <dl>
                <div>
                  <dt>{t("Fait observé", "Observed fact")}</dt>
                  <dd>
                    {t(
                      `${lead.competitor} est mentionné dans ${lead.competitorCount} des ${lead.valid} réponses valides ; ${lead.primary} dans ${lead.own} des ${lead.valid} réponses.`,
                      `${lead.competitor} is mentioned in ${lead.competitorCount} of ${lead.valid} valid responses; ${lead.primary} in ${lead.own} of ${lead.valid} responses.`,
                      `在 ${lead.valid} 条有效回答中，${lead.competitor} 被提及 ${lead.competitorCount} 次，${lead.primary} 被提及 ${lead.own} 次。`,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("Hypothèse à vérifier", "Hypothesis to check")}</dt>
                  <dd>
                    {t(
                      "Votre contenu pourrait moins bien répondre à cette intention. Le contenu de votre site n’a pas été analysé : d’autres causes sont possibles.",
                      "Your content may address this intent less effectively. Your website content has not been analyzed: other causes are possible.",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("Action suggérée", "Suggested action")}</dt>
                  <dd>
                    {t(
                      "Relisez les réponses et les pages citées, puis vérifiez qu’une page utile et factuelle répond à cette question sur votre site. Mesurez de nouveau avec une campagne complète identique.",
                      "Review the responses and cited pages, then check whether a useful, factual page on your website answers this question. Measure again with an identical full campaign.",
                    )}
                  </dd>
                </div>
              </dl>
              {lead.domains.length > 0 && (
                <p className="small muted">
                  {t("Domaines cités dans ces preuves", "Domains cited in this evidence")} :{" "}
                  {lead.domains.join(" · ")}
                </p>
              )}
              <p className="small muted">
                {t(
                  "Échantillon limité à cette question et aux fournisseurs sélectionnés. Aucune cause démontrée ni garantie de visibilité.",
                  "Sample limited to this question and the selected providers. No demonstrated cause or visibility guarantee.",
                )}
              </p>
              <details className="opportunity-evidence">
                <summary>
                  {t(
                    `Consulter les ${lead.evidence.length} preuves de l’écart`,
                    `View ${lead.evidence.length} responses supporting the gap`,
                    `查看支持此差异的 ${lead.evidence.length} 条回答`,
                  )}
                </summary>
                <div>
                  {lead.evidence.map((r) => (
                    <Button key={r.id} variant="ghost" size="sm" onClick={() => onOpen(r)}>
                      {PROVIDER_LABELS[r.provider]} · #{r.sample} ·{" "}
                      {r.finished_at ? date(r.finished_at) : "—"}
                      <ArrowUpRight size={13} />
                    </Button>
                  ))}
                </div>
              </details>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
