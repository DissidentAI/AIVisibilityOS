"use client";
import { TableScroll } from "./workspace/table-scroll";
import {
  evidenceHash,
  readEvidenceHash,
  proofTarget,
  emptyEvidenceFilters,
  type EvidenceFilters,
  type EvidenceTarget,
} from "@/lib/evidence-navigation";
import { CopyLink } from "./workspace/copy-link";
import { QueriesPanel } from "./workspace/queries-panel";
import { CampaignTimeline } from "./workspace/campaign-timeline";
import { translator, localeOf, intlLocale, type Locale } from "@/lib/i18n";
import { QuestionDialog, CompetitorDialog } from "./workspace/question-dialog";
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
  Lightbulb,
  RotateCcw,
} from "lucide-react";
import { BrandMark } from "./ui/brand-mark";
import { MAX_COMPETITORS } from "@/lib/project-limits";
import { Button } from "./ui/button";
import { motion } from "motion/react";
import { PageTransition, useMotionPreferences } from "./ui/motion";
import { useMobileNavigation } from "./ui/use-mobile-navigation";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_KEY_URLS,
  MODELS,
  OPENROUTER_MODEL_IDS,
  type Provider,
} from "@/lib/provider-config";
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
  isAborted,
  Modal,
  Field,
  Empty,
  ModalError,
  money,
  friendly,
  type Translate,
} from "./workspace/shared";
import { Metric, Comparison, HistoryChart } from "./workspace/analytics";
import { BrandScopeControl } from "./workspace/brand-scope";
import {
  brandScopeSchema,
  comparisonBrands,
  comparisonScope,
  type BrandScope,
} from "@/lib/brand-analysis";
import { ProjectEditor } from "./workspace/project-editor";
import { ProjectWizard } from "./workspace/project-wizard";
import { CampaignDialog } from "./workspace/campaign-dialog";
import { SchedulesPanel } from "./workspace/schedules-panel";
import { ReportsPanel } from "./workspace/reports-panel";
import { ExecutionSettings } from "./workspace/execution-settings";
import { GroundedAnswer } from "./workspace/grounded-answer";
import { HistoryPanel } from "./workspace/history-panel";
import { RetryDialog } from "./workspace/retry-dialog";
import { RunStatus } from "./workspace/run-status";
import { OpportunitiesPanel } from "./workspace/opportunities-panel";
import { SiteAuditPanel } from "./workspace/site-audit-panel";
import { canRetry, costSummary, allAttempts } from "@/lib/run-insights";
type Tab =
  | "overview"
  | "queries"
  | "competitors"
  | "sources"
  | "history"
  | "settings"
  | "usage"
  | "schedules"
  | "opportunities"
  | "audit"
  | "reports";
