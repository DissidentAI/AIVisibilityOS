"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Pause,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Globe2,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Wallet,
  X,
  ExternalLink,
  KeyRound,
  History,
  CalendarClock,
  FileText,
} from "lucide-react";
import { Button } from "./ui/button";
import { motion } from "motion/react";
import { PageTransition, useMotionPreferences } from "./ui/motion";
import { useMobileNavigation } from "./ui/use-mobile-navigation";
import { PROVIDERS, PROVIDER_LABELS, MODELS } from "@/lib/provider-config";
import {
  accountStorageKey,
  clearBrowserValue,
  readBrowserValue,
  saveBrowserValue,
  workspacePreferenceSchema,
} from "@/lib/browser-storage";
import { mentionRate, servingProvider } from "@/lib/measurement";
import type { State, Run, RunDetail, ResponseRecord } from "@/lib/types";
import {
  api,
  Modal,
  Field,
  Empty,
  ModalError,
  money,
  friendly,
  type Translate,
} from "./workspace/shared";
import { Metric, Comparison, HistoryChart } from "./workspace/analytics";
import { ProjectWizard } from "./workspace/project-wizard";
import { CampaignDialog } from "./workspace/campaign-dialog";
import { SchedulesPanel } from "./workspace/schedules-panel";
import { ReportsPanel } from "./workspace/reports-panel";
import { GroundedAnswer } from "./workspace/grounded-answer";
type Tab =
  | "overview"
  | "queries"
  | "competitors"
  | "sources"
  | "history"
  | "settings"
  | "usage"
  | "schedules"
  | "reports";
