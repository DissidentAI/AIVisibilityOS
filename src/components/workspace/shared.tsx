"use client";
import {
  createContext,
  useContext,
  useId,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, Search } from "lucide-react";
import { Button } from "../ui/button";
import { motion } from "motion/react";
import { useMotionPreferences } from "../ui/motion";
import { isProjectIssue, type ProjectIssue } from "@/lib/project-validation";
import { PROVIDERS, PROVIDER_LABELS } from "@/lib/provider-config";
export type Translate = (fr: string, en: string) => string;
export const ModalError = createContext("");
export class ApiError extends Error {
  readonly issues: ProjectIssue[];
  constructor(code: string, issues?: unknown) {
    super(code);
    this.issues = Array.isArray(issues) ? issues.filter(isProjectIssue).slice(0, 60) : [];
  }
}
export async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new ApiError(result.error ?? "internal_error", result.issues);
  return result;
}
export function Modal({
  title,
  children,
  onClose,
  onCloseStart,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onCloseStart?: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const { reduced } = useMotionPreferences();
  const error = useContext(ModalError);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const close = () => {
    onCloseStart?.();
    if (reduced) onClose();
    else setClosing(true);
  };
  return (
    <motion.dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.97 }}
      animate={closing ? { opacity: 0, y: 12, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduced ? 0 : closing ? 0.16 : 0.35 }}
      onAnimationComplete={() => {
        if (closing) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-title">
        <h2 id={titleId}>{title}</h2>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close / Fermer">
          <X size={18} />
        </Button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {children}
    </motion.dialog>
  );
}
export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const control = isValidElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>(children)
    ? cloneElement(children, {
        id,
        "aria-describedby":
          [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") ||
          undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <Search size={24} />}</div>
      <h3>{title}</h3>
      <div className="muted">{children}</div>
    </div>
  );
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n / 1e6);
export function friendly(code: string, t: Translate) {
  const provider = PROVIDERS.find((p) => code.endsWith(`_${p}`));
  if (provider && code.startsWith("provider_auth_rejected_"))
    return provider === "kimi"
      ? t(
          "Kimi refuse cette clé (401). Utilisez une clé de la plateforme API Kimi ; une clé Kimi Code ou un abonnement au chat ne donne pas accès à cette API. Remplacez la clé dans Paramètres.",
          "Kimi rejected this key (401). Use a Kimi API Platform key; Kimi Code keys and chat subscriptions do not grant access to this API. Replace the key in Settings.",
        )
      : t(
          `${PROVIDER_LABELS[provider]} refuse cette clé (401). Vérifiez la clé de sa plateforme API, puis remplacez-la dans Paramètres.`,
          `${PROVIDER_LABELS[provider]} rejected this key (401). Check its API platform key and replace it in Settings.`,
        );
  if (provider && code.startsWith("provider_access_denied_"))
    return t(
      `${PROVIDER_LABELS[provider]} refuse cet accès (403). Vérifiez les permissions de la clé et les restrictions du compte.`,
      `${PROVIDER_LABELS[provider]} denied access (403). Check key permissions and account restrictions.`,
    );
  if (provider && code.startsWith("provider_check_unavailable_"))
    return t(
      `Impossible de vérifier ${PROVIDER_LABELS[provider]} pour le moment. Aucun scan n’a été lancé ; réessayez dans un instant.`,
      `Unable to verify ${PROVIDER_LABELS[provider]} right now. No scan was started; please try again shortly.`,
    );
  const errors: Record<string, string> = {
    network_or_timeout: t(
      "La connexion a échoué ou le fournisseur n’a pas répondu à temps. Le coût peut être inconnu : vérifiez avant de réessayer.",
      "The connection failed or the provider timed out. Cost may be unknown: review before retrying.",
    ),
    retry_nothing_to_retry: t(
      "Aucun échec à réessayer. Consultez les reprises déjà créées.",
      "No failures left to retry. View the attempts already created.",
    ),
    retry_already_created: t(
      "Une reprise existe déjà pour cette réponse. Actualisez l’historique pour la consulter.",
      "A retry already exists for this response. Refresh history to view it.",
    ),
    retry_not_failed: t(
      "Seules les réponses échouées, interrompues ou non exploitables peuvent être réessayées.",
      "Only failed, interrupted or invalid responses can be retried.",
    ),
    credentials_missing: t(
      "Appel non envoyé : la clé a été retirée. Reconnectez le fournisseur dans Paramètres.",
      "Request not sent: the key was removed. Reconnect the provider in Settings.",
    ),
    request_exceeds_token_rate_limit: t(
      "Aucun appel envoyé : la réserve de tokens dépasse le plafond configuré. Vérifiez les tokens/minute dans Paramètres → Vitesse des scans, puis réessayez.",
      "No request sent: the token reservation exceeds the configured limit. Check tokens/minute in Settings → Scan speed, then retry.",
    ),
    provider_http_429: t(
      "Le fournisseur limite les appels ou le quota est épuisé (429). Vérifiez votre quota et patientez avant de réessayer.",
      "The provider is rate limiting requests or the quota is exhausted (429). Check your quota and wait before retrying.",
    ),
    provider_http_500: t(
      "Erreur temporaire du fournisseur (500). Réessayez plus tard.",
      "Temporary provider error (500). Try again later.",
    ),
    provider_http_502: t(
      "Le fournisseur est temporairement indisponible (502). Réessayez plus tard.",
      "The provider is temporarily unavailable (502). Try again later.",
    ),
    provider_http_503: t(
      "Le fournisseur est temporairement indisponible (503). Réessayez plus tard.",
      "The provider is temporarily unavailable (503). Try again later.",
    ),
    worker_interrupted_no_automatic_retry: t(
      "L’exécution a été interrompue. L’appel peut déjà avoir été facturé ; vérifiez avant de le réessayer.",
      "Execution was interrupted. The call may already have been billed; review before retrying.",
    ),
    incomplete_or_refused: t(
      "Réponse incomplète ou refusée par le modèle, exclue des indicateurs. Une nouvelle tentative peut aussi échouer.",
      "Incomplete response or model refusal, excluded from metrics. A new attempt may also fail.",
    ),
    mimo_web_search_disabled: t(
      "Xiaomi refuse la recherche web car le plugin Web Search n’est pas activé dans votre console MiMo. Activez-le chez Xiaomi, ou choisissez « API sans recherche web ». Ce refus ne concerne pas votre clé API.",
      "Xiaomi rejected web search because the Web Search plugin is not enabled in your MiMo console. Enable it at Xiaomi or select ‘API without web search’. This rejection is not about your API key.",
    ),
    mimo_web_search_disabled_before_request: t(
      "Appel non envoyé : Xiaomi a indiqué que Web Search n’est pas activé. Activez le plugin dans votre console MiMo ou lancez une campagne sans recherche web.",
      "Request not sent: Xiaomi reported that Web Search is not enabled. Enable the plugin in your MiMo console or start a campaign without web search.",
    ),
    mimo_http_400: t(
      "MiMo a refusé les paramètres (400). Le détail de cet ancien refus n’a pas été conservé. En mode web, vérifiez notamment que le plugin Web Search est activé dans votre console Xiaomi ; sinon choisissez le mode sans recherche.",
      "MiMo rejected the parameters (400). Details of this older rejection were not retained. In web mode, check that Web Search is enabled in your Xiaomi console; otherwise select the mode without search.",
    ),
    provider_http_400: t(
      "Le fournisseur a refusé les paramètres de la requête (400). Vérifiez le modèle et l’accès aux outils sélectionnés.",
      "The provider rejected the request parameters (400). Check the model and access to the selected tools.",
    ),
    invalid_schedule_date: t(
      "Choisissez une date future dans les 366 prochains jours.",
      "Choose a future date within the next 366 days.",
    ),
    configuration_changed: t(
      "La configuration a changé. Fermez puis rouvrez ce formulaire pour actualiser l’estimation.",
      "Configuration changed. Close and reopen this form to refresh the estimate.",
    ),
    report_campaign_pending: t(
      "Attendez la fin de la campagne pour figer le rapport.",
      "Wait for the campaign to finish before freezing the report.",
    ),
    report_no_valid_responses: t(
      "Une réponse valide est nécessaire pour créer un rapport.",
      "At least one valid response is required to create a report.",
    ),
    report_not_comparable: t(
      "Ces campagnes ne sont pas comparables : vérifiez la configuration, les modèles retournés et les réponses valides.",
      "These campaigns cannot be compared: check configuration, returned models and valid responses.",
    ),
    invalid_logo: t(
      "Utilisez un PNG ou JPEG valide, de 250 Ko et 1 mégapixel maximum.",
      "Use a valid PNG or JPEG up to 250 KB and 1 megapixel.",
    ),
    report_limit: t(
      "La limite de 200 rapports est atteinte. Exportez puis retirez des rapports anciens.",
      "The 200-report limit has been reached. Export and remove older reports.",
    ),
    model_configuration_changed: t(
      "Cette configuration de modèle n’est plus disponible. Créez une nouvelle campagne avec le catalogue actuel ; pour un planning, enregistrez-le à nouveau.",
      "This model configuration is no longer available. Create a new campaign with the current catalog; for a schedule, save it again.",
    ),
    model_retired: t(
      "Le modèle configuré a été retiré. Une mise à jour du connecteur est nécessaire.",
      "The configured model has retired. The connector needs an update.",
    ),
    invalid_credentials: t("Adresse ou mot de passe incorrect.", "Incorrect email or password."),
    invalid_bootstrap_token: t(
      "Le code d’installation est incorrect. Consultez BOOTSTRAP_TOKEN dans votre fichier .env.",
      "Incorrect setup code. See BOOTSTRAP_TOKEN in your .env file.",
    ),
    registration_closed: t(
      "Un propriétaire existe déjà. Connectez-vous.",
      "An owner already exists. Please sign in.",
    ),
    invalid_input: t(
      "Vérifiez les champs : domaines publics, noms distincts et questions de 5 à 1 000 caractères.",
      "Check the fields: public domains, distinct names and questions of 5–1,000 characters.",
    ),
    budget_exceeded: t(
      "Le budget restant ne couvre pas cette campagne. Réduisez les échantillons ou ajustez votre plafond.",
      "The remaining budget cannot cover this campaign. Reduce samples or adjust your limit.",
    ),
    credentials_required: t(
      "Connectez une clé dans Paramètres pour chaque fournisseur sélectionné.",
      "Connect a key in Settings for each selected provider.",
    ),
    web_search_unsupported: t(
      "Ce fournisseur ne prend pas en charge le mode web sélectionné.",
      "This provider does not support the selected web mode.",
    ),
    provider_auth_failed_before_request: t(
      "Appel non lancé : le fournisseur a refusé la clé sur une réponse précédente. Remplacez la clé dans Paramètres.",
      "Request not sent: the provider rejected the key on a previous response. Replace the key in Settings.",
    ),
    provider_http_401: t(
      "Clé API refusée par le fournisseur (401). Remplacez-la dans Paramètres.",
      "API key rejected by the provider (401). Replace it in Settings.",
    ),
    provider_http_403: t(
      "Accès refusé par le fournisseur (403). Vérifiez les permissions et l’activation de la recherche web dans sa console.",
      "Provider access denied (403). Check permissions and web search activation in its console.",
    ),
    campaign_already_running: t(
      "Une campagne est en cours. Attendez sa fin.",
      "A campaign is already running. Wait for it to finish.",
    ),
    rate_limited: t(
      "Trop de tentatives. Patientez avant de réessayer.",
      "Too many attempts. Please wait before trying again.",
    ),
    invalid_origin: t(
      "L’adresse de l’application ne correspond pas à APP_URL dans la configuration.",
      "This application address does not match APP_URL in the configuration.",
    ),
    encryption_not_configured: t(
      "La clé de chiffrement du serveur doit être configurée.",
      "The server encryption key must be configured.",
    ),
    not_found: t("Cet élément n’est plus disponible.", "This item is no longer available."),
    unauthenticated: t(
      "Votre session a expiré. Reconnectez-vous.",
      "Your session expired. Sign in again.",
    ),
  };
  return (
    errors[code] ??
    t(
      `L’opération n’a pas abouti (${code}). Réessayez ou consultez la documentation.`,
      `The operation failed (${code}). Try again or check the documentation.`,
    )
  );
}
