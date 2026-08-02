"use client";

/**
 * The single gate every Canvas UI effect in this app goes through.
 *
 * Three things have to line up before an effect may render, and each has a
 * different fallback consequence:
 *
 *  1. The browser must support HTML-in-Canvas. It is a Chrome origin trial
 *     (`chrome://flags/#canvas-draw-element`); everywhere else the components
 *     render their children untouched.
 *  2. A WebGL context slot must be free — see budget.ts for why that is capped.
 *  3. prefers-reduced-motion must not be set. These effects are continuous
 *     animation; honouring that preference is not optional.
 *
 * When any of those fails, children render inside the plain wrapper and the
 * dashboard falls back to its CSS glass, which is the design it had before.
 * Nothing looks broken — it just looks calmer.
 *
 * `useEffectGate` is exported separately so callers can branch on the decision
 * (e.g. to keep a CSS class only in fallback) rather than only wrapping.
 */

import { useEffect, useRef, useState } from "react";
import { supportsHtmlInCanvas } from "@/components/canvasui/Glass";
import { claimSlot, type Slot } from "@/components/canvasui/budget";

export function useEffectGate(priority = false): boolean {
  const [enabled, setEnabled] = useState(false);
  const slot = useRef<Slot | null>(null);

  useEffect(() => {
    let alive = true;

    // Deferred to a microtask: the checks touch browser APIs, so they cannot
    // run during render, and setting state synchronously inside an effect is
    // what react-hooks flags as a cascading-render risk.
    void Promise.resolve().then(() => {
      if (!alive) return;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced || !supportsHtmlInCanvas()) return;

      const s = claimSlot(priority);
      if (!s.granted) return;

      slot.current = s;
      setEnabled(true);
    });

    return () => {
      alive = false;
      slot.current?.release();
      slot.current = null;
    };
  }, [priority]);

  return enabled;
}
