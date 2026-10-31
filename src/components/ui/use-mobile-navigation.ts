"use client";

import { useEffect, useRef, useState } from "react";

/** The off-canvas menu traps focus and makes the underlying page inert on phones. */
export function useMobileNavigation(open: boolean, onClose: () => void) {
  const sidebarRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const closeRef = useRef(onClose);
  const wasOpen = useRef(false);
  closeRef.current = onClose;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) closeRef.current();
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  // Runs after every render because the authenticated shell mounts after the initial fetch.
  useEffect(() => {
    const sidebar = sidebarRef.current;
    const shell = shellRef.current;
    if (!sidebar || !shell) return;
    sidebar.inert = isMobile && !open;
    shell.inert = isMobile && open;
    if (!isMobile || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'),
      ).filter((element) => element.getClientRects().length > 0);
    // Focus after the drawer's CSS has been applied, without scrolling the whole page.
    const focusFrame = requestAnimationFrame(() => {
      if (!sidebar.contains(document.activeElement)) {
        sidebar.scrollTop = 0;
        focusable()[0]?.focus({ preventScroll: true });
      }
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    sidebar.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      sidebar.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      shell.inert = false;
    };
  });
  useEffect(() => {
    if (isMobile && !open && wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open, isMobile]);
  return { sidebarRef, shellRef, triggerRef, isMobile };
}
