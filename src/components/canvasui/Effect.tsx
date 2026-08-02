"use client";

/**
 * The single gate every Canvas UI effect in this app goes through.
 *
 * IMPORTANT — what this deliberately does NOT check: HTML-in-Canvas.
 *
 * An earlier version of this gate required `drawElementImage` to work, and that
 * was simply a misreading of the library. These components do not need it.
 * `createGlass` returns null only when WebGL2 is missing (Glass.tsx:290); the
 * API's presence is passed to the shader as a uniform instead
 * (`uHasContent`, Glass.tsx:470), and the shader has a complete branch for its
 * absence (Glass.tsx:208-216) that draws the lens rim and specular highlight
 * over the real DOM content underneath. HTML-in-Canvas adds content REFRACTION;
 * it is an enhancement, not a requirement. The canvasui.dev playground renders
 * correctly in browsers without the flag for exactly this reason.
 *
 * Gating on it meant that when the probe failed, no effect mounted at all — so
 * the dashboard rendered no effects anywhere, which is the bug this fixes.
 * Degrade the effect, never suppress it.
 *
 * What actually has to line up:
 *
 *  1. WebGL2 must be available. This is the one true hard requirement — without
 *     a context there is nothing to render and the component returns null.
 *  2. A WebGL context slot must be free — see budget.ts for why that is capped.
 *  3. prefers-reduced-motion must not be set. These effects are continuous
 *     animation; honouring that preference is not optional.
 *
 * When any of those fails, children render inside the plain wrapper and the
 * dashboard falls back to its CSS glass, which is the design it had before.
 */

import { useEffect, useRef, useState } from "react";
import { claimSlot, type Slot } from "@/components/canvasui/budget";

/**
 * Canvas UI is OFF by default on the dashboard.
 *
 * Not a retreat — a separation. These effects are an experimental Chrome origin
 * trial wrapped around 7,000 lines of vendored WebGL, and every round of
 * debugging them has used the actual dashboard as the test surface. That is
 * backwards: the product should not be the proving ground. /lab exists for
 * exactly that, mounts the components raw, and is unaffected by this switch.
 *
 * So the dashboard renders its CSS glass — the design that has worked
 * throughout — until the effects are worth turning on, and turning them on is a
 * URL away rather than a deploy.
 *
 *   ?fx=on   enable and remember
 *   ?fx=off  disable and remember
 *
 * The choice persists in localStorage, so it survives navigation without
 * needing the parameter on every link.
 */
export function effectsRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("fx");
    if (param === "on" || param === "off") {
      window.localStorage.setItem("canvasui", param);
      return param === "on";
    }
    return window.localStorage.getItem("canvasui") === "on";
  } catch {
    // Private mode and blocked-storage contexts throw on localStorage access.
    // Failing closed keeps the dashboard on its known-good rendering.
    return false;
  }
}

let webgl2: boolean | null = null;

/**
 * Cached because it costs a real context to answer. The probe context is
 * explicitly released — browsers cap live contexts at around 16, and silently
 * leaking one here would steal a slot from an actual panel.
 */
export function supportsWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webgl2 = Boolean(gl && !gl.isContextLost());
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

export function useEffectGate(priority = false): boolean {
  const [enabled, setEnabled] = useState(false);
  const slot = useRef<Slot | null>(null);

  useEffect(() => {
    let alive = true;

    // Deferred to a microtask: these touch browser APIs, so they cannot run
    // during render, and setting state synchronously inside an effect is what
    // react-hooks flags as a cascading-render risk.
    void Promise.resolve().then(() => {
      if (!alive) return;

      // Opt-in first: cheapest check, and the one most likely to say no.
      if (!effectsRequested()) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || !supportsWebGL2()) return;

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
