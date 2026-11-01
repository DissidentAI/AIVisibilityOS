import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reportMetrics, type ReportPayload } from "./reports";
import { retrySource } from "./run-insights";
const font = () =>
  readFileSync(
    join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      "noto-sans",
      "files",
      "noto-sans-latin-400-normal.woff",
    ),
  );
export async function renderReport(payload: ReportPayload, reportId: string): Promise<Buffer> {
  const t = (fr: string, en: string) => (payload.locale === "fr" ? fr : en);
  const d = payload.current,
    before = payload.previous;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, right: 48, bottom: 52, left: 48 },
    bufferPages: true,
    info: {
      Title: `AI Visibility · ${d.run.snapshot.project.name}`,
      Author: payload.branding.agency_name,
      CreationDate: new Date(payload.createdAt),
      ModDate: new Date(payload.createdAt),
    },
  });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("Report", font()).font("Report");
  const text = (s: string, size = 10, color = "#334155") => {
    doc.fontSize(size).fillColor(color).text(s, { lineGap: 4 });
    doc.moveDown(0.6);
  };
  const title = (s: string) => {
    if (doc.y > 700) doc.addPage();
    text(s, 17, "#0f172a");
  };
  const date = (s: string) => new Date(s).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  if (payload.branding.logo_data) {
    doc.image(Buffer.from(payload.branding.logo_data.split(",")[1], "base64"), 48, 42, {
      fit: [150, 45],
    });
    doc.y = 103;
  }
  text(payload.branding.agency_name, 11, "#0f766e");
  text(t("Rapport de visibilité IA", "AI visibility report"), 27, "#0f172a");
  text(`${d.run.snapshot.project.name} · ${d.run.snapshot.project.domain}`, 16);
  text(`${t("Campagne", "Campaign")} : ${date(d.run.created_at)}`);
  text(
    `${t("Généré", "Generated")} : ${date(payload.createdAt)} · ${t("Rapport", "Report")} ${reportId}`,
    8,
  );
  text(
    t(
      "Mesures issues d’API officielles. Elles ne représentent pas une observation des interfaces grand public ChatGPT ou Gemini.",
      "Measurements from official APIs. They do not represent observations of the consumer ChatGPT or Gemini interfaces.",
    ),
    10,
  );
  title(t("Résultats vérifiables", "Verifiable results"));
  for (const m of reportMetrics(d)) {
    const old = before ? reportMetrics(before).find((b) => b.id === m.id) : null;
    text(
      `${m.name} : ${m.mentioned}/${m.n} (${m.rate?.toFixed(1) ?? "—"}%)${old?.rate != null && m.rate != null ? ` · Δ ${(m.rate - old.rate).toFixed(1)} ${t("points", "points")}` : ""}`,
      12,
    );
    if (m.low != null)
      text(`Wilson 95% : ${m.low.toFixed(1)}–${m.high!.toFixed(1)}% · n=${m.n}`, 8);
  }
  text(
    `${t("Réponses valides / prévues", "Valid / planned responses")} : ${d.run.valid}/${d.run.total}. ${t("Échecs et réponses invalides exclus du dénominateur", "Failures and invalid responses excluded from the denominator")} : ${d.run.failed}.`,
  );
  if (before)
    text(
      `${t("Comparaison avec", "Compared with")} ${date(before.run.created_at)} · ${before.run.id}. ${t("Même configuration et mêmes modèles retournés. Une différence descriptive ne prouve pas une tendance ni une causalité.", "Same configuration and returned models. A descriptive difference does not prove a trend or causation.")}`,
    );
  if (payload.notes) {
    title(t("Commentaire de l’agence", "Agency commentary"));
    text(payload.notes);
  }
  doc.addPage();
  title(t("Méthode et limites", "Method and limitations"));
  text(
    t(
      "Visibility Score = taux de mention = 100 × réponses valides mentionnant explicitement la marque / réponses valides. Une réponse peut mentionner plusieurs marques. La présence du nom ou du domaine ne prouve ni une recommandation positive ni une position dans un classement.",
      "Visibility Score = mention rate = 100 × valid responses explicitly mentioning the brand / valid responses. A response may mention several brands. Name or domain presence does not establish a positive recommendation or an ordinal ranking.",
    ),
  );
  text(
    t(
      "Les intervalles de Wilson sont indicatifs : les réponses peuvent être corrélées. Les modèles varient, même à configuration identique. Le pays est un contexte de requête, pas une géolocalisation. Aucune garantie de visibilité future.",
      "Wilson intervals are indicative: responses may be correlated. Models vary even with identical configuration. Country is prompt context, not geolocation. No guarantee of future visibility.",
    ),
  );
  const snap = d.run.snapshot;
  if (retrySource(d))
    text(
      t(
        "Campagne de reprise : échantillon sélectionné après échec, exclu des comparaisons historiques automatiques. Les tentatives initiales et leurs coûts sont conservés séparément.",
        "Retry campaign: sample selected after failure, excluded from automatic historical comparisons. Original attempts and their costs are preserved separately.",
      ),
    );
  text(
    `${t("Mode", "Mode")} : ${snap.parameters.search === true ? t("API avec recherche web", "API with web search") : t("API sans recherche web", "API without web search")} · ${snap.project.language.toUpperCase()} / ${snap.project.country}`,
  );
  text(
    `${t("Modèles demandés", "Requested models")} : ${Object.entries(snap.models)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ")}`,
    9,
  );
  text(
    `${t("Modèles retournés", "Returned models")} : ${[...new Set(d.responses.map((r) => r.returned_model ?? t("non fourni", "not provided")))].join("; ")}`,
    9,
  );
  text(`${snap.methodology} · ${d.run.config_hash}`, 8);
  text(JSON.stringify(snap.parameters), 8);
  text(`${t("Instruction système exacte", "Exact system instruction")} : ${snap.system}`, 9);
  const known = d.responses.filter((r) => r.cost_micros !== null),
    cost = known.reduce((s, r) => s + r.cost_micros!, 0);
  text(
    `${t("Coût estimé connu", "Known estimated cost")} : ${known.length ? `$${(cost / 1e6).toFixed(4)} USD` : t("Inconnu", "Unknown")} · ${known.length}/${d.run.total} ${t("réponses avec coût connu", "responses with known cost")}. ${t("Estimation prudente, pas une facture. Les frais de recherche utilisent les tarifs payants sans déduire les franchises.", "Conservative estimate, not an invoice. Search fees use paid rates without deducting free allowances.")}`,
  );
  doc.addPage();
  title(t("Détail par question", "Results by question"));
  for (const q of snap.queries) {
    const valid = new Set(
      d.responses
        .filter((r) => r.query_text === q.text && r.status === "succeeded")
        .map((r) => r.id),
    );
    if (doc.y > 650) doc.addPage();
    text(q.text, 11, "#0f172a");
    for (const brand of snap.brands) {
      const n = new Set(
        d.mentions
          .filter((m) => m.brand_id === brand.id && valid.has(m.response_id))
          .map((m) => m.response_id),
      ).size;
      text(
        `${brand.name} : ${n}/${valid.size}${valid.size ? ` (${((100 * n) / valid.size).toFixed(1)}%)` : " —"}`,
        9,
      );
    }
  }
  doc.addPage();
  title(t("Extraits de preuves", "Evidence excerpts"));
  text(
    t(
      "Sélection des 20 premiers extraits de mentions par ordre de réponse. Le dossier JSON téléchargeable avec ce rapport conserve toutes les réponses, citations et paramètres figés.",
      "Selection of the first 20 mention excerpts in response order. The JSON evidence bundle downloadable alongside this report preserves all frozen responses, citations and parameters.",
    ),
    9,
  );
  let count = 0;
  for (const r of d.responses)
    for (const m of d.mentions.filter((m) => m.response_id === r.id)) {
      if (count++ >= 20) continue;
      if (doc.y > 620) doc.addPage();
      text(
        `${m.brand_name} · ${r.provider} · ${r.finished_at ? date(r.finished_at) : "—"}`,
        10,
        "#0f766e",
      );
      text(`${t("Réponse", "Response")} ${r.id} · ${r.returned_model ?? r.model}`, 8);
      text(r.query_text, 9);
      text(m.excerpt, 10);
      for (const c of d.citations.filter((c) => c.response_id === r.id).slice(0, 5)) {
        doc
          .fontSize(8)
          .fillColor("#0f766e")
          .text(`${c.title || c.domain}: ${c.url}`, { link: c.url, underline: true, lineGap: 3 });
        doc.moveDown(0.5);
      }
    }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(7)
      .fillColor("#64748b")
      .text(
        `${payload.branding.agency_name} · AI Visibility OS · ${i + 1}/${range.count}`,
        48,
        800,
        { lineBreak: false },
      );
  }
  doc.end();
  return complete;
}
