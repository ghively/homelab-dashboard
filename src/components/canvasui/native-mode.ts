"use client";

/**
 * Should a component put its content INSIDE the <canvas>?
 *
 * This is the single most consequential decision each Canvas UI component
 * makes, and getting it wrong blanks the page.
 *
 * In native mode the component renders its children as canvas fallback content
 * — an immediate child of `<canvas layoutsubtree="true">` — because that is the
 * only shape `drawElementImage` accepts. Fallback content is NOT painted by the
 * normal document pipeline. The only thing that ever puts it on screen is the
 * HTML-in-Canvas draw. So if that draw produces nothing, the content is not
 * merely un-refracted: it is invisible. The page goes blank while the DOM looks
 * perfectly healthy in devtools.
 *
 * The components shipped deciding this from `supportsHtmlInCanvas()`, which
 * only asks whether `drawElementImage` EXISTS. Enabling
 * chrome://flags/#canvas-draw-element makes that true immediately. On Chrome
 * 150 the draw then fails anyway, so the flag moved every panel's content into
 * a canvas that never painted it — which is why turning the flag ON blanked the
 * dashboard, while the browser WITHOUT the flag rendered everything correctly.
 * A feature flag that makes the app worse is the signature of a capability
 * check asking the wrong question.
 *
 * So native mode is driven by the functional probe instead: content moves into
 * the canvas only once we have drawn a known colour through the API and read
 * the pixels back. The snapshot starts `false`, which is the safe direction —
 * content stays in the normal DOM and stays visible — and flips to `true` only
 * on proof. It never flips back, so a component cannot be torn down by a
 * transient failure.
 */

import { probeHtmlInCanvas } from "@/components/canvasui/probe";

let native = false;
let started = false;
const listeners = new Set<() => void>();

/**
 * useSyncExternalStore subscribe. The probe is kicked off by the first
 * subscriber rather than at module load, so importing this file costs nothing
 * and server rendering never touches the DOM.
 */
export function subscribeNativeMode(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!started) {
    started = true;
    void probeHtmlInCanvas().then((result) => {
      if (!result.ok || native) return;
      native = true;
      for (const listener of listeners) listener();
    });
  }

  return () => {
    listeners.delete(onChange);
  };
}

/** Client snapshot. Must be a stable reference-free boolean read. */
export function getNativeMode(): boolean {
  return native;
}

/**
 * Server snapshot — always false. The server has no DOM to probe, and the
 * non-native tree is the one that renders content visibly, so this is also the
 * correct thing to send down for hydration.
 */
export function getNativeModeServer(): boolean {
  return false;
}
