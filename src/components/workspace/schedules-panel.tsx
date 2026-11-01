"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pause, Play, Settings2 } from "lucide-react";
import { Button } from "../ui/button";
import { api, Empty, friendly, type Translate } from "./shared";
import { CampaignDialog } from "./campaign-dialog";
import type { Schedule } from "@/lib/schedules";
import type { Project, State } from "@/lib/types";
type ScheduleState = {
  schedules: Schedule[];
  events: {
    id: string;
    due_at: string;
    outcome: string;
    reason: string | null;
    run_id: string | null;
    missed_slots: number;
  }[];
};
export function SchedulesPanel({
  project,
  state,
  t,
  date,
  onRun,
}: {
  project: Project;
  state: State;
  t: Translate;
  date: (s: string) => string;
  onRun: (id: string) => void;
}) {
  const [data, setData] = useState<ScheduleState | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(
    () => api<ScheduleState>(`schedules?project=${project.id}`).then(setData),
    [project.id],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch((e) => setError(e.message)), 8000);
    return () => clearInterval(timer);
  }, [refresh]);
  const schedule = data?.schedules[0];
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>
              {t(
                "Un suivi régulier, un budget maîtrisé",
                "Consistent monitoring, controlled spending",
              )}
            </h2>
            <p>
              {t(
                "Une programmation par projet · échéances persistantes",
                "One schedule per project · persistent due dates",
              )}
            </p>
          </div>
          <Button onClick={() => setOpen(true)} variant="outline">
            <CalendarClock size={16} />
            {t("Configurer le planning", "Configure schedule")}
          </Button>
        </div>
        {error && !open && <p className="alert error">{friendly(error, t)}</p>}
        {schedule ? (
          <div className="form-panel">
            <div className="inline">
              <span className={`badge ${schedule.enabled ? "green" : ""}`}>
                {schedule.enabled ? t("Actif", "Active") : t("En pause", "Paused")}
              </span>
              <strong>
                {schedule.interval_hours === 24
                  ? t("Toutes les 24 heures", "Every 24 hours")
                  : t("Tous les 7 jours", "Every 7 days")}
              </strong>
            </div>
            <p>
              {t("Prochaine échéance", "Next due date")} : {date(schedule.next_run_at)}
            </p>
            <p className="muted">
              {schedule.snapshot.queries.length} {t("questions figées", "frozen queries")} ·{" "}
              {schedule.snapshot.providers.join(" + ")} · {schedule.snapshot.samples}{" "}
              {t("échantillon(s)", "sample(s)")} ·{" "}
              {schedule.snapshot.parameters.search
                ? t("Avec recherche web", "With web search")
                : t("Sans recherche web", "Without web search")}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                action(() =>
                  api(`schedules/${schedule.id}`, "POST", { enabled: !schedule.enabled }),
                )
              }
            >
              {schedule.enabled ? <Pause size={15} /> : <Play size={15} />}
              {schedule.enabled
                ? t("Mettre en pause", "Pause schedule")
                : t("Reprendre le planning", "Resume schedule")}
            </Button>
            <p className="small muted">
              {t(
                "La reprise programme une nouvelle échéance dans un intervalle complet. Les campagnes déjà en file poursuivent leur exécution.",
                "Resuming sets the next due date one full interval from now. Already queued campaigns continue running.",
              )}
            </p>
          </div>
        ) : (
          <Empty
            icon={<CalendarClock size={25} />}
            title={t("Aucune mesure planifiée", "No scheduled measurements")}
          >
            {t(
              "Programmez votre prochaine campagne pour suivre les mêmes questions au fil du temps.",
              "Schedule your next campaign to follow the same questions over time.",
            )}
          </Empty>
        )}
        <div className="card-note">
          {t(
            "Chaque échéance vérifie les clés et le budget. Aucun rattrapage massif après un arrêt. Les échéances ignorées et leurs raisons apparaissent ci-dessous.",
            "Each due date checks credentials and budget. No bulk catch-up after downtime. Skipped occurrences and their reasons appear below.",
          )}
        </div>
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>{t("Journal des échéances", "Schedule activity")}</h2>
          <Settings2 size={18} />
        </div>
        {data?.events.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Échéance", "Due date")}</th>
                  <th>{t("Résultat", "Outcome")}</th>
                  <th>{t("Détail", "Details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id}>
                    <td>{date(e.due_at)}</td>
                    <td>
                      {e.outcome === "queued"
                        ? t("Mise en file", "Queued")
                        : t("Ignorée", "Skipped")}
                    </td>
                    <td>
                      {e.reason && friendly(e.reason, t)}
                      {e.run_id && (
                        <Button size="sm" variant="ghost" onClick={() => onRun(e.run_id!)}>
                          {t("Voir la campagne", "View campaign")}
                        </Button>
                      )}
                      {e.missed_slots > 0 && (
                        <small className="block muted">
                          {e.missed_slots}{" "}
                          {t(
                            "échéances antérieures non rattrapées",
                            "earlier occurrences not replayed",
                          )}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t("Aucune échéance traitée", "No occurrences processed")}>
            {t(
              "Le journal se remplira lors de la première échéance.",
              "Activity will appear at the first due date.",
            )}
          </Empty>
        )}
      </section>
      {open && (
        <CampaignDialog
          schedule
          initialSettings={
            schedule
              ? {
                  providers: schedule.snapshot.providers,
                  samples: schedule.snapshot.samples,
                  mode: schedule.snapshot.parameters.search ? "web" : "baseline",
                  openrouterModel: schedule.snapshot.models
                    .openrouter as import("@/lib/provider-config").OpenRouterModel,
                  intervalHours: schedule.interval_hours,
                  firstRunAt:
                    new Date(schedule.next_run_at) > new Date()
                      ? schedule.next_run_at
                      : new Date(Date.now() + 86400000).toISOString(),
                }
              : undefined
          }
          project={project}
          state={state}
          t={t}
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
          onSave={(p) => action(() => api("schedules", "POST", p))}
        />
      )}
    </>
  );
}
