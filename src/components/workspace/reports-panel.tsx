"use client";
import { useCallback, useEffect, useState } from "react";
import { FileText, Download, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { api, Empty, Field, friendly, type Translate } from "./shared";
import type { Branding } from "@/lib/reports";
import type { Project, Run, RunDetail } from "@/lib/types";
type SavedReport = { id: string; title: string; created_at: string };
export function ReportsPanel({
  project,
  detail,
  runs,
  t,
  locale,
  date,
}: {
  project: Project;
  detail: RunDetail | null;
  runs: Run[];
  t: Translate;
  locale: "fr" | "en";
  date: (s: string) => string;
}) {
  const [reports, setReports] = useState<SavedReport[]>([]),
    [branding, setBranding] = useState<Branding>({
      agency_name: "AI Visibility OS",
      logo_data: null,
    });
  const [brandingReady, setBrandingReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [previous, setPrevious] = useState(""),
    [notes, setNotes] = useState("");
  const refresh = useCallback(
    () => api<SavedReport[]>(`reports?project=${project.id}`).then(setReports),
    [project.id],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    api<Branding>("branding")
      .then((b) => {
        setBranding(b);
        setBrandingReady(true);
      })
      .catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    setPrevious("");
  }, [detail?.run.id]);
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const candidates = detail
    ? runs.filter(
        (r) =>
          r.id !== detail?.run.id &&
          r.config_hash === detail?.run.config_hash &&
          r.pending === 0 &&
          r.valid === r.total &&
          new Date(r.created_at) < new Date(detail.run.created_at),
      )
    : [];
  return (
    <>
      {error && (
        <p className="alert error" role="alert">
          {friendly(error, t)}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <div className="analytics-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>{t("Préparer le rapport client", "Prepare client report")}</h2>
              <p>{t("PDF et dossier de preuves figés", "Frozen PDF and evidence bundle")}</p>
            </div>
            <FileText size={19} />
          </div>
          <form
            className="form-panel"
            onSubmit={(e) => {
              e.preventDefault();
              if (detail)
                action(
                  () =>
                    api("reports", "POST", {
                      runId: detail.run.id,
                      previousRunId: previous || null,
                      locale,
                      notes,
                    }),
                  t(
                    "Rapport enregistré. Téléchargez-le ci-dessous.",
                    "Report saved. Download it below.",
                  ),
                );
            }}
          >
            <p className="muted">
              {detail
                ? `${t("Campagne", "Campaign")} : ${date(detail.run.created_at)} · ${detail.run.valid}/${detail.run.total} ${t("réponses valides", "valid responses")}`
                : t("Sélectionnez une campagne terminée.", "Select a completed campaign.")}
            </p>
            <Field
              label={t("Comparaison avant/après", "Before/after comparison")}
              hint={t(
                "Les modèles réellement retournés seront également vérifiés à l’enregistrement.",
                "Actual returned models will also be checked when saving.",
              )}
            >
              <select value={previous} onChange={(e) => setPrevious(e.target.value)}>
                <option value="">
                  {t("Rapport de la campagne seule", "Current campaign only")}
                </option>
                {candidates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {date(r.created_at)} · n={r.valid}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t("Commentaire de l’agence", "Agency commentary")}
              hint={t(
                "Votre commentaire sera identifié séparément des résultats mesurés.",
                "Your commentary will be identified separately from measured results.",
              )}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={4}
              />
            </Field>
            <Button disabled={busy || !detail?.run.valid || !!detail?.run.pending}>
              <FileText size={15} />
              {t("Créer le rapport PDF", "Create PDF report")}
            </Button>
            <p className="small muted">
              {t(
                "Le rapport conserve les résultats et la personnalisation actuels. Les modifications ultérieures ne changent pas un rapport enregistré.",
                "The report preserves current results and branding. Later changes do not alter a saved report.",
              )}
            </p>
          </form>
        </section>
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>{t("Identité de votre agence", "Your agency branding")}</h2>
              <p>{t("Appliquée aux prochains rapports", "Applied to future reports")}</p>
            </div>
          </div>
          <form
            className="form-panel"
            onSubmit={(e) => {
              e.preventDefault();
              action(
                () =>
                  api("branding", "POST", {
                    agencyName: branding.agency_name,
                    logoData: branding.logo_data,
                  }),
                t("Identité enregistrée.", "Branding saved."),
              );
            }}
          >
            <Field label={t("Nom de l’agence", "Agency name")}>
              <input
                required
                disabled={!brandingReady || busy}
                maxLength={100}
                value={branding.agency_name}
                onChange={(e) => setBranding({ ...branding, agency_name: e.target.value })}
              />
            </Field>
            <Field
              label={t("Logo de l’agence", "Agency logo")}
              hint="PNG / JPEG · 250 Ko / KB · ≤ 1 048 576 pixels"
            >
              <input
                type="file"
                disabled={!brandingReady || busy}
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 250000 || !["image/png", "image/jpeg"].includes(file.type)) {
                    setError("invalid_logo");
                    return;
                  }
                  setBusy(true);
                  setError("");
                  try {
                    const data = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result));
                      reader.onerror = () => reject(new Error("invalid_logo"));
                      reader.readAsDataURL(file);
                    });
                    setBranding((b) => ({ ...b, logo_data: data }));
                  } catch {
                    setError("invalid_logo");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Field>
            {branding.logo_data && (
              <div className="brand-preview">
                <img alt={t("Logo de l’agence", "Agency logo")} src={branding.logo_data} />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setBranding({ ...branding, logo_data: null })}
                >
                  {t("Retirer le logo", "Remove logo")}
                </Button>
              </div>
            )}
            <Button variant="outline" disabled={busy || !brandingReady}>
              {t("Enregistrer l’identité", "Save branding")}
            </Button>
          </form>
        </section>
      </div>
      <section className="card">
        <div className="card-heading">
          <h2>{t("Rapports enregistrés", "Saved reports")}</h2>
          <span className="badge">{reports.length}</span>
        </div>
        {reports.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Rapport", "Report")}</th>
                  <th>{t("Création", "Created")}</th>
                  <th>{t("Téléchargements", "Downloads")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                    </td>
                    <td>{date(r.created_at)}</td>
                    <td>
                      <div className="inline">
                        <a className="text-link" href={`/api/reports/${r.id}/pdf`}>
                          <Download size={14} />
                          PDF
                        </a>
                        <a className="text-link" href={`/api/reports/${r.id}/data`}>
                          {t("Preuves JSON", "JSON evidence")}
                        </a>
                      </div>
                    </td>
                    <td>
                      <Button
                        disabled={busy}
                        size="icon"
                        variant="ghost"
                        aria-label={t("Supprimer le rapport", "Delete report")}
                        onClick={() =>
                          action(
                            () => api(`reports/${r.id}`, "DELETE"),
                            t("Rapport supprimé.", "Report deleted."),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<FileText size={25} />}
            title={t("Votre premier rapport client", "Your first client report")}
          >
            {t(
              "Une fois la campagne terminée, créez un rapport avec sa méthodologie et ses preuves.",
              "Once the campaign is complete, create a report with its methodology and evidence.",
            )}
          </Empty>
        )}
      </section>
      <p className="small muted">
        {t(
          "Les téléchargements nécessitent une session. Les rapports suivent la politique de conservation de l’installation et sont supprimés avec leur projet.",
          "Downloads require a session. Reports follow installation retention settings and are deleted with their project.",
        )}
      </p>
    </>
  );
}
