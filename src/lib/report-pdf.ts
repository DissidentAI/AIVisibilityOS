import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reportMetrics, type ReportPayload } from "./reports";
import { allAttempts, costSummary } from "./run-insights";
import { PROVIDER_LABELS } from "./provider-config";

/** Measured blocks avoid clipping; tables and proofs continue on a fresh page. */
export async function renderReport(payload: ReportPayload, reportId: string): Promise<Buffer> {
  const t = (fr: string, en: string, zh: string) =>
    payload.locale === "zh-CN" ? zh : payload.locale === "fr" ? fr : en;
  const detail = payload.current,
    snapshot = detail.run.snapshot,
    metrics = reportMetrics(detail),
    primary = metrics.find((b) => b.is_primary) ?? metrics[0];
  const colors = {
    ink: "#163D35",
    body: "#283E38",
    muted: "#52645E",
    line: "#DBE4DE",
    pale: "#F1F5EF",
    gold: "#E5B95D",
    white: "#FFFFFF",
  };
  const margin = 44,
    width = 507,
    bottom = 764;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 80, right: margin, bottom: 70, left: margin },
    bufferPages: true,
    autoFirstPage: false,
    info: {
      Title: `${t("Rapport de visibilité IA", "AI visibility report", "AI 可见度报告")} · ${snapshot.project.name}`,
      Author: payload.branding.agency_name,
      CreationDate: new Date(payload.createdAt),
      ModDate: new Date(payload.createdAt),
    },
  });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (b) => chunks.push(Buffer.from(b)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const latin = (weight: string) =>
    readFileSync(
      join(
        process.cwd(),
        "node_modules/@fontsource/noto-sans/files",
        `noto-sans-latin-${weight}-normal.woff`,
      ),
    );
  doc.registerFont("Regular", latin("400")).registerFont("Bold", latin("700"));
  doc.registerFont(
    "Chinese",
    readFileSync(join(process.cwd(), "src/assets/fonts/NotoSansCJKsc-Regular.otf")),
  );
  let y = 80,
    section = "",
    sectionNo = "";
  const selectFont = (s: string, bold = false) =>
    doc.font(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s)
        ? "Chinese"
        : bold
          ? "Bold"
          : "Regular",
    );
  const height = (s: string, size = 10, w = width, bold = false) =>
    selectFont(s, bold).fontSize(size).heightOfString(s, { width: w, lineGap: 3 });
  const put = (
    s: string,
    x: number,
    at: number,
    size = 10,
    color = colors.body,
    w = width,
    bold = false,
  ) => {
    selectFont(s, bold).fontSize(size).fillColor(color).text(s, x, at, { width: w, lineGap: 3 });
  };
  const date = (s: string) =>
    new Intl.DateTimeFormat(
      payload.locale === "zh-CN" ? "zh-CN" : payload.locale === "fr" ? "fr-FR" : "en-GB",
      { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" },
    ).format(new Date(s)) + " UTC";
  function page() {
    doc.addPage();
    y = 82;
    doc.rect(0, 0, 595.28, 8).fill(colors.ink);
    put("AI VISIBILITY OS", margin, 29, 9, colors.ink, 170, true);
    put(sectionNo + " / " + section, 230, 29, 8, colors.muted, 321);
    doc.moveTo(margin, 61).lineTo(551, 61).strokeColor(colors.line).lineWidth(0.6).stroke();
  }
  function ensure(h: number) {
    if (y + h > bottom) page();
  }
  function paragraph(s: string, size = 10, color = colors.body, bold = false) {
    const h = height(s, size, width, bold);
    ensure(h + 12);
    put(s, margin, y, size, color, width, bold);
    y += h + 12;
  }
  function heading(no: string, title: string, subtitle: string) {
    section = title;
    sectionNo = no;
    page();
    paragraph(title, 25, colors.ink, true);
    paragraph(subtitle, 10, colors.muted);
    y += 10;
  }
  function callout(title: string, body: string) {
    const h = height(title, 11, width - 32, true) + height(body, 10, width - 32) + 36;
    ensure(h + 14);
    doc.roundedRect(margin, y, width, h, 10).fill(colors.pale);
    put(title, margin + 16, y + 12, 11, colors.ink, width - 32, true);
    put(
      body,
      margin + 16,
      y + 22 + height(title, 11, width - 32, true),
      10,
      colors.body,
      width - 32,
    );
    y += h + 16;
  }
  const valid = detail.responses.filter((r) => r.status === "succeeded"),
    costs = costSummary(allAttempts(detail));
  const mentionIds = new Set(
    detail.mentions.filter((m) => m.brand_id === primary.id).map((m) => m.response_id),
  );
  const absentQuestions = snapshot.queries.filter((q) => {
    const rs = valid.filter((r) => r.query_text === q.text);
    return rs.length > 0 && !rs.some((r) => mentionIds.has(r.id));
  });
  heading(
    "01",
    t(
      "Votre marque, dans les réponses IA.",
      "Your brand in AI answers.",
      "您的品牌如何出现在 AI 回答中。",
    ),
    t(
      "Une synthèse pour décider, des preuves pour vérifier.",
      "A summary to guide decisions. Evidence to verify them.",
      "用清晰的摘要辅助决策，用证据核实结果。",
    ),
  );
  if (payload.branding.logo_data) {
    ensure(55);
    doc.image(Buffer.from(payload.branding.logo_data.split(",")[1], "base64"), margin, y, {
      fit: [130, 42],
    });
    y += 55;
  }
  paragraph(snapshot.project.name, 22, colors.ink, true);
  paragraph(`${snapshot.project.domain} · ${payload.branding.agency_name}`, 10, colors.muted);
  paragraph(
    `${t("Mesure du", "Measured", "测量时间")} ${date(detail.run.created_at)}`,
    9,
    colors.muted,
  );
  const cards = [
    [
      primary.rate == null ? "—" : `${primary.rate.toFixed(1)}%`,
      t("Taux de mention", "Mention rate", "品牌提及率"),
      `${primary.mentioned} / ${primary.n} ${t("réponses valides", "valid answers", "有效回答")}`,
    ],
    [
      `${detail.run.valid}/${detail.run.total}`,
      t("Réponses exploitables", "Usable answers", "有效回答数"),
      `${detail.run.failed} ${t("non exploitables", "unusable", "不可用回答")}`,
    ],
    [
      `${snapshot.queries.length}`,
      t("Questions étudiées", "Questions measured", "研究问题数"),
      `${snapshot.providers.length} ${t("fournisseurs API", "API providers", "API 供应商")}`,
    ],
  ];
  const cardW = (width - 20) / 3;
  const cardH = Math.max(
    ...cards.map((c) => height(c[1], 9, cardW - 24, true) + height(c[2], 8, cardW - 24) + 78),
  );
  ensure(cardH + 25);
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + 10);
    doc.roundedRect(x, y, cardW, cardH, 10).fill(i === 0 ? colors.ink : colors.pale);
    put(c[0], x + 12, y + 14, 25, i === 0 ? colors.gold : colors.ink, cardW - 24, true);
    put(c[1], x + 12, y + 55, 9, i === 0 ? colors.white : colors.body, cardW - 24, true);
    put(
      c[2],
      x + 12,
      y + 66 + height(c[1], 9, cardW - 24, true),
      8,
      i === 0 ? colors.white : colors.muted,
      cardW - 24,
    );
  });
  y += cardH + 25;
  callout(
    t("Comment lire ce résultat", "How to read this result", "如何理解结果"),
    t(
      `${primary.name} apparaît explicitement dans ${primary.mentioned} des ${primary.n} réponses valides. Ce pourcentage décrit cet échantillon précis, pas l’ensemble des réponses disponibles sur Internet.`,
      `${primary.name} is explicitly mentioned in ${primary.mentioned} of ${primary.n} valid answers. This percentage describes this specific sample, not all answers available online.`,
      `${primary.name} 在 ${primary.n} 条有效回答中被明确提及 ${primary.mentioned} 次。此比例仅描述本次样本，并不代表互联网上的所有回答。`,
    ),
  );
  paragraph(t("À retenir", "Key takeaways", "关键结论"), 14, colors.ink, true);
  paragraph(
    t(
      `${absentQuestions.length} question(s) avec des réponses valides ne mentionnent pas votre marque. Retrouvez ces sujets dans le détail par question.`,
      `${absentQuestions.length} question(s) with valid answers do not mention your brand. Review these topics in the question breakdown.`,
      `${absentQuestions.length} 个有有效回答的问题未提及您的品牌。请在逐题明细中查看这些主题。`,
    ),
  );
  paragraph(
    t(
      "Une mention ne signifie pas une recommandation. Un échec technique ne signifie pas une absence de la marque.",
      "A mention is not an endorsement. A technical failure is not evidence that the brand is absent.",
      "被提及不等于获得推荐。技术失败也不意味着品牌未被提及。",
    ),
    10,
    colors.muted,
  );
  if (payload.notes)
    callout(
      t("Le regard de votre agence", "Your agency’s perspective", "代理机构的解读"),
      payload.notes,
    );

  heading(
    "02",
    t("Votre paysage concurrentiel", "Your competitive landscape", "竞争格局"),
    t(
      "Même ensemble de réponses valides pour toutes les marques. Plusieurs marques peuvent être mentionnées dans une réponse.",
      "All brands use the same set of valid answers. A response can mention several brands.",
      "所有品牌均采用相同的有效回答样本。一条回答可以提及多个品牌。",
    ),
  );
  for (const m of metrics) {
    const labelH = height(m.name, 12, 340, true),
      h = labelH + 62;
    ensure(h);
    put(m.name, margin, y, 12, colors.ink, 340, true);
    put(`${m.mentioned}/${m.n} · ${m.rate?.toFixed(1) ?? "—"}%`, 405, y, 11, colors.ink, 146, true);
    const barY = y + labelH + 10;
    doc.roundedRect(margin, barY, width, 8, 4).fill(colors.pale);
    if (m.rate)
      doc
        .roundedRect(margin, barY, (width * m.rate) / 100, 8, 4)
        .fill(m.is_primary ? colors.ink : colors.gold);
    put(t("0%", "0%", "0%"), margin, barY + 13, 7, colors.muted, 30);
    put("100%", 519, barY + 13, 7, colors.muted, 32);
    y += h;
    if (m.low != null)
      paragraph(
        `${t("Fourchette indicative à 95 %", "Indicative 95% interval", "95% 参考区间")} : ${m.low.toFixed(1)}–${m.high!.toFixed(1)}% · n=${m.n}`,
        8,
        colors.muted,
      );
    if (payload.previous) {
      const old = reportMetrics(payload.previous).find((b) => b.id === m.id);
      if (old?.rate != null && m.rate != null)
        paragraph(
          `${t("Écart avec la campagne précédente", "Change from previous campaign", "与上次测量的差异")} : ${(m.rate - old.rate).toFixed(1)} ${t("points de pourcentage", "percentage points", "个百分点")}`,
          9,
        );
    }
  }
  if (payload.previous)
    callout(
      t("Comparaison avant / après", "Before / after comparison", "前后对比"),
      `${date(payload.previous.run.created_at)} → ${date(detail.run.created_at)}. ${t("Configuration et modèles comparables. Un écart descriptif ne prouve ni une tendance ni une causalité.", "Comparable configuration and models. A descriptive difference proves neither a trend nor causation.", "配置和模型具有可比性。数值变化并不能证明趋势或因果关系。")}`,
    );
  heading(
    "03",
    t("Les questions qui comptent", "The questions that matter", "值得关注的问题"),
    t(
      "Pour chaque question : mentions / réponses valides. « 0/0 » signifie qu’aucune réponse valide n’a été obtenue.",
      "For each question: mentions / valid answers. “0/0” means no valid answer was obtained.",
      "每个问题显示提及次数 / 有效回答数。“0/0”表示未获得有效回答。",
    ),
  );
  for (const [index, q] of snapshot.queries.entries()) {
    const rows = valid.filter((r) => r.query_text === q.text),
      ids = new Set(rows.map((r) => r.id));
    const labels = metrics.map((b) => {
      const n = new Set(
        detail.mentions
          .filter((m) => m.brand_id === b.id && ids.has(m.response_id))
          .map((m) => m.response_id),
      ).size;
      return `${b.name} : ${n}/${rows.length}`;
    });
    // Split large competitor lists into measured blocks. Repeat the question
    // on continuation pages so every ratio keeps its context, without truncation.
    const qh = height(q.text, 11, width - 32, true);
    const chunks: string[] = [];
    let pending: string[] = [];
    for (const label of labels) {
      const candidate = [...pending, label].join("   ·   ");
      if (pending.length && qh + height(candidate, 9, width - 32) + 65 > bottom - 82) {
        chunks.push(pending.join("   ·   "));
        pending = [];
      }
      pending.push(label);
    }
    if (pending.length) chunks.push(pending.join("   ·   "));
    for (const [part, body] of chunks.entries()) {
      const bh = height(body, 9, width - 32);
      ensure(qh + bh + 65);
      doc.roundedRect(margin, y, width, qh + bh + 48, 9).fill(colors.pale);
      put(
        `${String(index + 1).padStart(2, "0")}${part ? " · " + t("suite", "continued", "续") : ""}`,
        margin + 16,
        y + 10,
        8,
        colors.muted,
        width - 32,
      );
      put(q.text, margin + 16, y + 26, 11, colors.ink, width - 32, true);
      put(body, margin + 16, y + qh + 34, 9, colors.body, width - 32);
      y += qh + bh + 62;
    }
  }
  heading(
    "04",
    t("Les preuves derrière les chiffres", "Evidence behind the numbers", "数字背后的证据"),
    t(
      "Jusqu’à 8 réponses, dans leur ordre d’origine : un extrait par réponse, avec priorité à votre marque. L’export JSON du rapport contient toutes les réponses, citations et tentatives.",
      "Up to 8 responses in original order: one excerpt per response, prioritizing your brand. The report’s JSON export contains every answer, citation and attempt.",
      "按原始顺序展示最多 8 条回答的摘录，每条回答一个，优先展示您的品牌。报告的 JSON 导出包含所有回答、引用和尝试记录。",
    ),
  );
  let shown = 0;
  for (const r of detail.responses) {
    for (const m of detail.mentions
      .filter((m) => m.response_id === r.id)
      .sort((a, b) => Number(b.brand_id === primary.id) - Number(a.brand_id === primary.id))
      .slice(0, 1)) {
      if (shown++ >= 8) break;
      const label = `${m.brand_name} · ${PROVIDER_LABELS[r.provider]}`,
        snippet = m.excerpt;
      ensure(height(label, 11, width, true) + height(r.query_text, 9) + height(snippet, 10) + 105);
      paragraph(label, 11, colors.ink, true);
      paragraph(r.query_text, 9, colors.muted);
      paragraph(`“${snippet}”`, 10);
      paragraph(
        `${r.returned_model ?? r.model} · ${r.finished_at ? date(r.finished_at) : "—"}`,
        8,
        colors.muted,
      );
      paragraph(
        `ID ${r.id} · ${t("Tentative", "Attempt", "尝试")} ${r.attempt ?? 1}`,
        7,
        colors.muted,
      );
      const citations = detail.citations.filter((c) => c.response_id === r.id).slice(0, 3);
      for (const c of citations) {
        const label = `${c.domain} · ${c.url}`;
        ensure(height(label, 8) + 12);
        selectFont(label)
          .fontSize(8)
          .fillColor(colors.ink)
          .text(label, margin, y, { width, lineGap: 3, link: c.url, underline: true });
        y = doc.y + 12;
      }
      doc.moveTo(margin, y).lineTo(551, y).strokeColor(colors.line).stroke();
      y += 18;
    }
    if (shown >= 8) break;
  }
  if (!shown)
    paragraph(
      t(
        "Aucune mention explicite de marque dans les réponses valides. Les réponses intégrales restent consultables dans l’export JSON.",
        "No explicit brand mentions in valid answers. Full answers remain available in the JSON export.",
        "有效回答中没有明确提及品牌。完整回答仍可在 JSON 导出中查看。",
      ),
    );
  heading(
    "05",
    t("Méthode, périmètre et limites", "Method, scope and limitations", "方法、范围与局限"),
    t(
      "Ce que ce rapport mesure — et comment le vérifier.",
      "What this report measures and how to verify it.",
      "本报告测量的内容及核实方法。",
    ),
  );
  callout(
    t("Une formule simple et vérifiable", "A simple, verifiable formula", "简单、可核实的公式"),
    t(
      "Taux de mention = 100 × réponses valides mentionnant explicitement la marque ÷ réponses valides. Une marque compte au plus une fois par réponse. Le Visibility Score utilise exactement cette formule.",
      "Mention rate = 100 × valid answers explicitly mentioning the brand ÷ valid answers. Each brand counts at most once per answer. Visibility Score uses this exact formula.",
      "提及率 = 100 × 明确提及品牌的有效回答数 ÷ 有效回答总数。每条回答中，每个品牌最多计数一次。Visibility Score 使用相同公式。",
    ),
  );
  for (const [label, value] of [
    [
      t("Canal", "Channel", "渠道"),
      t(
        "API officielles, pas les interfaces grand public",
        "Official APIs, not consumer interfaces",
        "官方 API，并非面向消费者的界面",
      ),
    ],
    [
      t("Mode", "Mode", "模式"),
      snapshot.parameters.search === true
        ? t(
            "Recherche web demandée ; citations uniquement si retournées",
            "Web search requested; citations only when returned",
            "已请求网络搜索；仅保留实际返回的引用",
          )
        : t("Sans recherche web", "Without web search", "无网络搜索"),
    ],
    [
      t("Langue et marché", "Language and market", "语言和市场"),
      `${snapshot.project.language} / ${snapshot.project.country}`,
    ],
    [
      t("Échantillonnage", "Sampling", "抽样"),
      `${snapshot.queries.length} × ${snapshot.providers.length} × ${snapshot.samples} = ${detail.run.total}`,
    ],
    [t("Tentatives au total", "Total attempts", "总尝试次数"), String(allAttempts(detail).length)],
    [
      t("Coût connu estimé (USD)", "Known estimated cost (USD)", "已知估算费用（美元）"),
      `${costs.total == null ? "—" : `$${(costs.total / 1e6).toFixed(4)}`} · ${t("Les coûts inconnus restent indéterminés, ce n’est pas une facture.", "Unknown costs remain unknown; this is not an invoice.", "未知费用仍无法确定；本估算并非账单。")}`,
    ],
  ]) {
    paragraph(label, 9, colors.ink, true);
    paragraph(value, 10);
  }
  paragraph(t("Modèles demandés", "Requested models", "请求的模型"), 11, colors.ink, true);
  for (const [pr, model] of Object.entries(snapshot.models)) paragraph(`${pr} · ${model}`, 9);
  paragraph(t("Modèles retournés", "Returned models", "返回的模型"), 11, colors.ink, true);
  paragraph(
    [
      ...new Set(
        valid.map(
          (r) => `${r.provider} · ${r.returned_model ?? t("non fourni", "not provided", "未提供")}`,
        ),
      ),
    ].join("\n"),
    9,
  );
  paragraph(
    t(
      "Les modèles peuvent varier à configuration identique. Le pays indique un contexte textuel, pas une géolocalisation. Les intervalles de Wilson à 95 % supposent des réponses indépendantes ; les réponses peuvent être corrélées. Ils sont donc indicatifs, pas une garantie de précision.",
      "Models can vary under identical settings. Country is prompt context, not geolocation. The 95% Wilson intervals assume independent responses; answers may be correlated. They are indicative, not a guarantee of accuracy.",
      "在相同配置下，模型仍可能给出不同回答。国家仅作为提示文本的背景，并非地理定位。95% Wilson 区间假设回答相互独立，但回答可能相关。因此该区间仅供参考，不保证精确度。",
    ),
    10,
    colors.muted,
  );
  if (detail.run.retried || snapshot.parameters.retry)
    callout(
      t(
        "Cette campagne contient des reprises",
        "This campaign includes retries",
        "本次测量包含重试",
      ),
      t(
        "La dernière tentative par échantillon détermine les indicateurs ; les réussites précédentes restent conservées. Tous les coûts sont cumulés. La sélection après échec empêche une comparaison historique automatique fiable : cette campagne en est exclue.",
        "The latest attempt per sample determines metrics; earlier successful answers are retained. Costs include all attempts. Selection after failure prevents a reliable automatic historical comparison, so this campaign is excluded.",
        "指标采用每个样本的最新尝试，已有成功回答保持不变。费用包含所有尝试。失败后选择性重试会影响自动历史对比的可靠性，因此本次测量不参与此类对比。",
      ),
    );
  paragraph(
    t(
      "Les faits observés orientent des actions à tester. Aucune recommandation ne garantit une meilleure visibilité. Les réponses et questions originales ne sont pas traduites : la langue du rapport concerne sa présentation.",
      "Observed facts guide actions to test. No recommendation guarantees improved visibility. Original answers and questions are not translated: report language controls presentation.",
      "观察到的事实可用于提出待验证的行动，但任何建议都不保证可见度提升。原始回答和问题不会被翻译；报告语言仅控制展示内容。",
    ),
    10,
    colors.muted,
  );
  paragraph(
    `${t("Généré le", "Generated", "生成时间")} ${date(payload.createdAt)}\n${t("Campagne", "Campaign", "测量")} ${detail.run.id}\n${t("Rapport", "Report", "报告")} ${reportId}\n${snapshot.methodology}\nSHA256 ${detail.run.config_hash}`,
    8,
    colors.muted,
  );
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(margin, 788).lineTo(551, 788).strokeColor(colors.line).stroke();
    const footer = `${payload.branding.agency_name} · AI Visibility OS`;
    let clipped = footer;
    selectFont(footer).fontSize(7);
    while (doc.widthOfString(clipped) > 430) clipped = clipped.slice(0, -2) + "…";
    doc.fillColor(colors.muted).text(clipped, margin, 801, { lineBreak: false });
    selectFont("0123")
      .fontSize(7)
      .text(`${i + 1} / ${range.count}`, 510, 801, { lineBreak: false });
  }
  doc.end();
  return complete;
}
