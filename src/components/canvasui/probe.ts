"use client";

/**
 * Does HTML-in-Canvas actually RASTERISE in this browser?
 *
 * The obvious check — `typeof ctx.drawElementImage === "function"` — is the one
 * that burned us. Enabling `chrome://flags/#canvas-draw-element` exposes the
 * method immediately, so the nominal check flips to true, every effect takes
 * the WebGL path, and then the draw itself fails. Each component wraps its
 * draw in `try { ... } catch {}`, so the failure is swallowed: the content
 * texture is never uploaded and the shader renders an empty one. The panel does
 * not fall back — it renders the effect over nothing, and the content
 * disappears. Turning the flag ON made the dashboard look MORE broken than
 * leaving it off, which is exactly backwards from what a feature flag should do.
 *
 * So this probe does the real thing end to end: it puts a known colour on the
 * page, draws that element into a canvas through the API, and reads the pixels
 * back. Only actual matching pixels count as support. Anything else — method
 * missing, draw throws, paint never fires, canvas comes back empty — is
 * reported as unsupported with the reason, and the app uses its CSS fallback,
 * which is the design it shipped with and looks correct.
 *
 * The result is cached: the probe costs a frame and the answer cannot change
 * without a page reload, since the flag is read at browser start.
 */

/** Bright magenta — no browser default paints this, so a match cannot be luck. */
const R = 255;
const G = 0;
const B = 255;
const SIZE = 16;

/** Give the compositor a fair number of frames before calling it dead. */
const TIMEOUT_MS = 1000;

export type ProbeResult = {
  ok: boolean;
  /** Machine-readable cause, for the diagnostics panel. */
  reason:
    | "supported"
    | "disabled"
    | "no-document"
    | "no-2d-context"
    | "api-missing"
    | "draw-threw"
    | "paint-never-fired"
    | "canvas-empty"
    | "wrong-pixels";
  /** Human-readable detail, including the exception text when one was thrown. */
  detail: string;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
  reset?: () => void;
};

type PaintableCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  onpaint?: (() => void) | null;
};

let cached: Promise<ProbeResult> | null = null;

/**
 * HTML-in-Canvas is OFF unless explicitly requested, and stays off by default.
 *
 * Gene's browser died with STATUS_BREAKPOINT — a Chromium CHECK() failure, i.e.
 * the renderer deliberately aborting. That is not JavaScript misbehaving that
 * we can defend against; it is an experimental origin-trial API reaching a
 * state its own authors assert is impossible. No amount of care on our side
 * makes calling into that safe, and a dashboard is not worth a browser crash.
 *
 * With this off, the probe never runs, so native mode never engages, so content
 * never moves inside a canvas, so `htmlInCanvas` is false in every component and
 * neither drawElementImage nor requestPaint is ever called. One switch removes
 * the entire crash surface — the effects still render in the mode that works.
 *
 *   ?hic=on   opt in (expect crashes on Chrome 150-153)
 *   ?hic=off  opt back out
 */
export function htmlInCanvasRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("hic");
    if (param === "on" || param === "off") {
      window.localStorage.setItem("canvasui-hic", param);
      return param === "on";
    }
    return window.localStorage.getItem("canvasui-hic") === "on";
  } catch {
    return false;
  }
}

/** Cheap synchronous check — the method is present. NOT proof it works. */
export function hasHtmlInCanvasApi(): boolean {
  if (typeof document === "undefined") return false;
  const c = document.createElement("canvas") as PaintableCanvas;
  const ctx = c.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
      typeof ctx.drawElementImage === "function" &&
      typeof c.requestPaint === "function",
  );
}

export function probeHtmlInCanvas(): Promise<ProbeResult> {
  if (!cached) cached = runProbe();
  return cached;
}

/**
 * Chrome ≥150 throws InvalidStateError "No cached paint record for element."
 * when drawElementImage runs before the document's paint lifecycle has
 * recorded the child — typical for the first frame after the content div
 * moves into the canvas. That is a timing artifact, not a capability verdict:
 * callers should re-request a paint and try again rather than declare the
 * draw broken.
 */
export function isTransientDrawElementError(err: unknown): boolean {
  return err instanceof Error && /no cached paint record/i.test(err.message);
}

