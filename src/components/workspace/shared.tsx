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
export type Translate = (fr: string, en: string) => string;
export const ModalError = createContext("");
export async function api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error ?? "internal_error");
  return result;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
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
  const close = () => (reduced ? onClose() : setClosing(true));
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
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? cloneElement(children, { id, "aria-describedby": hint ? `${id}-hint` : undefined })
    : children;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
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
  const errors: Record<string, string> = {
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
      "Le catalogue de modèles a changé. Enregistrez à nouveau le planning.",
      "The model catalog changed. Save the schedule again.",
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
      "Connectez une clé pour chaque fournisseur sélectionné.",
      "Connect a key for each selected provider.",
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