export function Workspace() {
  const [lang, setLang] = useState<Locale>("fr"),
    [dark, setDark] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const { reduced, paused, systemReduced, toggle: toggleMotion } = useMotionPreferences();
  const t: Translate = translator(lang);
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
      "project" | "edit-project" | "run" | "credential" | "query" | "brand" | "delete" | null
    >(null),
    [response, setResponse] = useState<ResponseRecord | null>(null);
  const [credentialProvider, setCredentialProvider] = useState<Provider>("openai");
  const [brandScope, setBrandScope] = useState<BrandScope>("current");
  const [brandScopeAccount, setBrandScopeAccount] = useState("");
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const [proofFilters, setProofFilters] = useState<EvidenceFilters>(emptyEvidenceFilters);
  useEffect(() => {
    const restore = () => {
      const target = readEvidenceHash(window.location.hash);
      setEvidenceTarget(target);
      setResponse(null);
      if (!target) {
        setProofFilters(emptyEvidenceFilters);
        if (window.location.hash.startsWith("#evidence?")) setError("invalid_input");
      }
    };
    restore();
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const key = accountStorageKey("brand-scope", state.user);
    setBrandScope(readBrowserValue(key, brandScopeSchema).value ?? "current");
    setBrandScopeAccount(key);
  }, [state?.user.id, state?.user.org_id]);
  useEffect(() => {
    if (state && brandScopeAccount === accountStorageKey("brand-scope", state.user))
      saveBrowserValue(brandScopeAccount, brandScope, brandScopeSchema);
  }, [brandScopeAccount, brandScope]);
  useEffect(() => {
    if (!state || !evidenceTarget) return;
    if (!state.projects.some((p) => p.id === evidenceTarget.projectId)) {
      setError("not_found");
      return;
    }
    setProjectId(evidenceTarget.projectId);
    setRunId(evidenceTarget.runId);
    setBrandScope(evidenceTarget.scope);
    setProofFilters(evidenceTarget.filters);
    setTab("history");
    setMobile(false);
  }, [state?.user.id, evidenceTarget]);
  useEffect(() => {
    if (
      !evidenceTarget?.responseId ||
      !detail ||
      detail.run.id !== evidenceTarget.runId ||
      comparisonScope(detail) !== evidenceTarget.scope
    )
      return;
    const found = allAttempts(detail).find((r) => r.id === evidenceTarget.responseId);
    setResponse(found ?? null);
    if (!found) setError("not_found");
  }, [detail, evidenceTarget]);
  function showEvidence(target: EvidenceTarget, replace = false) {
    const url = new URL(window.location.href);
    url.hash = evidenceHash(target);
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
    setEvidenceTarget(target);
    setResponse(null);
  }
  function clearEvidence() {
    const url = new URL(window.location.href);
    if (url.hash.startsWith("#evidence?")) {
      url.hash = "";
      window.history.replaceState(null, "", url);
    }
    setEvidenceTarget(null);
    setProofFilters(emptyEvidenceFilters);
    setResponse(null);
  }
  function openProof(r: ResponseRecord) {
    if (!detail) return;
    showEvidence({
      ...proofTarget(detail.run.project_id, detail.run.id, comparisonScope(detail), proofFilters),
      responseId: r.id,
    });
  }
  function closeProof() {
    setResponse(null);
    if (evidenceTarget?.responseId) {
      const { responseId: _responseId, ...target } = evidenceTarget;
      showEvidence(target, true);
    }
  }
  function showProofs(filters: Partial<EvidenceFilters>) {
    if (detail)
      showEvidence(
        proofTarget(detail.run.project_id, detail.run.id, comparisonScope(detail), {
          status: "succeeded",
          ...filters,
        }),
      );
  }
  const [returnToCampaign, setReturnToCampaign] = useState(false);
  const [retry, setRetry] = useState<{ detail: RunDetail; responseIds: string[] } | null>(null);
  const campaignPending = runs.some((r) => r.pending > 0);
  function openRetry(ids: string[]) {
    if (!detail) return;
    if (campaignPending) {
      setError("campaign_already_running");
      return;
    }
    setError("");
    closeProof();
    setRetry({ detail, responseIds: ids });
  }
  async function openRun(id: string) {
    try {
      // A retained child may outlive its source, and the selector lists only 100 runs.
      const d = await api<RunDetail>(`runs/${id}?brandScope=${brandScope}`);
      clearEvidence();
      setRuns((rs) => (rs.some((r) => r.id === d.run.id) ? rs : [d.run, ...rs]));
      setRunId(d.run.id);
      setDetail(d);
      setResponse(null);
      setTab("history");
    } catch (e) {
      setError(e instanceof Error ? e.message : "internal_error");
    }
  }
  const { sidebarRef, shellRef, triggerRef, isMobile } = useMobileNavigation(mobile, () =>
    setMobile(false),
  );
  const project = state?.projects.find((p) => p.id === projectId);
  const activeRequest = useRef(0);
  useEffect(() => {
    setLang(localeOf(document.documentElement.lang));
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
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const s = await api<State>("state", "GET", undefined, signal);
    if (signal?.aborted) return;
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
    const controller = new AbortController();
    refresh(controller.signal)
      .catch(async (e) => {
        if (isAborted(e)) return;
        if (e.message === "unauthenticated") {
          const s = await api<{ setupRequired: boolean }>(
            "auth/status",
            "GET",
            undefined,
            controller.signal,
          );
          setSetup(s.setupRequired);
        } else setError(e.message);
      })
      .catch((e) => {
        if (!isAborted(e)) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  const refreshRuns = useCallback(
    async (signal?: AbortSignal) => {
      if (!projectId) {
        setRuns([]);
        setDetail(null);
        return;
      }
      const seq = ++activeRequest.current;
      const rs = await api<Run[]>(`runs?project=${projectId}`, "GET", undefined, signal);
      if (seq !== activeRequest.current) return;
      setRuns(rs);
      // A retry contains only failed slots. Opening it by default hides the original
      // successful answers, including after a browser reload.
      const selected = runId || (rs.find((r) => !r.snapshot.parameters.retry) ?? rs[0])?.id;
      if (!selected) {
        setDetail(null);
        return;
      }
      let d: RunDetail;
      try {
        d = await api<RunDetail>(
          `runs/${selected}?brandScope=${brandScope}`,
          "GET",
          undefined,
          signal,
        );
      } catch (e) {
        if (seq !== activeRequest.current) return;
        if (e instanceof Error && e.message === "not_found") {
          setRunId("");
          setDetail(null);
          return;
        }
        throw e;
      }
      if (seq === activeRequest.current) {
        if (d.run.project_id !== projectId) {
          setRunId("");
          return;
        }
        if (!rs.some((r) => r.id === selected)) setRuns([d.run, ...rs]);
        setDetail(d);
      }
    },
    [projectId, runId, brandScope, project?.revision],
  );
  useEffect(() => {
    setDetail((current) =>
      current?.run.project_id === projectId &&
      (!runId || current.run.id === runId) &&
      comparisonScope(current) === brandScope
        ? current
        : null,
    );
    const controller = new AbortController();
    refreshRuns(controller.signal).catch((e) => {
      if (!isAborted(e)) setError(e.message);
    });
    return () => {
      controller.abort();
      activeRequest.current++;
    };
  }, [refreshRuns]);
  useEffect(() => {
    if (!state) return;
    const controller = new AbortController();
    let polling = false;
    const poll = async () => {
      if (document.hidden || polling || controller.signal.aborted) return;
      polling = true;
      try {
        await Promise.all([refresh(controller.signal), refreshRuns(controller.signal)]);
      } catch (e) {
        if (!isAborted(e)) setError(e instanceof Error ? e.message : "internal_error");
      } finally {
        polling = false;
      }
    };
    const timer = setInterval(poll, 8000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [state?.user.id, refresh, refreshRuns]);
  async function act(
    action: () => Promise<unknown>,
    message?: string,
    options?: { rethrow?: boolean; afterSuccess?: () => void },
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
      options?.afterSuccess?.();
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
    { id: "opportunities", title: t("Opportunités GEO", "GEO opportunities"), icon: Lightbulb },
    { id: "audit", title: t("Audit de site", "Site audit"), icon: Globe2 },
    { id: "history", title: t("Historique & exports", "History & exports"), icon: History },
    { id: "schedules", title: t("Planification", "Scheduling"), icon: CalendarClock },
    { id: "reports", title: t("Rapports clients", "Client reports"), icon: FileText },
    { id: "settings", title: t("Paramètres", "Settings"), icon: Settings2 },
    { id: "usage", title: t("Consommation", "Usage & budget"), icon: Wallet },
  ] as const;
  const valid = detail?.responses.filter((r) => r.status === "succeeded") ?? [];
  const primary = detail ? comparisonBrands(detail).find((b) => b.is_primary) : undefined;
  const count = primary
    ? new Set(detail?.mentions.filter((m) => m.brand_id === primary.id).map((m) => m.response_id))
        .size
    : 0;
  const metric = mentionRate(count, valid.length);
  const costs = costSummary(detail ? allAttempts(detail) : []);
  const date = (value: string) =>
    new Date(value).toLocaleString(intlLocale(lang), {
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
      <select
        className="language-select"
        aria-label={t("Langue de l’interface", "Interface language", "界面语言")}
        value={lang}
        onChange={(e) => setLang(localeOf(e.target.value))}
      >
        <option value="fr">Français</option>
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </>
  );
  if (loading)
    return (
      <main className="auth" aria-busy="true">
        <div className="loading-mark" role="status">
          <BrandMark large />
          <p>{t("Ouverture de votre espace…", "Opening your workspace…")}</p>
        </div>
      </main>
    );
  if (!state)
    return (
      <main className="auth auth-screen">
        <div className="auth-controls">{controls}</div>
        <div className="auth-brand">
          <BrandMark />
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
                <BrandMark large />
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
          role={isMobile && mobile ? "dialog" : undefined}
          aria-hidden={isMobile && !mobile ? true : undefined}
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
            <BrandMark />
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
                className={`nav-item ${tab === item.id ? "active" : ""} ${item.id === "settings" ? "nav-separated" : ""}`}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => {
                  clearEvidence();
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
                  <span className="nav-count" aria-hidden="true">
                    {project.queries.length}
                  </span>
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
                    clearEvidence();
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
                <Button
                  variant="outline"
                  disabled={!project || busy}
                  onClick={() => setModal("edit-project")}
                >
                  {t("Modifier le projet et le scan", "Edit project and scan")}
                </Button>
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
              {project && !["settings", "usage", "audit"].includes(tab) && (
                <>
                  <div className="section-toolbar">
                    <div className="inline">
                      <span className="section-kicker">{t("CAMPAGNE", "CAMPAIGN")}</span>
                      <select
                        className="select-subtle"
                        aria-label={t("Campagne sélectionnée", "Selected campaign")}
                        value={detail?.run.id ?? ""}
                        onChange={(e) => {
                          clearEvidence();
                          setRunId(e.target.value);
                        }}
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
                            {r.snapshot.parameters.retry ? t(" · Reprise", " · Retry") : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    {detail && (
                      <a
                        className="text-link"
                        download
                        href={`/api/runs/${detail.run.id}/export?brandScope=${comparisonScope(detail)}`}
                      >
                        <ArrowDownToLine size={15} />
                        CSV
                      </a>
                    )}
                  </div>
                  {runs.length > 0 && !["queries", "schedules"].includes(tab) && (
                    <BrandScopeControl
                      scope={brandScope}
                      onChange={(scope) => {
                        setBrandScope(scope);
                        if (evidenceTarget) showEvidence({ ...evidenceTarget, scope }, true);
                      }}
                      detail={detail}
                      t={t}
                    />
                  )}
                  {detail && ["overview", "history", "opportunities"].includes(tab) && (
                    <RunStatus
                      detail={detail}
                      t={t}
                      onRetry={openRetry}
                      onRun={openRun}
                      execution={state.execution}
                      retryDisabled={campaignPending}
                    />
                  )}
                  {tab === "opportunities" && (
                    <OpportunitiesPanel
                      key={project.id}
                      project={project}
                      detail={detail}
                      t={t}
                      date={date}
                      onOpen={openProof}
                    />
                  )}
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
                            detail ? comparisonBrands(detail).length : project.brands.length,
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
                          value={costs.total === null ? "—" : money(costs.total)}
                          icon={<Wallet size={18} />}
                          note={t("USD · consommation connue uniquement", "USD · known usage only")}
                          sub={
                            costs.unknown
                              ? t(
                                  `${costs.unknown} coûts inconnus · ${costs.known} connus`,
                                  `${costs.unknown} unknown costs · ${costs.known} known`,
                                  `${costs.unknown} 项费用未知 · ${costs.known} 项已知`,
                                )
                              : costs.pending
                                ? t(
                                    "Coût disponible après exécution",
                                    "Cost available after execution",
                                  )
                                : t(
                                    "Tarifs de référence, hors taxes",
                                    "Reference prices, before tax",
                                  )
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
                          <Comparison
                            detail={detail}
                            t={t}
                            onProofs={(brandId) => showProofs({ brandId })}
                          />
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
                          <TableScroll
                            label={t("Détail par fournisseur", "Provider breakdown", "供应商详情")}
                            t={t}
                          >
                            <table className="stacked-table">
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
                                      <td className="stacked-title">
                                        <strong>{PROVIDER_LABELS[pr]}</strong>
                                        <small className="block muted mono">
                                          {detail.run.snapshot.models[pr]}
                                        </small>
                                      </td>
                                      <td data-label={t("Réponses valides", "Valid responses")}>
                                        {rows.length}
                                      </td>
                                      <td data-label={t("Mentions de la marque", "Brand mentions")}>
                                        {n} / {rows.length}
                                      </td>
                                      <td data-label={t("Taux observé", "Observed rate")}>
                                        {rows.length
                                          ? `${((100 * n) / rows.length).toFixed(1)}%`
                                          : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </TableScroll>
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
                            "L’intervalle décrit l’incertitude d’échantillonnage sous hypothèse d’indépendance. Les réponses peuvent être corrélées ; ce résultat ne représente pas toute la visibilité sur Internet. Aucun classement n’est déduit d’une simple mention.",
                            "The interval describes sampling uncertainty under an independence assumption. Responses may be correlated; this does not represent overall Internet visibility. A mention alone does not imply a ranking.",
                            "该区间在独立性假设下描述抽样不确定性。回答可能相关；这些结果不代表整个互联网的可见度。仅凭提及不能推断排名。",
                          )}
                        </p>
                        {detail && (
                          <p>
                            {detail.run.snapshot.parameters.search
                              ? t(
                                  "Recherche web demandée. Son exécution et les citations sont vérifiables dans chaque réponse, uniquement lorsque le fournisseur les retourne.",
                                  "Web search was requested. Its execution and citations can be checked in each answer, only when returned by the provider.",
                                  "已请求网络搜索。仅当供应商返回相关信息时，才能在各回答中核实搜索执行情况及引用。",
                                )
                              : t(
                                  "Recherche web non demandée pour cette campagne.",
                                  "Web search was not requested for this campaign.",
                                  "本次测量未请求网络搜索。",
                                )}
                          </p>
                        )}
                      </details>
                    </>
                  )}
                  {tab === "queries" && (
                    <QueriesPanel
                      key={project.id}
                      project={project}
                      user={state.user}
                      detail={detail}
                      t={t}
                      onAdd={() => setModal("query")}
                      onRefresh={() => refresh()}
                      onProofs={(queryId, brandId) =>
                        showProofs({ queryId, brandId: brandId ?? "" })
                      }
                      onDelete={(id) => {
                        void act(() => api(`queries/${id}`, "DELETE"));
                      }}
                    />
                  )}
                  {tab === "competitors" && (
                    <div className="analytics-grid">
                      <section className="card">
                        <div className="card-heading">
                          <div>
                            <h2>{t("Marques suivies", "Tracked brands")}</h2>
                            <p>
                              {project.brands.filter((b) => !b.is_primary).length}/{MAX_COMPETITORS}{" "}
                              {t("concurrents", "competitors", "个竞争对手")} ·{" "}
                              {t("Noms explicites et domaines", "Explicit names and domains")}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              busy ||
                              project.brands.filter((b) => !b.is_primary).length >= MAX_COMPETITORS
                            }
                            onClick={() => setModal("brand")}
                          >
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
                        <p className="small muted competitor-scope-note">
                          {t(
                            "Ajoutez un concurrent pour le comparer aux réponses déjà enregistrées dans la vue « Concurrents actuels ». Aucun nouvel appel IA. La vue d’origine reste accessible.",
                            "Add a competitor to compare it with saved answers in the Current competitors view. No new AI calls. The original view remains available.",
                            "添加竞争对手后，可在“当前竞争对手”视图中与已保存的回答比较。无需新的 AI 调用，原始视图始终可用。",
                          )}
                        </p>
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
                        <Comparison
                          detail={detail}
                          t={t}
                          onProofs={(brandId) => showProofs({ brandId })}
                        />
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
                        <TableScroll label={t("Sources citées", "Cited sources", "引用来源")} t={t}>
                          <table className="stacked-table">
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
                                  <td className="stacked-title">
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
                                  <td data-label={t("Provenance", "Provenance")}>{c.provenance}</td>
                                  <td className="stacked-actions">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        const r = detail.responses.find(
                                          (r) => r.id === c.response_id,
                                        );
                                        if (r) openProof(r);
                                      }}
                                    >
                                      {t("Voir la réponse", "View response")}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableScroll>
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
                    <>
                      <CampaignTimeline
                        detail={detail}
                        runs={runs}
                        t={t}
                        date={date}
                        onRun={openRun}
                      />
                      <HistoryPanel
                        key={detail?.run.id ?? "empty"}
                        detail={detail}
                        t={t}
                        date={date}
                        status={status}
                        onOpen={openProof}
                        filters={proofFilters}
                        onFilters={(filters) => {
                          // Controlled inputs must keep their value during this event,
                          // before the evidence-navigation effect runs.
                          setProofFilters(filters);
                          if (detail)
                            showEvidence(
                              proofTarget(
                                detail.run.project_id,
                                detail.run.id,
                                comparisonScope(detail),
                                filters,
                              ),
                              true,
                            );
                        }}
                        onRetry={openRetry}
                        onRun={openRun}
                        onSettings={() => setTab("settings")}
                        retryDisabled={campaignPending}
                      />
                    </>
                  )}
                </>
              )}
              {project && tab === "audit" && (
                <SiteAuditPanel
                  key={project.id}
                  project={project}
                  state={state}
                  t={t}
                  date={date}
                />
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
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReturnToCampaign(false);
                          setModal("credential");
                        }}
                      >
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
                                    `Chat Completions API · ${OPENROUTER_MODEL_IDS.length} modèles au choix`,
                                    `Chat Completions API · ${OPENROUTER_MODEL_IDS.length} model choices`,
                                    `Chat Completions API · ${OPENROUTER_MODEL_IDS.length} 个可选模型`,
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
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              aria-label={`${t("Vérifier", "Check")} ${PROVIDER_LABELS[pr]}`}
                              onClick={() =>
                                act(
                                  () => api("credentials/check", "POST", { provider: pr }),
                                  t(
                                    "Authentification acceptée. Aucun scan payant n’a été lancé. L’accès aux modèles et le solde se vérifient lors d’une mesure.",
                                    "Authentication accepted. No paid scan was launched. Model access and balance are checked during a measurement.",
                                  ),
                                )
                              }
                            >
                              <ShieldCheck size={15} />
                              {t("Vérifier", "Check")}
                            </Button>
                          )}
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
                        "L’authentification est vérifiée sans génération de texte à la connexion et avant un lancement manuel. Ce contrôle ne garantit pas le solde ni l’accès à chaque modèle ou outil web.",
                        "Authentication is checked without generating text when connecting and before a manual launch. This check does not guarantee sufficient balance or access to every model or web tool.",
                      )}
                    </div>
                  </section>
                  <ExecutionSettings rows={state.execution ?? []} t={t} onSaved={refresh} />
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
                      <a className="btn btn-outline" download href="/api/account/export">
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
            providers={state.credentials.map((c) => c.provider)}
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
            onClose={() => setModal(returnToCampaign ? "run" : null)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act(
                  async () => {
                    const data = Object.fromEntries(f);
                    await api("credentials/check", "POST", data);
                    await api("credentials", "POST", data);
                  },
                  t(
                    "Authentification acceptée. Clé chiffrée et enregistrée, sans scan payant.",
                    "Authentication accepted. Key encrypted and saved without a paid scan.",
                  ),
                  {
                    afterSuccess: () => {
                      if (returnToCampaign) setModal("run");
                    },
                  },
                );
              }}
            >
              <Field label={t("Fournisseur", "Provider")}>
                <select
                  name="provider"
                  value={credentialProvider}
                  onChange={(e) => setCredentialProvider(e.target.value as Provider)}
                  disabled={busy}
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {PROVIDER_LABELS[provider]}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="small muted">
                {credentialProvider === "kimi"
                  ? t(
                      "Utilisez une clé de la plateforme API Kimi. Les clés Kimi Code et les abonnements au chat sont distincts.",
                      "Use a Kimi API Platform key. Kimi Code keys and chat subscriptions are separate.",
                    )
                  : credentialProvider === "mimo"
                    ? t(
                        "Utilisez une clé API Xiaomi à l’usage ; le Token Plan utilise une autre connexion.",
                        "Use a Xiaomi pay-as-you-go API key; Token Plan uses a separate connection.",
                      )
                    : t(
                        "Utilisez la clé de la plateforme API de ce fournisseur.",
                        "Use a key from this provider's API platform.",
                      )}{" "}
                <a
                  className="text-link"
                  href={PROVIDER_KEY_URLS[credentialProvider]}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Ouvrir la plateforme officielle", "Open official platform")}
                </a>
              </p>
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
                  disabled={busy}
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
        {modal === "edit-project" && project && (
          <ProjectEditor
            project={project}
            state={state}
            t={t}
            onClose={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              refresh().catch((e) => setError(e.message));
              setNotice(
                t(
                  "Réglages enregistrés pour les prochains scans.",
                  "Settings saved for future scans.",
                ),
              );
            }}
          />
        )}
        {modal === "run" && project && (
          <CampaignDialog
            project={project}
            state={state}
            t={t}
            busy={busy}
            requestedProvider={returnToCampaign ? credentialProvider : undefined}
            onConnect={(provider) => {
              setError("");
              setCredentialProvider(provider);
              setReturnToCampaign(true);
              setModal("credential");
            }}
            onClose={() => {
              setReturnToCampaign(false);
              setModal(null);
              refresh().catch((e) => setError(e.message));
            }}
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
        {retry && (
          <RetryDialog
            detail={retry.detail}
            responseIds={retry.responseIds}
            workerOnline={state.workerOnline}
            t={t}
            onClose={() => setRetry(null)}
            onCreated={() => {
              const sourceId = retry.detail.run.id;
              setRetry(null);
              setRunId(sourceId);
              setTab("history");
              setError("");
              setNotice(
                t(
                  "Reprise lancée dans la même campagne. Les réponses réussies sont conservées ; chaque question garde ses tentatives précédentes.",
                  "Retry started in the same campaign. Successful answers are kept; each question retains its previous attempts.",
                ),
              );
              refresh().catch((e) => setError(e.message));
              // A changed selection refreshes through the effect; an unchanged
              // selection needs an immediate refresh to show the retry links.
              if (runId === sourceId) refreshRuns().catch((e) => setError(e.message));
            }}
          />
        )}
        {modal === "query" && project && (
          <QuestionDialog
            project={project}
            state={state}
            t={t}
            busy={busy}
            onClose={() => setModal(null)}
            onSave={(texts) => act(() => api(`projects/${project.id}/queries`, "POST", { texts }))}
          />
        )}
        {modal === "brand" && project && (
          <CompetitorDialog
            project={project}
            state={state}
            hasMeasurements={runs.length > 0}
            t={t}
            busy={busy}
            onClose={() => setModal(null)}
            onSave={(brand) => act(() => api(`projects/${project.id}/brands`, "POST", brand))}
          />
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
                  clearBrowserValue(accountStorageKey("brand-scope", state.user));
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
          <Modal title={t("Preuve de mesure", "Measurement evidence")} onClose={closeProof} wide>
            <div className="evidence-meta">
              <span className="badge">{PROVIDER_LABELS[response.provider]} · API</span>
              <span className="badge">{status(response.status)}</span>
              <span className="mono muted">{response.returned_model || response.model}</span>
            </div>
            <h3>{response.query_text}</h3>
            {detail && (
              <CopyLink
                t={t}
                hash={evidenceHash({
                  ...proofTarget(
                    detail.run.project_id,
                    detail.run.id,
                    comparisonScope(detail),
                    proofFilters,
                  ),
                  responseId: response.id,
                })}
              />
            )}
            {response.provider === "openrouter" && (
              <p className="small muted">
                {t("Fournisseur d’exécution", "Serving provider")} :{" "}
                {servingProvider(response.parameters) ??
                  t("Non communiqué par OpenRouter", "Not reported by OpenRouter")}
              </p>
            )}
            <p className="muted small">
              {response.finished_at ? date(response.finished_at) : t("En attente", "Pending")} ·{" "}
              {t("Échantillon", "Sample")} #{response.sample} · {t("Tentative", "Attempt")}{" "}
              {response.attempt ?? 1} ·{" "}
              {response.cost_micros == null
                ? t("Coût inconnu", "Cost unknown")
                : money(response.cost_micros)}
            </p>
            <GroundedAnswer
              response={response}
              citations={[
                ...(detail?.citations ?? []),
                ...(detail?.previousCitations ?? []),
              ].filter((c) => c.response_id === response.id)}
              t={t}
            />
            {response.error_code && (
              <p className="alert error">
                {friendly(
                  response.error_code === "provider_http_401"
                    ? `provider_auth_rejected_${response.provider}`
                    : response.provider === "mimo" && response.error_code === "provider_http_400"
                      ? "mimo_http_400"
                      : response.error_code,
                  t,
                )}
              </p>
            )}
            {response.retry_run_id ? (
              <Button variant="outline" onClick={() => openRun(response.retry_run_id!)}>
                {t("Voir la reprise", "View retry")}
                <ArrowRight size={15} />
              </Button>
            ) : (
              canRetry(response) && (
                <Button
                  variant="outline"
                  disabled={campaignPending}
                  onClick={() => openRetry([response.id])}
                >
                  <RotateCcw size={15} />
                  {t("Réessayer cette réponse", "Retry this response")}
                </Button>
              )
            )}
            <h3>{t("Extraits justifiant les mentions", "Evidence supporting mentions")}</h3>
            {[...(detail?.mentions ?? []), ...(detail?.previousMentions ?? [])]
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
                    brandAnalysis: detail?.brandAnalysis ?? { scope: "original" },
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
