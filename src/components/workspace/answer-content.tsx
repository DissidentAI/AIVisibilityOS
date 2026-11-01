"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "../ui/button";
import {
  answerFilename,
  providerAnnotations,
  safeAnswerUrl,
  type AnswerLink,
} from "@/lib/answer-markdown";
import type { Translate } from "./shared";

export function AnswerContent({
  text,
  links,
  provider,
  id,
  t,
}: {
  text: string;
  links: AnswerLink[];
  provider: string;
  id: string;
  t: Translate;
}) {
  const [source, setSource] = useState(false);
  const [copy, setCopy] = useState<"idle" | "pending" | "done" | "manual">("idle");
  const [manual, setManual] = useState("");
  const [downloadError, setDownloadError] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const selection = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current++;
    },
    [],
  );
  useEffect(() => {
    if (copy === "manual") {
      selection.current?.focus();
      selection.current?.select();
    }
  }, [copy]);
  const value = () => (source ? text : (content.current?.innerText ?? text));
  async function copyAnswer() {
    const current = ++attempt.current,
      body = value();
    setCopy("pending");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(body);
      if (current === attempt.current) setCopy("done");
    } catch {
      if (current === attempt.current) {
        setManual(body);
        setCopy("manual");
      }
    }
  }
  function download() {
    setDownloadError(false);
    try {
      const url = URL.createObjectURL(
        new Blob([value()], {
          type: source ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = answerFilename(provider, id, source);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Safari can consume the URL asynchronously after the click.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setDownloadError(true);
    }
  }
  if (!text)
    return (
      <div className="answer">{t("Aucune réponse disponible.", "No response available.")}</div>
    );
  return (
    <section className="answer-section" aria-label={t("Réponse IA", "AI answer")}>
      <div className="answer-toolbar">
        <div
          className="answer-modes"
          role="group"
          aria-label={t("Format de lecture", "Reading format")}
        >
          {[false, true].map((markdown) => (
            <button
              key={String(markdown)}
              type="button"
              aria-pressed={source === markdown}
              onClick={() => {
                attempt.current++;
                setSource(markdown);
                setCopy("idle");
                setDownloadError(false);
              }}
            >
              {markdown ? t("Source Markdown", "Markdown source") : t("Lecture", "Read")}
            </button>
          ))}
        </div>
        <div className="answer-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyAnswer}
            disabled={copy === "pending"}
          >
            {copy === "done" ? <Check size={14} /> : <Copy size={14} />}
            {source ? t("Copier le Markdown", "Copy Markdown") : t("Copier le texte", "Copy text")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download}>
            <Download size={14} />
            {source ? t("Exporter .md", "Export .md") : t("Exporter .txt", "Export .txt")}
          </Button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {copy === "done" ? t("Réponse copiée.", "Answer copied.") : ""}
      </p>
      {copy === "manual" && (
        <label className="answer-manual">
          {t(
            "Copie manuelle : le navigateur n’a pas autorisé le presse-papiers. Sélectionnez et copiez ce texte.",
            "Manual copy: your browser did not allow clipboard access. Select and copy this text.",
          )}
          <textarea
            ref={selection}
            readOnly
            value={manual}
            rows={5}
            aria-label={t("Texte à copier", "Text to copy")}
          />
        </label>
      )}
      {downloadError && (
        <p role="alert">
          {t(
            "Téléchargement indisponible. Utilisez le bouton Copier.",
            "Download unavailable. Use the Copy button.",
          )}
        </p>
      )}
      <div
        ref={content}
        className={`answer ${source ? "answer-source" : "answer-markdown"}`}
        tabIndex={0}
        aria-label={
          source
            ? t("Source Markdown de la réponse", "Answer Markdown source")
            : t("Réponse mise en forme", "Formatted answer")
        }
      >
        {source ? (
          <pre>{text}</pre>
        ) : (
          <ReactMarkdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[providerAnnotations, { textLength: text.length, links }]]}
            urlTransform={safeAnswerUrl}
            remarkRehypeOptions={{ footnoteLabel: t("Notes", "Footnotes") }}
            components={{
              a: ({ href, children, title, className }) =>
                href ? (
                  <a
                    href={href}
                    title={title}
                    className={className}
                    target={href.startsWith("#") ? undefined : "_blank"}
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ) : (
                  <span>{children}</span>
                ),
              img: ({ alt }) => (
                <span className="muted">
                  {alt ? `[${alt}]` : t("[Image non chargée]", "[Image not loaded]")}
                </span>
              ),
              table: ({ children }) => (
                <div
                  className="answer-table"
                  tabIndex={0}
                  role="region"
                  aria-label={t("Tableau de la réponse", "Answer table")}
                >
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
        )}
      </div>
      {!!links.length && !source && (
        <p className="small muted answer-note">
          {t(
            "Les repères de citation du fournisseur sont placés à la fin du passage concerné. Le texte original est conservé dans Source Markdown.",
            "Provider citation markers appear at the end of the relevant passage. The original text is preserved in Markdown source.",
          )}
        </p>
      )}
    </section>
  );
}
