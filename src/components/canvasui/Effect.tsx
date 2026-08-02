"use client";

/**
 * The single gate every Canvas UI effect in this app goes through.
 *
 * Three things have to line up before an effect may render, and each has a
 * different fallback consequence:
 *
 *  1. HTML-in-Canvas must actually RASTERISE — see probe.ts. This deliberately
 *     does not ask whether `drawElementImage` exists: enabling the Chrome flag
 *     exposes the method before the draw necessarily works, and the vendored
 *     components swallow the resulting exception, so a nominal check made
 *     turning the flag ON blank out the panels. The probe draws a known colour
 *     and reads the pixels back.
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
import { probeHtmlInCanvas } from "@/components/canvasui/probe";
import { claimSlot, type Slot } from "@/components/canvasui/budget";

export function useEffectGate(priority = false): boolean {
  const [enabled, setEnabled] = useState(false);
  const slot = useRef<Slot | null>(null);

  useEffect(() => {
    let alive = true;

    // Async because the probe needs a real paint frame to complete. The slot is
    // claimed only after it resolves, so a browser that cannot rasterise never
    // consumes one of the capped WebGL contexts.
    void probeHtmlInCanvas().then((result) => {
      if (!alive || !result.ok) return;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;

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
