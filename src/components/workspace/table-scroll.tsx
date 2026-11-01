"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoveHorizontal } from "lucide-react";
import type { Translate } from "./shared";

/** Preserve real table semantics; make columns beyond the viewport discoverable and keyboard reachable. */
export function TableScroll({
  children,
  label,
  t,
}: {
  children: ReactNode;
  label: string;
  t: Translate;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hint = useId();
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [children]);
  return (
    <div className="table-scroll">
      {overflow && (
        <p className="table-scroll-hint" id={hint}>
          <MoveHorizontal size={16} aria-hidden="true" />
          {t(
            "Faites défiler pour voir toutes les colonnes",
            "Scroll to see all columns",
            "横向滚动以查看所有列",
          )}
        </p>
      )}
      <div
        ref={ref}
        className="table-wrap"
        role="region"
        aria-label={label}
        aria-describedby={overflow ? hint : undefined}
        tabIndex={overflow ? 0 : undefined}
        onKeyDown={(event) => {
          // WebKit does not consistently scroll a focused region with the arrow keys.
          // Leave keys on nested links/buttons and all modified shortcuts untouched.
          if (
            !overflow ||
            event.target !== event.currentTarget ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          )
            return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            event.currentTarget.scrollLeft += event.key === "ArrowRight" ? 80 : -80;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
