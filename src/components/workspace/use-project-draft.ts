"use client";
import { useEffect, useRef, useState } from "react";
import {
  clearBrowserValue,
  emptyProjectDraft,
  hasProjectDraft,
  projectDraftSchema,
  readBrowserValue,
  saveBrowserValue,
} from "@/lib/browser-storage";
export function useProjectDraft(storageKey: string) {
  const [draft, setDraft] = useState(emptyProjectDraft);
  const [hydratedKey, setHydratedKey] = useState("");
  const ready = hydratedKey === storageKey;
  const [restored, setRestored] = useState(false);
  const [persistence, setPersistence] = useState<"empty" | "saved" | "unavailable">("empty");
  const current = useRef(draft),
    completed = useRef(false);
  current.current = draft;
  useEffect(() => {
    const saved = readBrowserValue(storageKey, projectDraftSchema);
    setDraft(saved.value ?? emptyProjectDraft());
    setRestored(!!saved.value);
    setPersistence(saved.available ? (saved.value ? "saved" : "empty") : "unavailable");
    completed.current = false;
    setHydratedKey(storageKey);
  }, [storageKey]);
  useEffect(() => {
    if (!ready || completed.current) return;
    const hasContent = hasProjectDraft(draft);
    const ok = hasContent
      ? saveBrowserValue(storageKey, draft, projectDraftSchema)
      : clearBrowserValue(storageKey);
    setPersistence(ok ? (hasContent ? "saved" : "empty") : "unavailable");
  }, [draft, ready, storageKey]);
  useEffect(() => {
    const persist = () => {
      if (ready && !completed.current && hasProjectDraft(current.current))
        saveBrowserValue(storageKey, current.current, projectDraftSchema);
    };
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [ready, storageKey]);
  function clearDraft() {
    clearBrowserValue(storageKey);
    setRestored(false);
    setDraft(emptyProjectDraft());
  }
  function completeDraft() {
    completed.current = true;
    clearBrowserValue(storageKey);
  }
  return { draft, setDraft, ready, restored, persistence, clearDraft, completeDraft };
}
