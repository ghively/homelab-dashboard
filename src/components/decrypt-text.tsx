"use client";

/**
 * Decrypt-reveal, done in the DOM instead of WebGL.
 *
 * The Canvas UI DecryptReveal cannot work here and never will: alone among the
 * seven components it has no `uHasContent` branch, because the effect IS a
 * transformation of the content's pixels. Without HTML-in-Canvas it has nothing
 * to scramble — and HTML-in-Canvas is disabled because driving it crashed the
 * renderer with STATUS_BREAKPOINT.
 *
 * None of which the effect actually requires. Cycling characters and resolving
 * them left to right is a string operation. Done this way it runs in every
 * browser, costs no WebGL context, survives the origin trial being withdrawn,
 * and stays crisp at any zoom because it is real text rather than a texture.
 *
 * It also degrades honestly: the final text is what renders on the server and
 * what a reduced-motion visitor sees immediately, so the content is never
 * hostage to the animation.
 */

import { useEffect, useRef, useState } from "react";

/** Glyphs to cycle through. Skewed toward the terminal punctuation the
 *  Cyber-Noir type already uses, so scrambled text reads as the same language
 *  rather than as random noise. */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>-_\\/[]{}=+*^?#$%&";

export function DecryptText({
  text,
  duration = 900,
  trigger = "mount",
  className,
}: {
  text: string;
  /** Total time to resolve the whole string, in ms. */
  duration?: number;
  /** `mount` decrypts once on arrival; `hover` re-runs on pointer enter. */
  trigger?: "mount" | "hover";
  className?: string;
}) {
  // Starts as the real text so the server render, the no-JS render and the
  // reduced-motion render are all the finished string. The scramble only ever
  // replaces it after we know we are allowed to animate.
  const [display, setDisplay] = useState(text);
  const frame = useRef<number | null>(null);
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setDisplay(text);
        return;
      }
      if (frame.current !== null) cancelAnimationFrame(frame.current);

      const start = performance.now();
      // Each character gets its own reveal point spread across the duration, so
      // the string resolves left to right instead of snapping at the end. The
      // last character lands at 70% and the remaining time is scramble tail,
      // which stops the effect ending on a jolt.
      const revealAt = Array.from(text, (_, i) =>
        text.length <= 1 ? 0 : (i / (text.length - 1)) * duration * 0.7,
      );

      const tick = (now: number) => {
        if (cancelled) return;
        const elapsed = now - start;

        let out = "";
        let done = true;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          // Whitespace is never scrambled: it carries the word shape, and
          // cycling it makes the line visibly jitter in width.
          if (ch === " " || ch === "\n" || ch === "\t") {
            out += ch;
            continue;
          }
          if (elapsed >= revealAt[i]) {
            out += ch;
          } else {
            done = false;
            out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
        }

        setDisplay(out);
        if (done) {
          frame.current = null;
          return;
        }
        frame.current = requestAnimationFrame(tick);
      };

      frame.current = requestAnimationFrame(tick);
    };

    runRef.current = run;
    if (trigger === "mount") run();

    return () => {
      cancelled = true;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [text, duration, trigger]);

  return (
    <span
      className={className}
      onPointerEnter={trigger === "hover" ? () => runRef.current() : undefined}
      // The scrambled string is noise to a screen reader, and it changes every
      // frame. Expose the real text and hide the animation from assistive tech.
      aria-label={text}
      style={{
        // Cycling glyphs have different widths in a proportional face and would
        // make the line breathe. The design system is monospace anyway; this
        // guarantees it even if a component overrides the family.
        fontVariantLigatures: "none",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span aria-hidden="true">{display}</span>
    </span>
  );
}
