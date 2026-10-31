"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";

const MotionPreferences = createContext({
  reduced: true,
  paused: false,
  systemReduced: false,
  toggle: () => {},
});

/** One preference drives CSS, charts and Motion, including live OS changes. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const [systemReduced, setSystemReduced] = useState(true);
  useEffect(() => {
    try {
      setPaused(localStorage.getItem("avos-motion") === "paused");
    } catch {
      // Storage can be unavailable in private / restricted browser contexts.
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setSystemReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const reduced = paused || systemReduced;
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [reduced]);
  function toggle() {
    setPaused((value) => {
      try {
        localStorage.setItem("avos-motion", value ? "full" : "paused");
      } catch {
        // The preference still applies for the current visit.
      }
      return !value;
    });
  }
  return (
    <MotionPreferences.Provider value={{ reduced, paused, systemReduced, toggle }}>
      <MotionConfig
        reducedMotion={reduced ? "always" : "user"}
        transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </MotionConfig>
    </MotionPreferences.Provider>
  );
}

export const useMotionPreferences = () => useContext(MotionPreferences);

/** Key only by navigation, never by polled data: forms and charts keep their state. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { reduced } = useMotionPreferences();
  return (
    <motion.div
      className="page-transition"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
}

export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-orb ambient-amber" />
      <div className="ambient-orb ambient-teal" />
      <div className="ambient-grid" />
    </div>
  );
}