function runProbe(): Promise<ProbeResult> {
  if (!htmlInCanvasRequested()) {
    return Promise.resolve({
      ok: false,
      reason: "disabled",
      detail:
        "HTML-in-Canvas is disabled by default: driving it crashed Chrome with " +
        "STATUS_BREAKPOINT, a renderer CHECK failure. Effects run in their " +
        "reduced mode, which needs only WebGL2. Add ?hic=on to opt in.",
    });
  }
  if (typeof document === "undefined") {
    return Promise.resolve({
      ok: false,
      reason: "no-document",
      detail: "Server render — no DOM to probe.",
    });
  }

  return new Promise<ProbeResult>((resolve) => {
    // Off to the side rather than display:none or visibility:hidden — the
    // element has to be genuinely laid out and painted, or there is nothing for
    // drawElementImage to capture and the probe would fail a working browser.
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    // INSIDE the viewport, deliberately. The previous version parked this at
    // left:-9999px, and Chrome does not paint what is outside the viewport — so
    // there was nothing to rasterise and the probe reported an empty canvas on
    // a browser that may well work. Hiding it by moving it off-screen is the
    // one hiding technique that breaks a paint-based test.
    //
    // It is hidden by depth instead: full opacity and real layout, parked at
    // the top-left corner behind everything, including the wallpaper at
    // z-index -1. Occluded content is still painted; culled content is not.
    // opacity:0 and visibility:hidden are avoided for the same reason as
    // off-screen — they can skip the paint or zero out the pixels we read back.
    host.style.cssText =
      "position:fixed;top:0;left:0;width:16px;height:16px;" +
      "pointer-events:none;z-index:-2147483647;";

    const canvas = document.createElement("canvas") as PaintableCanvas;
    canvas.width = SIZE;
    canvas.height = SIZE;
    // `layoutsubtree` is what opts the canvas's fallback content into being laid
    // out and painted instead of ignored. Without it there is nothing to draw.
    canvas.setAttribute("layoutsubtree", "true");

    // The swatch must be an IMMEDIATE CHILD of the canvas. Chrome 150 rejects
    // anything else with "Only immediate children of the <canvas> element can
    // be passed to DrawElementImage" — the first version of this probe made the
    // swatch a sibling and so reported every browser as unable to rasterise,
    // which denied the gate across the entire dashboard. The probe has to build
    // the same DOM shape the components build, or it tests nothing they do.
    const swatch = document.createElement("div");
    swatch.style.cssText = `width:${SIZE}px;height:${SIZE}px;background:rgb(${R},${G},${B});`;
    canvas.appendChild(swatch);

    host.appendChild(canvas);
    document.body.appendChild(host);

    let settled = false;
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      host.remove();
      resolve(result);
    };

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    }) as ElementImageContext | null;

    if (!ctx) {
      finish({
        ok: false,
        reason: "no-2d-context",
        detail: "Could not acquire a 2D context.",
      });
      return;
    }
    if (
      typeof ctx.drawElementImage !== "function" ||
      typeof canvas.requestPaint !== "function"
    ) {
      finish({
        ok: false,
        reason: "api-missing",
        detail:
          "drawElementImage / requestPaint are not exposed. Enable " +
          "chrome://flags/#canvas-draw-element and relaunch Chrome.",
      });
      return;
    }

    // The draw is only legal inside onpaint — that is the contract the vendored
    // components follow, so the probe has to follow it too or it would test a
    // different code path than the one that actually runs.
    //
    // One onpaint is NOT one fair chance. drawElementImage replays the paint
    // record that the document's paint lifecycle captured for the canvas child
    // (Chromium: PaintArtifactCompositor::GetCanvasChildPaintRecord). On the
    // very first frame after this subtree is inserted that record can be
    // missing (Chrome 150 throws InvalidStateError "No cached paint record
    // for element.") or still empty. Both are transient, not verdicts, so the
    // probe retries every frame until the timeout and only reports the last
    // failure if no frame ever produces pixels.
    let attempts = 0;
    let lastFailure: ProbeResult | null = null;

    // Wipe after every read, before the frame is committed to the compositor.
    // onpaint runs in the document lifecycle before the commit
    // (LocalFrameView::WillCommit → RunCanvasOnpaintSteps), so a canvas that
    // is drawn, read and cleared inside one handler never presents a single
    // magenta pixel — the depth-stacking above is a second layer of cover,
    // not the mechanism.
    const wipe = () => {
      try {
        ctx.reset?.();
        ctx.clearRect(0, 0, SIZE, SIZE);
      } catch {
        // Nothing to do — the canvas is behind everything and 16px anyway.
      }
    };

    const retry = (failure: ProbeResult) => {
      lastFailure = failure;
      attempts++;
      wipe();
      // Scheduled, NOT called inline. requestPaint() from inside onpaint is a
      // re-entrant paint request — asking the renderer to paint while it is
      // painting — which is exactly the shape of thing a CHECK() exists to
      // catch. Deferring to the next frame keeps each request outside the
      // paint it would otherwise re-enter.
      requestAnimationFrame(() => {
        if (settled) return;
        try {
          canvas.requestPaint!();
        } catch {
          finish(failure);
        }
      });
    };

    canvas.onpaint = () => {
      if (settled) return;
      try {
        ctx.reset?.();
        ctx.drawElementImage!(swatch, 0, 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Transient on freshly inserted subtrees — the element has simply not
        // been through a paint yet. Try again next frame.
        if (/no cached paint record/i.test(message)) {
          retry({
            ok: false,
            reason: "canvas-empty",
            detail:
              `No cached paint record after ${attempts + 1} frame(s) — the ` +
              "browser never rasterised the probe element.",
          });
          return;
        }
        finish({
          ok: false,
          reason: "draw-threw",
          detail: `drawElementImage threw: ${message}`,
        });
        return;
      }

      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, SIZE, SIZE).data;
      } catch (err) {
        finish({
          ok: false,
          reason: "canvas-empty",
          detail: `getImageData failed (likely tainted): ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        return;
      }

      let opaque = 0;
      let matching = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        opaque++;
        // Generous tolerance: colour management and premultiplied alpha both
        // shift the exact values, and this is a yes/no question about whether
        // pixels arrived at all, not a colour-accuracy test.
        if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] > 180) matching++;
      }

      if (opaque === 0) {
        retry({
          ok: false,
          reason: "canvas-empty",
          detail:
            "The API accepted the draw but produced a fully transparent " +
            `canvas on ${attempts + 1} frame(s) — the element was never ` +
            "rasterised.",
        });
        return;
      }
      if (matching < opaque / 2) {
        retry({
          ok: false,
          reason: "wrong-pixels",
          detail: `Canvas had ${opaque} opaque pixels but only ${matching} matched the source colour.`,
        });
        return;
      }

      wipe();
      finish({
        ok: true,
        reason: "supported",
        detail: `${matching}/${opaque} pixels rasterised correctly after ${
          attempts + 1
        } frame(s).`,
      });
    };

    try {
      canvas.requestPaint();
    } catch (err) {
      finish({
        ok: false,
        reason: "draw-threw",
        detail: `requestPaint threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      return;
    }

    window.setTimeout(() => {
      finish(
        lastFailure ?? {
          ok: false,
          reason: "paint-never-fired",
          detail:
            `onpaint did not fire within ${TIMEOUT_MS}ms. The API is exposed but ` +
            "the browser never scheduled an element paint.",
        },
      );
    }, TIMEOUT_MS);
  });
}

/* ── Draw-failure sink ──────────────────────────────────────────
   Every vendored component wraps its `drawElementImage` call in an empty
   catch. That is defensible as a rendering decision — one bad frame should not
   take the page down — but it also means a browser that exposes the API and
   then refuses to draw fails completely silently, which is what made this so
   hard to see. The catches now report here instead of discarding, so the lab
   page can name the actual exception. First failure per component only: the
   draw runs every frame and would otherwise flood. */

const drawFailures = new Map<string, string>();

export function recordDrawFailure(component: string, err: unknown): void {
  if (drawFailures.has(component)) return;
  drawFailures.set(
    component,
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
}

export function getDrawFailures(): Array<{ component: string; message: string }> {
  return [...drawFailures].map(([component, message]) => ({ component, message }));
}
