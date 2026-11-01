"use client";
import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { Button } from "../ui/button";
import type { Translate } from "./shared";

export function CopyLink({ hash, t }: { hash: string; t: Translate }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState("");
  return (
    <div className="private-link">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          const url = new URL(window.location.href);
          url.hash = hash;
          try {
            await navigator.clipboard.writeText(url.href);
            setCopied(true);
            setManual("");
          } catch {
            setManual(url.href);
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Link2 size={14} />}
        {t("Copier le lien privé", "Copy private link", "复制私密链接")}
      </Button>
      <small className="muted">
        {t(
          "Connexion au même espace requise.",
          "Access to the same workspace is required.",
          "需要登录同一工作区。",
        )}
      </small>
      {copied && (
        <span className="sr-only" role="status">
          {t("Lien copié.", "Link copied.", "链接已复制。")}
        </span>
      )}
      {manual && (
        <input
          aria-label={t("Lien à copier", "Link to copy", "待复制的链接")}
          value={manual}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