export function Workspace() {
  const [lang, setLang] = useState<"fr" | "en">("fr"),
    [dark, setDark] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const { reduced, paused, systemReduced, toggle: toggleMotion } = useMotionPreferences();
  const t: Translate = (fr, en) => (lang === "fr" ? fr : en);
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [setup, setSetup] = useState(false);
  const [tab, setTab] = useState<Tab>("overview"),
    [projectId, setProjectId] = useState(""),
    [runs, setRuns] = useState<Run[]>([]),
    [detail, setDetail] = useState<RunDetail | null>(null),
    [runId, setRunId] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [modal, setModal] = useState<
      "project" | "run" | "credential" | "query" | "brand" | "delete" | null
    >(null),
    [response, setResponse] = useState<ResponseRecord | null>(null);
  const { sidebarRef, shellRef, triggerRef, isMobile } = useMobileNavigation(mobile, () =>
    setMobile(false),
  );
  const project = state?.projects.find((p) => p.id === projectId);
  const activeRequest = useRef(0);
  useEffect(() => {
    setLang(document.documentElement.lang === "en" ? "en" : "fr");
    setDark(document.documentElement.dataset.theme !== "light");
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("avos-lang", lang);
      localStorage.setItem("avos-theme", dark ? "dark" : "light");
    } catch {
      // Browser storage is optional; settings still work for this visit.
    }
  }, [lang, dark, preferencesReady]);
  const refresh = useCallback(async () => {
    const s = await api<State>("state");
    setState(s);
    const saved = readBrowserValue(
      accountStorageKey("workspace", s.user),
      workspacePreferenceSchema,
    ).value;
    setProjectId((old) =>
      s.projects.some((p) => p.id === old)
        ? old
        : s.projects.some((p) => p.id === saved?.projectId)
          ? saved!.projectId
          : (s.projects[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    if (state && project)
      saveBrowserValue(
        accountStorageKey("workspace", state.user),
        { projectId: project.id },
        workspacePreferenceSchema,
      );
  }, [state?.user.id, state?.user.org_id, project?.id]);
  useEffect(() => {
    refresh()
      .catch(async (e) => {
        if (e.message === "unauthenticated") {
          const s = await api<{ setupRequired: boolean }>("auth/status");
          setSetup(s.setupRequired);
        } else setError(e.message);
      })
      .catch(() => setError("internal_error"))
      .finally(() => setLoading(false));
  }, [refresh]);
  const refreshRuns = useCallback(async () => {
    if (!projectId) {
      setRuns([]);
      setDetail(null);
      return;
    }
    const seq = ++activeRequest.current;
    const rs = await api<Run[]>(`runs?project=${projectId}`);
    if (seq !== activeRequest.current) return;
    setRuns(rs);
    const selected = rs.find((r) => r.id === runId)?.id ?? rs[0]?.id;
    if (!selected) {
      setDetail(null);
      return;
    }
    const d = await api<RunDetail>(`runs/${selected}`);
    if (seq === activeRequest.current) setDetail(d);
  }, [projectId, runId]);
  useEffect(() => {
    setDetail(null);
    refreshRuns().catch((e) => setError(e.message));
    return () => {
      activeRequest.current++;
    };
  }, [refreshRuns]);
  useEffect(() => {
    if (!state) return;
    const timer = setInterval(() => {
      Promise.all([refresh(), refreshRuns()]).catch((e) => setError(e.message));
    }, 8000);
    return () => clearInterval(timer);
  }, [state?.user.id, refresh, refreshRuns]);
  async function act(
    action: () => Promise<unknown>,
    message?: string,
    options?: { rethrow?: boolean },
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      // Selected run/project changes trigger their own effect; a stale callback here could reselect the previous campaign.
      setModal(null);
      if (message) setNotice(message);
    } catch (e) {
      if (options?.rethrow) throw e;
      setError(e instanceof Error ? e.message : "internal_error");
    } finally {
      setBusy(false);
    }
  }
  const nav = [
    { id: "overview", title: t("Vue d’ensemble", "Overview"), icon: LayoutDashboard },
    { id: "queries", title: t("Requêtes suivies", "Tracked queries"), icon: MessageSquareText },
    { id: "competitors", title: t("Concurrents", "Competitors"), icon: Users },
    { id: "sources", title: t("Sources & citations", "Sources & citations"), icon: Globe2 },
    { id: "history", title: t("Historique & exports", "History & exports"), icon: History },
    { id: "schedules", title: t("Planification", "Scheduling"), icon: CalendarClock },
    { id: "reports", title: t("Rapports clients", "Client reports"), icon: FileText },
    { id: "settings", title: t("Paramètres", "Settings"), icon: Settings2 },
    { id: "usage", title: t("Consommation", "Usage & budget"), icon: Wallet },
  ] as const;
  const valid = detail?.responses.filter((r) => r.status === "succeeded") ?? [];
  const primary = detail?.run.snapshot.brands.find((b) => b.is_primary);
  const count = primary
    ? new Set(detail?.mentions.filter((m) => m.brand_id === primary.id).map((m) => m.response_id))
        .size
    : 0;
  const metric = mentionRate(count, valid.length);
  const date = (value: string) =>
    new Date(value).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const status = (value: string) =>
    ({
      queued: t("En attente", "Queued"),
      running: t("En cours", "Running"),
      succeeded: t("Valide", "Valid"),
      failed: t("Échec", "Failed"),
      invalid: t("Non exploitable", "Invalid"),
      uncertain: t("Interrompue", "Interrupted"),
    })[value] ?? value;
  const controls = (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMotion}
        disabled={systemReduced}
        aria-pressed={!reduced}
        aria-label={t("Animations", "Animations")}
        title={
          systemReduced
            ? t("Animations réduites selon votre appareil", "Reduced motion follows your device")
            : paused
              ? t("Activer les animations", "Enable animations")
              : t("Mettre les animations en pause", "Pause animations")
        }
      >
        {reduced ? <Play size={16} /> : <Pause size={16} />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDark(!dark)}
        aria-label={t("Changer de thème", "Toggle theme")}
      >
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </Button>
      <button
        className="language"
        onClick={() => setLang(lang === "fr" ? "en" : "fr")}
        aria-label={t("Passer en anglais", "Switch to French")}
      >
        {lang.toUpperCase()} <ChevronDown size={12} />
      </button>
    </>
  );
  if (loading)
    return (
      <main className="auth" aria-busy="true">
        <div className="loading-mark" role="status">
          <Radio size={32} />
          <p>{t("Ouverture de votre espace…", "Opening your workspace…")}</p>
        </div>
      </main>
    );
  if (!state)
    return (
      <main className="auth auth-screen">
        <div className="auth-controls">{controls}</div>
        <div className="auth-brand">
          <div className="logo">
            <Radio size={22} />
          </div>
          <span>
            AI Visibility <b>OS</b>
          </span>
        </div>
        <div className="auth-layout">
          <section className="auth-story">
            <span className="edition-pill">
              <span /> {t("L’OBSERVATOIRE DE VOTRE MARQUE", "YOUR BRAND OBSERVATORY")}
            </span>
            <h2>
              {t("Entrez dans", "Become part of")}
              <br />
              <em>{t("la conversation.", "the conversation.")}</em>
            </h2>
            <p>
              {t(
                "Les IA parlent de votre secteur. Découvrez la place qu’elles donnent à votre marque, avec les réponses pour le prouver.",
                "AI is talking about your industry. Discover your brand’s place in the conversation, with the responses to prove it.",
              )}
            </p>
            <div className="signal-art" aria-hidden="true">
              <div className="signal-orbit orbit-one">
                <i />
              </div>
              <div className="signal-orbit orbit-two">
                <i />
              </div>
              <div className="signal-orbit orbit-three" />
              <div className="signal-core">
                <Radio size={40} strokeWidth={1.3} />
                <span>AI VISIBILITY</span>
              </div>
              <span className="signal-chip chip-one">
                <MessageSquareText size={14} /> {t("Mentions", "Mentions")}
              </span>
              <span className="signal-chip chip-two">
                <Globe2 size={14} /> {t("Sources vérifiables", "Verifiable sources")}
              </span>
              <span className="signal-chip chip-three">
                <ShieldCheck size={14} /> {t("Vos données", "Your data")}
              </span>
            </div>
            <div className="auth-principles">
              <span>
                <b>01</b> {t("Mesurez", "Measure")}
              </span>
              <span>
                <b>02</b> {t("Comparez", "Compare")}
              </span>
              <span>
                <b>03</b> {t("Prouvez", "Prove")}
              </span>
            </div>
          </section>
          <div className="card auth-card">
            <div className="auth-card-heading">
              <span className="eyebrow">COMMUNITY EDITION</span>
              <ShieldCheck size={18} />
            </div>
            <h1>
              {setup
                ? t("Votre visibilité, vos preuves.", "Your visibility. Your evidence.")
                : t("Bienvenue dans votre espace.", "Welcome to your workspace.")}
            </h1>
            <p className="muted">
              {setup
                ? t(
                    "Créez le compte propriétaire de cette installation pour commencer à mesurer.",
                    "Create this installation’s owner account to start measuring.",
                  )
                : t(
                    "Connectez-vous pour retrouver vos projets et vos mesures.",
                    "Sign in to access your projects and measurements.",
                  )}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await api(
                    `auth/${setup ? "register" : "login"}`,
                    "POST",
                    Object.fromEntries(data),
                  );
                  await refresh();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label={t("Adresse e-mail", "Email address")}>
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  autoComplete="username"
                  placeholder="vous@agence.fr"
                />
              </Field>
              <Field
                label={t("Mot de passe", "Password")}
                hint={t("12 caractères minimum.", "At least 12 characters.")}
              >
                <input
                  type="password"
                  name="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete={setup ? "new-password" : "current-password"}
                />
              </Field>
              {setup && (
                <Field
                  label={t("Code d’installation", "Setup code")}
                  hint={t(
                    "Le code privé fourni par l’administrateur de cette installation.",
                    "The private code provided by this installation’s administrator.",
                  )}
                >
                  <input type="password" name="bootstrapToken" required autoComplete="off" />
                </Field>
              )}
              {error && (
                <p role="alert" className="alert error">
                  {friendly(error, t)}
                </p>
              )}
              <Button className="full" disabled={busy}>
                {busy
                  ? t("Connexion…", "Connecting…")
                  : setup
                    ? t("Créer mon espace", "Create workspace")
                    : t("Se connecter", "Sign in")}
                <ArrowRight size={16} />
              </Button>
            </form>
          </div>
        </div>
        <p className="auth-foot">
          <ShieldCheck size={15} />
          {t(
            "Auto-hébergé. Clés chiffrées. Mesures traçables.",
            "Self-hosted. Encrypted keys. Traceable measurements.",
          )}
        </p>
      </main>
    );
  return (
    <ModalError.Provider value={error ? friendly(error, t) : ""}>
      <div className="workspace">
        <a href="#main-content" className="skip-link">
          {t("Aller au contenu", "Skip to content")}
        </a>
        <aside
          ref={sidebarRef}
          id="workspace-navigation"
          className={`sidebar ${mobile ? "sidebar-open" : ""}`}
          role={isMobile ? "dialog" : undefined}
          aria-modal={isMobile && mobile ? true : undefined}
          aria-label={t("Navigation principale", "Main navigation")}
        >
          <Button
            className="drawer-close"
            variant="ghost"
            size="icon"
            aria-label={t("Fermer le menu", "Close menu")}
            onClick={() => setMobile(false)}
          >
            <X size={19} />
          </Button>
          <a className="brand" href="/">
            <div className="logo">
              <Radio size={21} />
            </div>
            <span>
              AI Visibility <b>OS</b>
            </span>
          </a>
          <div className="workspace-label">{t("ESPACE DE TRAVAIL", "WORKSPACE")}</div>
          <div className="workspace-switch">
            <div className="avatar">C</div>
            <div>
              <strong>Community</strong>
              <small>{t("Installation privée", "Private installation")}</small>
            </div>
            <span className="badge">OSS</span>
          </div>
          <div className="nav-label">{t("ANALYSE", "ANALYTICS")}</div>
          <nav aria-label={t("Pages de l’espace", "Workspace pages")}>
            {nav.map((item) => (
              <button
                key={item.id}
                aria-label={item.title}
                className={`nav-item ${tab === item.id ? "active" : ""} ${item.id === "settings" ? "nav-separated" : ""}`}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => {
                  setTab(item.id);
                  setMobile(false);
                }}
              >
                {tab === item.id && (
                  <motion.span
                    className="nav-highlight"
                    layoutId="active-navigation"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 38,
                      duration: reduced ? 0 : undefined,
                    }}
                  />
                )}
                <item.icon size={18} />
                <span className="nav-title">{item.title}</span>
                {item.id === "queries" && project && (
                  <span className="nav-count">{project.queries.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="method-note">
              <ShieldCheck size={18} />
              <strong>{t("La preuve avant le score", "Evidence before scores")}</strong>
              <p>
                {t(
                  "Chaque indicateur renvoie aux réponses qui le composent.",
                  "Every metric links back to its underlying responses.",
                )}
              </p>
            </div>
            <div className="user-row">
              <div className="avatar user-avatar">{state.user.email[0].toUpperCase()}</div>
              <span title={state.user.email}>
                {state.user.email}
                <small>{t("Propriétaire", "Owner")}</small>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("Déconnexion", "Sign out")}
                onClick={async () => {
                  try {
                    await api("auth/logout", "POST");
                    setState(null);
                    setSetup(false);
                    setDetail(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <LogOut size={16} />
              </Button>
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label={t("Fermer la navigation", "Dismiss navigation")}
            onClick={() => setMobile(false)}
          />
        )}
        <div className="main-shell" ref={shellRef}>
          <header className="topbar">
            <div className="topbar-left">
              <Button
                className="mobile-menu"
                ref={triggerRef}
                aria-expanded={mobile}
                aria-controls="workspace-navigation"
                variant="ghost"
                size="icon"
                onClick={() => setMobile(!mobile)}
                aria-label="Menu"
              >
                <Menu size={20} />
              </Button>
              <span className="breadcrumb">{t("Espace de travail", "Workspace")}</span>
              <span className="muted">/</span>
              <strong>{nav.find((n) => n.id === tab)?.title}</strong>
            </div>
            <div className="topbar-right">
              <span className="worker-indicator">
                <i className={state.workerOnline ? "online" : "offline"} />
                {state.workerOnline
                  ? t("Worker actif", "Worker online")
                  : t("Worker arrêté", "Worker offline")}
              </span>
              {controls}
            </div>
          </header>
          <main className="content" id="main-content" tabIndex={-1}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  AI VISIBILITY OS / {t("OBSERVATOIRE", "OBSERVATORY")}
                </span>
                <h1>
                  <motion.span
                    key={tab}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {nav.find((n) => n.id === tab)?.title}
                  </motion.span>
                </h1>
                <p className="muted">
                  {t(
                    "Comprenez comment votre marque apparaît dans les réponses IA mesurées.",
                    "Understand how your brand appears in measured AI responses.",
                  )}
                </p>
              </div>
              <Button onClick={() => setModal("project")} variant="outline">
                <Plus size={16} />
                {t("Nouveau projet", "New project")}
              </Button>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {friendly(error, t)}
                <button onClick={() => setError("")} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div className="alert success" role="status">
                <Check size={17} />
                {notice}
              </div>
            )}
            <div className="scopebar">
              <div className="project-picker">
                <div className="project-symbol">
                  <Layers3 size={18} />
                </div>
                <select
                  aria-label={t("Projet actif", "Active project")}
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setRunId("");
                  }}
                >
                  {!state.projects.length && (
                    <option value="">{t("Aucun projet", "No project")}</option>
                  )}
                  {state.projects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {p.domain}
                    </option>
                  ))}
                </select>
              </div>
              <div className="scope-actions">
                <span className="badge">
                  <Globe2 size={12} />
                  {project ? `${project.country} · ${project.language.toUpperCase()}` : "FR / EN"}
                </span>
                <Button disabled={!project || busy} onClick={() => setModal("run")}>
                  <Play size={14} />
                  {t("Lancer une mesure", "Run measurement")}
                </Button>
              </div>
            </div>
            <div className="disclosure">
              <CircleHelp size={15} />
              <span>
                {t(
                  "Canal : API officielles. Ces mesures n’observent pas les interfaces grand public ChatGPT ou Gemini. Le pays est un contexte textuel, pas une géolocalisation.",
                  "Channel: official APIs. These measurements do not observe the consumer ChatGPT or Gemini interfaces. Country is prompt context, not geolocation.",
                )}
              </span>
            </div>
            <PageTransition key={tab}>
              {!["settings", "usage"].includes(tab) && !project ? (
                <div className="card welcome">
                  <span className="step-tag">01 — {t("PREMIER PROJET", "FIRST PROJECT")}</span>
                  <h2>
                    {t(
                      "Votre marque est-elle dans la conversation ?",
                      "Is your brand part of the conversation?",
                    )}
                  </h2>
                  <p className="muted">
                    {t(
                      "Ajoutez une marque, ses concurrents et les questions de vos clients. Connectez vos clés API pour obtenir vos premières réponses réelles.",
                      "Add a brand, its competitors and your customers’ questions. Connect your API keys to collect your first real responses.",
                    )}
                  </p>
                  <Button onClick={() => setModal("project")}>
                    {t("Configurer mon premier projet", "Set up my first project")}
                    <ArrowRight size={16} />
                  </Button>
                  <div className="welcome-steps">
                    {[
                      t("Définir les questions", "Define questions"),
                      t("Collecter les réponses", "Collect responses"),
                      t("Vérifier les mentions", "Verify mentions"),
                    ].map((s, i) => (
                      <div key={s}>
                        <span>0{i + 1}</span>
                        <strong>{s}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {project && !["settings", "usage"].includes(tab) && (
                <>
                  <div className="section-toolbar">
                    <div className="inline">
                      <span className="section-kicker">{t("CAMPAGNE", "CAMPAIGN")}</span>
                      <select
                        className="select-subtle"
                        aria-label={t("Campagne sélectionnée", "Selected campaign")}
                        value={detail?.run.id ?? ""}
                        onChange={(e) => setRunId(e.target.value)}
                      >
                        {!runs.length && (
                          <option value="">{t("Aucune mesure", "No measurements")}</option>
                        )}
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {date(r.created_at)} ·{" "}
                            {r.snapshot.parameters.search
                              ? t("Web", "Web")
                              : t("Sans web", "No web")}{" "}
                            · {r.valid}/{r.total}
                          </option>
                        ))}
                      </select>
                    </div>
                    {detail && (
                      <a className="text-link" href={`/api/runs/${detail.run.id}/export`}>
                        <ArrowDownToLine size={15} />
                        CSV
                      </a>
                    )}
                  </div>
                  {tab === "schedules" && (
                    <SchedulesPanel
                      key={project.id}
                      project={project}
                      state={state}
                      t={t}
                      date={date}
                      onRun={(id) => {
                        setRunId(id);
                        setTab("history");
                      }}
                    />
                  )}
                  {tab === "reports" && (
                    <ReportsPanel
                      key={project.id}
                      project={project}
                      detail={detail}
                      runs={runs}
                      t={t}
                      locale={lang}
                      date={date}
                    />
                  )}
                  {tab === "overview" && (
                    <>
                      <div className="stats-grid">
                        <Metric
                          label="Visibility Score"
                          value={metric.rate == null ? "—" : `${metric.rate.toFixed(1)}%`}
                          icon={<Activity size={18} />}
                          note={t(
                            "Taux de mention explicite · formule v1",
                            "Explicit mention rate · formula v1",
                          )}
                          sub={
                            valid.length
                              ? `${count} / ${valid.length} ${t("réponses valides", "valid responses")}`
                              : t("Aucune réponse valide", "No valid responses")
                          }
                        />
                        <Metric
                          label={t("Réponses valides", "Valid responses")}
                          value={detail ? String(valid.length) : "—"}
                          icon={<MessageSquareText size={18} />}
                          note={t(
                            "Les échecs sont exclus du dénominateur",
                            "Failures are excluded from the denominator",
                          )}
                          sub={
                            detail
                              ? `${detail.run.total} ${t("prévues", "planned")} · ${detail.run.pending} ${t("en attente", "pending")}`
                              : t(
                                  "En attente de la première campagne",
                                  "Awaiting your first campaign",
                                )
                          }
                        />
                        <Metric
                          label={t("Marques comparées", "Brands compared")}
                          value={String(
                            detail?.run.snapshot.brands.length ?? project.brands.length,
                          )}
                          icon={<Users size={18} />}
                          note={t(
                            "Même échantillon pour chaque marque",
                            "The same sample for every brand",
                          )}
                          sub={t("Marque principale + concurrents", "Primary brand + competitors")}
                        />
                        <Metric
                          label={t("Coût API estimé", "Estimated API cost")}
                          value={
                            detail
                              ? money(
                                  detail.responses.reduce((s, r) => s + (r.cost_micros ?? 0), 0),
                                )
                              : "—"
                          }
                          icon={<Wallet size={18} />}
                          note={t("USD · consommation connue uniquement", "USD · known usage only")}
                          sub={
                            detail?.responses.some(
                              (r) => r.status !== "queued" && r.cost_micros === null,
                            )
                              ? t("Des coûts restent inconnus", "Some costs remain unknown")
                              : t("Tarifs de référence, hors taxes", "Reference prices, before tax")
                          }
                        />
                      </div>
                      <div className="analytics-grid">
                        <section className="card">
                          <div className="card-heading">
                            <div>
                              <h2>{t("Visibilité dans le temps", "Visibility over time")}</h2>
                              <p>
                                {t(
                                  "Campagnes complètes, configuration et modèles identiques",
                                  "Complete campaigns with identical configuration and models",
                                )}
                              </p>
                            </div>
                            <span className="badge">{t("Taux de mention", "Mention rate")}</span>
                          </div>
                          <HistoryChart runs={runs} detail={detail} t={t} date={date} />
                        </section>
                        <section className="card">
                          <div className="card-heading">
                            <div>
                              <h2>{t("Part de présence", "Brand presence")}</h2>
                              <p>
                                {t(
                                  "Mentions dans les réponses valides",
                                  "Mentions in valid responses",
                                )}
                              </p>
                            </div>
                            <Users size={17} />
                          </div>
                          <Comparison detail={detail} t={t} />
                        </section>
                      </div>
                      <section className="card">
                        <div className="card-heading">
                          <div>
                            <h2>{t("Détail par fournisseur", "Provider breakdown")}</h2>
                            <p>
                              {t(
                                "Chaque canal est mesuré et identifié séparément",
                                "Each channel is measured and identified separately",
                              )}
                            </p>
                          </div>
                          <span className="badge">OFFICIAL API</span>
                        </div>
                        {detail ? (
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>{t("Fournisseur / modèle", "Provider / model")}</th>
                                  <th>{t("Réponses valides", "Valid responses")}</th>
                                  <th>{t("Mentions de la marque", "Brand mentions")}</th>
                                  <th>{t("Taux observé", "Observed rate")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.run.snapshot.providers.map((pr) => {
                                  const rows = valid.filter((r) => r.provider === pr),
                                    ids = new Set(rows.map((r) => r.id)),
                                    n = new Set(
                                      detail.mentions
                                        .filter(
                                          (m) =>
                                            m.brand_id === primary?.id && ids.has(m.response_id),
                                        )
                                        .map((m) => m.response_id),
                                    ).size;
                                  return (
                                    <tr key={pr}>
                                      <td>
                                        <strong>{PROVIDER_LABELS[pr]}</strong>
                                        <small className="block muted mono">
                                          {detail.run.snapshot.models[pr]}
                                        </small>
                                      </td>
                                      <td>{rows.length}</td>
                                      <td>
                                        {n} / {rows.length}
                                      </td>
                                      <td>
                                        {rows.length
                                          ? `${((100 * n) / rows.length).toFixed(1)}%`
                                          : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty title={t("Les preuves commencent ici", "Evidence starts here")}>
                            {t(
                              "Connectez au moins un fournisseur et lancez une campagne. Aucun résultat de démonstration n’est affiché.",
                              "Connect at least one provider and start a campaign. No demo results are displayed.",
                            )}
                          </Empty>
                        )}
                      </section>
                      <details className="methodology">
                        <summary>
                          <ShieldCheck size={16} />
                          {t(
                            "Méthodologie et limites de cette mesure",
                            "Methodology and measurement limits",
                          )}
                        </summary>
                        <p>
                          {t(
                            "Visibility Score = Brand Mention Rate = 100 × réponses valides mentionnant explicitement la marque / nombre de réponses valides. Une marque est comptée au plus une fois par réponse. Une mention ne signifie pas une recommandation.",
                            "Visibility Score = Brand Mention Rate = 100 × valid responses explicitly mentioning the brand / valid responses. Each brand is counted at most once per response. A mention is not an endorsement.",
                          )}
                        </p>
                        <p>
                          {metric.low != null
                            ? `${t("Intervalle de Wilson à 95 %", "95% Wilson interval")} : ${metric.low.toFixed(1)}–${metric.high!.toFixed(1)} %. `
                            : ""}
                          {t(
                            "L’intervalle décrit l’incertitude d’échantillonnage sous hypothèse d’indépendance. Les réponses peuvent être corrélées ; ce résultat ne représente pas toute la visibilité sur Internet. Pas de recherche web activée, pas de classement inventé.",
                            "The interval describes sampling uncertainty under an independence assumption. Responses may be correlated; this does not represent overall Internet visibility. Web search is not enabled. No invented rankings.",
                          )}
                        </p>
                      </details>
                    </>
                  )}
                  {tab === "queries" && (
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <h2>{t("Les questions de vos clients", "Your customers’ questions")}</h2>
                          <p>
                            {project.queries.length}/50{" "}
                            {t("requêtes configurées", "configured queries")}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setModal("query")}>
                          <Plus size={14} />
                          {t("Ajouter", "Add")}
                        </Button>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{t("Requête", "Query")}</th>
                              <th>{t("Échantillon valide", "Valid sample")}</th>
                              <th>{t("Présence de la marque", "Brand presence")}</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {project.queries.map((q) => {
                              const rows = valid.filter((r) => r.query_text === q.text),
                                ids = new Set(rows.map((r) => r.id)),
                                n = new Set(
                                  detail?.mentions
                                    .filter(
                                      (m) => ids.has(m.response_id) && m.brand_id === primary?.id,
                                    )
                                    .map((m) => m.response_id),
                                ).size;
                              return (
                                <tr key={q.id}>
                                  <td className="question-cell">{q.text}</td>
                                  <td>{rows.length || "—"}</td>
                                  <td>{rows.length ? `${n} / ${rows.length}` : "—"}</td>
                                  <td>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      disabled={busy}
                                      aria-label={t("Retirer la requête", "Remove query")}
                                      onClick={() => act(() => api(`queries/${q.id}`, "DELETE"))}
                                    >
                                      <Trash2 size={14} />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="card-note">
                        {t(
                          "Les changements s’appliquent à la prochaine campagne. Les campagnes passées gardent leur configuration d’origine.",
                          "Changes apply to the next campaign. Past campaigns retain their original configuration.",
                        )}
                      </div>
                    </section>
                  )}
                  {tab === "competitors" && (
                    <div className="analytics-grid">
                      <section className="card">
                        <div className="card-heading">
                          <div>
                            <h2>{t("Marques suivies", "Tracked brands")}</h2>
                            <p>{t("Noms explicites et domaines", "Explicit names and domains")}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => setModal("brand")}>
                            <Plus size={14} />
                            {t("Ajouter", "Add")}
                          </Button>
                        </div>
                        {project.brands.map((b) => (
                          <div className="brand-line" key={b.id}>
                            <div className="avatar">{b.name[0].toUpperCase()}</div>
                            <div className="grow">
                              <strong>{b.name}</strong>
                              <small className="block muted">{b.domain}</small>
                            </div>
                            {b.is_primary ? (
                              <span className="badge green">{t("Votre marque", "Your brand")}</span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={busy}
                                aria-label={t("Retirer le concurrent", "Remove competitor")}
                                onClick={() => act(() => api(`brands/${b.id}`, "DELETE"))}
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        ))}
                      </section>
                      <section className="card">
                        <div className="card-heading">
                          <div>
                            <h2>{t("Comparaison observée", "Observed comparison")}</h2>
                            <p>
                              {t(
                                "Un dénominateur commun, des preuves accessibles",
                                "Shared denominator, accessible evidence",
                              )}
                            </p>
                          </div>
                        </div>
                        <Comparison detail={detail} t={t} />
                      </section>
                    </div>
                  )}
                  {tab === "sources" && (
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <h2>
                            {t("Sources effectivement retournées", "Sources actually returned")}
                          </h2>
                          <p>
                            {t(
                              "Uniquement les annotations structurées des fournisseurs",
                              "Only structured provider annotations",
                            )}
                          </p>
                        </div>
                        <Globe2 size={18} />
                      </div>
                      {detail?.citations.length ? (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>{t("Source", "Source")}</th>
                                <th>{t("Provenance", "Provenance")}</th>
                                <th>{t("Preuve", "Evidence")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.citations.map((c, i) => (
                                <tr key={i}>
                                  <td>
                                    <a
                                      className="text-link"
                                      href={c.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {c.title || c.domain}
                                      <ExternalLink size={12} />
                                    </a>
                                    <small className="block muted">{c.domain}</small>
                                  </td>
                                  <td>{c.provenance}</td>
                                  <td>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        setResponse(
                                          detail.responses.find((r) => r.id === c.response_id) ??
                                            null,
                                        )
                                      }
                                    >
                                      {t("Voir la réponse", "View response")}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty
                          icon={<Globe2 size={24} />}
                          title={t("Aucune citation vérifiable", "No verifiable citations")}
                        >
                          {t(
                            "Activez le mode avec recherche web pour collecter les citations disponibles. Les liens écrits librement dans les réponses ne sont pas considérés comme des citations vérifiées.",
                            "Enable web search mode to collect available citations. Links written freely in response text are not treated as verified citations.",
                          )}
                        </Empty>
                      )}
                    </section>
                  )}
                  {tab === "history" && (
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <h2>{t("Journal des réponses", "Response ledger")}</h2>
                          <p>
                            {t(
                              "Question exacte, modèle, statut et réponse intégrale",
                              "Exact question, model, status and full response",
                            )}
                          </p>
                        </div>
                        <span className="badge">
                          {detail?.responses.length ?? 0} {t("exécutions", "executions")}
                        </span>
                      </div>
                      {detail ? (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>{t("Question", "Question")}</th>
                                <th>{t("Fournisseur", "Provider")}</th>
                                <th>{t("Statut", "Status")}</th>
                                <th>{t("Coût estimé", "Est. cost")}</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {detail.responses.map((r) => (
                                <tr key={r.id}>
                                  <td className="question-cell">
                                    {r.query_text}
                                    <small className="block muted">
                                      #{r.sample} ·{" "}
                                      {r.finished_at
                                        ? date(r.finished_at)
                                        : t("En attente", "Pending")}
                                    </small>
                                  </td>
                                  <td>
                                    {r.provider}
                                    <small className="block muted mono">
                                      {r.returned_model || r.model}
                                    </small>
                                  </td>
                                  <td>
                                    <span
                                      className={`badge ${r.status === "succeeded" ? "green" : ["failed", "invalid", "uncertain"].includes(r.status) ? "red" : ""}`}
                                    >
                                      {status(r.status)}
                                    </span>
                                  </td>
                                  <td>{r.cost_micros == null ? "—" : money(r.cost_micros)}</td>
                                  <td>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setResponse(r)}
                                    >
                                      {t("Ouvrir", "Open")}
                                      <ArrowRight size={13} />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty title={t("Votre historique est vide", "Your history is empty")}>
                          {t(
                            "La première campagne apparaîtra ici dès son lancement.",
                            "Your first campaign will appear here as soon as it starts.",
                          )}
                        </Empty>
                      )}
                    </section>
                  )}
                </>
              )}
              {tab === "settings" && (
                <>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h2>{t("Connexions API", "API connections")}</h2>
                        <p>
                          {t(
                            "Vos propres clés, chiffrées sur le serveur",
                            "Your own keys, encrypted on the server",
                          )}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => setModal("credential")}>
                        <KeyRound size={15} />
                        {t("Connecter une clé", "Connect a key")}
                      </Button>
                    </div>
                    {PROVIDERS.map((pr) => {
                      const connected = state.credentials.find((c) => c.provider === pr);
                      return (
                        <div className="integration-row" key={pr}>
                          <div className="integration-icon">
                            {pr === "kimi" ? (
                              <Moon size={22} />
                            ) : pr === "openrouter" ? (
                              <Layers3 size={22} />
                            ) : pr === "openai" ? (
                              <Sparkles size={22} />
                            ) : (
                              <Globe2 size={22} />
                            )}
                          </div>
                          <div className="grow">
                            <strong>{PROVIDER_LABELS[pr]}</strong>
                            <p>
                              {pr === "openrouter"
                                ? t(
                                    "Chat Completions API · 3 modèles au choix",
                                    "Chat Completions API · 3 model choices",
                                  )
                                : `${pr === "openai" ? "Responses" : pr === "gemini" ? "GenerateContent" : "Chat Completions"} API · ${MODELS[pr].name}`}
                            </p>
                          </div>
                          <span className={`badge ${connected ? "green" : ""}`}>
                            {connected
                              ? t("Clé enregistrée", "Key saved")
                              : t("À connecter", "Not connected")}
                          </span>
                          {connected && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy}
                              aria-label={t("Supprimer la clé", "Remove key")}
                              onClick={() => act(() => api(`credentials/${pr}`, "DELETE"))}
                            >
                              <Trash2 size={15} />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    <div className="card-note">
                      {t(
                        "La validité d’une clé est vérifiée lors d’une mesure réelle. Son enregistrement ne déclenche aucun appel payant.",
                        "Key validity is checked during a real measurement. Saving a key does not trigger a paid API call.",
                      )}
                    </div>
                  </section>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h2>{t("Données et confidentialité", "Data & privacy")}</h2>
                        <p>
                          {t(
                            "Exportez vos données ou supprimez votre espace",
                            "Export your data or delete your workspace",
                          )}
                        </p>
                      </div>
                      <ShieldCheck size={18} />
                    </div>
                    <div className="settings-actions">
                      <a className="btn btn-outline" href="/api/account/export">
                        <ArrowDownToLine size={15} />
                        {t("Exporter mes données", "Export my data")}
                      </a>
                      <Button variant="destructive" onClick={() => setModal("delete")}>
                        {t("Supprimer mon espace", "Delete my workspace")}
                      </Button>
                    </div>
                  </section>
                  <div className="card-note">
                    {t(
                      "Community : un propriétaire, plusieurs projets. Les invitations, le SSO et la facturation SaaS sont prévus après validation du MVP.",
                      "Community: one owner, multiple projects. Invitations, SSO and SaaS billing are planned after MVP validation.",
                    )}
                  </div>
                </>
              )}
              {tab === "usage" && (
                <>
                  <div className="stats-grid">
                    <Metric
                      label={t("Budget mensuel", "Monthly budget")}
                      value={money(state.usage.budget)}
                      sub={t("Plafond de votre organisation", "Organization ceiling")}
                      note={t("Mois calendaire UTC", "UTC calendar month")}
                      icon={<Wallet size={18} />}
                    />
                    <Metric
                      label={t("Engagé ce mois", "Committed this month")}
                      value={money(state.usage.amount)}
                      sub={t("Estimé + réservé + incertain", "Estimated + reserved + uncertain")}
                      note={t(
                        "Conservé après suppression d’un projet",
                        "Preserved after deleting a project",
                      )}
                      icon={<Activity size={18} />}
                    />
                    <Metric
                      label={t("Réservé", "Reserved")}
                      value={money(state.usage.reserved)}
                      sub={t("Exécutions en attente", "Pending executions")}
                      note={t("Réservation avant chaque campagne", "Reserved before each campaign")}
                      icon={<History size={18} />}
                    />
                    <Metric
                      label={t("Coût incertain", "Uncertain cost")}
                      value={money(state.usage.uncertain)}
                      sub={t(
                        "Réservations conservatrices conservées",
                        "Conservative reservations retained",
                      )}
                      note={t(
                        "À rapprocher des factures fournisseur",
                        "Reconcile against provider invoices",
                      )}
                      icon={<CircleHelp size={18} />}
                    />
                  </div>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h2>{t("Maîtrisez votre consommation", "Control your spending")}</h2>
                        <p>
                          {t(
                            "Community utilise vos clés. Aucun abonnement n’est facturé par cette application.",
                            "Community uses your keys. This application does not charge a subscription.",
                          )}
                        </p>
                      </div>
                    </div>
                    <form
                      className="budget-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        act(
                          () => api("budget", "POST", { usd: Number(f.get("usd")) }),
                          t("Budget enregistré.", "Budget saved."),
                        );
                      }}
                    >
                      <Field
                        label={t("Plafond mensuel en USD", "Monthly limit in USD")}
                        hint={`${t("Plafond serveur", "Server ceiling")} : ${money(state.usage.ceiling)}`}
                      >
                        <input
                          name="usd"
                          type="number"
                          min="0.01"
                          max={state.usage.ceiling / 1e6}
                          step="0.01"
                          defaultValue={state.usage.budget / 1e6}
                          required
                        />
                      </Field>
                      <Button disabled={busy}>{t("Enregistrer le budget", "Save budget")}</Button>
                    </form>
                    <div className="card-note">
                      {t(
                        "Les estimations reposent sur les tarifs du 31 octobre 2026. Elles ne sont pas des factures et ne limitent pas les appels réalisés en dehors de cette installation. Configurez aussi les limites chez vos fournisseurs.",
                        "Estimates use prices checked on 31 October 2026. They are not invoices and do not limit calls made outside this installation. Configure provider-side limits as well.",
                      )}
                    </div>
                  </section>
                </>
              )}
            </PageTransition>
            <footer className="page-footer">
              <span>
                AI Visibility OS <span className="muted">/</span> Community 0.2
              </span>
              <a
                href="https://github.com/DissidentAI/AIVisibilityOS"
                target="_blank"
                rel="noreferrer"
              >
                {t("Code source · AGPLv3", "Source code · AGPLv3")}
                <ExternalLink size={12} />
              </a>
            </footer>
          </main>
        </div>
        {modal === "project" && (
          <ProjectWizard
            key={state.user.id}
            storageKey={accountStorageKey("project-draft", state.user)}
            t={t}
            busy={busy}
            onClose={() => setModal(null)}
            onSave={(data, onCreated) =>
              act(
                async () => {
                  const result = await api<{ id: string }>("projects", "POST", data);
                  onCreated();
                  setModal(null);
                  setProjectId(result.id);
                  setRunId("");
                  setTab("settings");
                },
                t(
                  "Projet créé. Connectez vos clés API, puis lancez une mesure.",
                  "Project created. Connect your API keys, then run a measurement.",
                ),
                { rethrow: true },
              )
            }
          />
        )}
        {modal === "credential" && (
          <Modal
            title={t("Connecter un fournisseur", "Connect a provider")}
            onClose={() => setModal(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act(
                  () => api("credentials", "POST", Object.fromEntries(f)),
                  t(
                    "Clé chiffrée et enregistrée. Lancez une mesure pour vérifier la connexion.",
                    "Key encrypted and saved. Run a measurement to verify the connection.",
                  ),
                );
              }}
            >
              <Field label={t("Fournisseur", "Provider")}>
                <select name="provider">
                  {PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("Clé API", "API key")}
                hint={t(
                  "Cette clé n’est jamais renvoyée au navigateur.",
                  "This key is never returned to the browser.",
                )}
              >
                <input
                  name="key"
                  type="password"
                  minLength={20}
                  maxLength={512}
                  required
                  autoComplete="off"
                />
              </Field>
              <p className="muted small">
                {t(
                  "Vos questions sont envoyées au fournisseur choisi. N’incluez pas d’informations confidentielles sans autorisation.",
                  "Your questions are sent to the chosen provider. Do not include confidential information without authorization.",
                )}
              </p>
              <Button disabled={busy} className="full">
                {t("Enregistrer la clé", "Save key")}
              </Button>
            </form>
          </Modal>
        )}
        {modal === "run" && project && (
          <CampaignDialog
            project={project}
            state={state}
            t={t}
            busy={busy}
            onClose={() => setModal(null)}
            onSave={(data) =>
              act(
                async () => {
                  const r = await api<{ id: string }>("runs", "POST", data);
                  setRunId(r.id);
                  setTab("history");
                },
                t(
                  "Campagne mise en file. Les réponses apparaîtront automatiquement.",
                  "Campaign queued. Responses will appear automatically.",
                ),
              )
            }
          />
        )}
        {(modal === "query" || modal === "brand") && project && (
          <Modal
            title={
              modal === "query"
                ? t("Ajouter une question", "Add a question")
                : t("Ajouter un concurrent", "Add a competitor")
            }
            onClose={() => setModal(null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act(() =>
                  api(
                    `projects/${project.id}/${modal === "query" ? "queries" : "brands"}`,
                    "POST",
                    Object.fromEntries(f),
                  ),
                );
              }}
            >
              {modal === "query" ? (
                <Field label={t("Question exacte", "Exact question")}>
                  <textarea name="text" minLength={5} maxLength={1000} required rows={4} />
                </Field>
              ) : (
                <>
                  <Field label={t("Nom de la marque", "Brand name")}>
                    <input name="name" minLength={2} maxLength={100} required />
                  </Field>
                  <Field label={t("Domaine", "Domain")}>
                    <input name="domain" placeholder="example.com" required />
                  </Field>
                </>
              )}
              <Button disabled={busy}>{t("Ajouter", "Add")}</Button>
            </form>
          </Modal>
        )}
        {modal === "delete" && (
          <Modal
            title={t("Supprimer définitivement l’espace", "Permanently delete workspace")}
            onClose={() => setModal(null)}
          >
            <p className="muted">
              {t(
                "Tous les projets, réponses, clés et comptes de cet espace seront supprimés. Les sauvegardes relèvent de votre administrateur.",
                "All projects, responses, keys and accounts in this workspace will be deleted. Backups are managed by your administrator.",
              )}
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  await api("account", "DELETE", Object.fromEntries(f));
                  clearBrowserValue(accountStorageKey("project-draft", state.user));
                  clearBrowserValue(accountStorageKey("workspace", state.user));
                  for (const project of state.projects)
                    clearBrowserValue(accountStorageKey("campaign", state.user, project.id));
                  setModal(null);
                  setState(null);
                  setSetup(true);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label={t("Mot de passe actuel", "Current password")}>
                <input name="password" type="password" required />
              </Field>
              <Field label={t("Saisissez DELETE pour confirmer", "Type DELETE to confirm")}>
                <input name="confirm" pattern="DELETE" required />
              </Field>
              <Button variant="destructive" disabled={busy}>
                {t("Supprimer toutes mes données", "Delete all my data")}
              </Button>
            </form>
          </Modal>
        )}
        {response && (
          <Modal
            title={t("Preuve de mesure", "Measurement evidence")}
            onClose={() => setResponse(null)}
            wide
          >
            <div className="evidence-meta">
              <span className="badge">{PROVIDER_LABELS[response.provider]} · API</span>
              <span className="badge">{status(response.status)}</span>
              <span className="mono muted">{response.returned_model || response.model}</span>
            </div>
            <h3>{response.query_text}</h3>
            {response.provider === "openrouter" && (
              <p className="small muted">
                {t("Fournisseur d’exécution", "Serving provider")} :{" "}
                {servingProvider(response.parameters) ??
                  t("Non communiqué par OpenRouter", "Not reported by OpenRouter")}
              </p>
            )}
            <p className="muted small">
              {response.finished_at ? date(response.finished_at) : t("En attente", "Pending")} ·{" "}
              {t("Échantillon", "Sample")} #{response.sample} ·{" "}
              {response.cost_micros == null
                ? t("Coût inconnu", "Cost unknown")
                : money(response.cost_micros)}
            </p>
            <GroundedAnswer
              response={response}
              citations={detail?.citations.filter((c) => c.response_id === response.id) ?? []}
              t={t}
            />
            {response.error_code && <p className="alert error">{response.error_code}</p>}
            <h3>{t("Extraits justifiant les mentions", "Evidence supporting mentions")}</h3>
            {detail?.mentions
              .filter((m) => m.response_id === response.id)
              .map((m) => (
                <blockquote key={m.brand_id}>
                  <strong>{m.brand_name}</strong>
                  <p>{m.excerpt}</p>
                  <small className="muted">
                    {t(
                      "Contexte non classifié automatiquement : vérifiez l’extrait.",
                      "Context is not automatically classified: review the excerpt.",
                    )}
                  </small>
                </blockquote>
              ))}
            <details className="methodology">
              <summary>{t("Paramètres et traçabilité", "Parameters & provenance")}</summary>
              <pre>
                {JSON.stringify(
                  {
                    requestId: response.request_id,
                    requestedModel: response.model,
                    returnedModel: response.returned_model,
                    channel: response.channel,
                    inputTokens: response.input_tokens,
                    outputTokens: response.output_tokens,
                    parameters: response.parameters,
                    system: detail?.run.snapshot.system,
                    configuration: detail?.run.config_hash,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </Modal>
        )}
      </div>
    </ModalError.Provider>
  );
}
