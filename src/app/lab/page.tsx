"use client";

/**
 * Canvas UI proving ground.
 *
 * These components render through the HTML-in-Canvas API, which is a Chrome
 * origin trial. Without `chrome://flags/#canvas-draw-element` enabled they fall
 * back to plain children and you see the content with no effect — deliberately,
 * not as a failure.
 *
 * The banner at the top reports what THIS browser actually supports, so the
 * first question ("is it even on?") is answered on the page rather than guessed
 * at. Nothing else gets rebuilt on this foundation until that reads supported.
 */

import { useEffect, useState } from "react";
import { Glass } from "@/components/canvasui/Glass";
import { Frost } from "@/components/canvasui/Frost";
import { Grid } from "@/components/canvasui/Grid";
import { GlyphRain } from "@/components/canvasui/GlyphRain";
import { Liquid } from "@/components/canvasui/Liquid";
import { DecryptReveal } from "@/components/canvasui/DecryptReveal";
import { useEffectGate } from "@/components/canvasui/Effect";
import { budgetState } from "@/components/canvasui/budget";
import {
  probeHtmlInCanvas,
  hasHtmlInCanvasApi,
  getDrawFailures,
  type ProbeResult,
} from "@/components/canvasui/probe";

const PANEL: React.CSSProperties = {
  padding: "18px 20px",
  minHeight: 170,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  justifyContent: "center",
};

function Metrics() {
  return (
    <>
      <div style={{ color: "var(--neon-cyan)", fontWeight: 600, letterSpacing: ".5px" }}>Sonarr</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
        <span><small style={{ color: "var(--text-dim)" }}>SHOWS </small><strong>260</strong></span>
        <span><small style={{ color: "var(--text-dim)" }}>CONT </small><strong>68</strong></span>
        <span><small style={{ color: "var(--text-dim)" }}>ENDED </small><strong>192</strong></span>
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: ".76rem" }}>
        Real numbers from the live adapter.
      </div>
    </>
  );
}

function Cell({ name, note, children }: { name: string; note: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ fontSize: ".95rem", color: "var(--neon-cyan)", fontWeight: 600 }}>{name}</h2>
        <span style={{ flex: 1, height: 1, background: "var(--border-neutral)" }} />
      </div>
      <div style={{ borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border-neutral)" }}>
        {children}
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: ".74rem" }}>{note}</p>
    </section>
  );
}

/**
 * Why "the flag is on" and "the effects work" are different questions.
 *
 * Enabling chrome://flags/#canvas-draw-element exposes drawElementImage
 * immediately. Every component checks only that the method EXISTS, then takes
 * the WebGL path and wraps its draw in a catch that used to be empty — so a
 * browser that exposes the API but cannot rasterise blanked the panels instead
 * of falling back, and turning the flag ON made things look worse. This panel
 * separates the two: whether the API is present, and whether it actually
 * produced pixels when we drew a known colour through it.
 */
function GateDiagnostics() {
  const gated = useEffectGate(true);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [env, setEnv] = useState<{ reduced: boolean; api: boolean; ua: string } | null>(null);
  const [failures, setFailures] = useState<Array<{ component: string; message: string }>>([]);

  useEffect(() => {
    let alive = true;
    // Deferred to a microtask: setting state synchronously in an effect body is
    // what react-hooks flags as a cascading-render risk, and these reads touch
    // browser APIs so they cannot happen during render either.
    void Promise.resolve().then(() => {
      if (!alive) return;
      setEnv({
        reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        api: hasHtmlInCanvasApi(),
        ua: (navigator.userAgent.match(/Chrome\/[\d.]+/) ?? ["not Chrome"])[0],
      });
    });
    void probeHtmlInCanvas().then((r) => {
      if (alive) setProbe(r);
    });
    // The components draw every frame, so give them a moment to fail before
    // reporting. Anything they caught is a far better error message than
    // anything this page could infer.
    const t = window.setTimeout(() => {
      if (alive) setFailures(getDrawFailures());
    }, 1500);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);

  const row = (k: string, v: string, tone: "good" | "bad" | "flat") => (
    <div key={k} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ width: 210, flexShrink: 0, color: "var(--text-dim)" }}>{k}</span>
      <strong style={{
        color: tone === "bad" ? "var(--dot-red)" : tone === "good" ? "var(--neon-green)" : "var(--dash-text)",
      }}>{v}</strong>
    </div>
  );

  return (
    <div style={{
      border: "1px solid var(--border-neutral)", borderRadius: "var(--radius)",
      padding: "14px 16px", background: "rgba(0,0,0,.45)", fontSize: ".78rem",
      display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.5,
    }}>
      <div style={{ color: "var(--neon-cyan)", fontWeight: 600, marginBottom: 3 }}>
        Diagnostics — API present vs. actually working
      </div>

      {env && row("Browser", env.ua, "flat")}
      {env && row("API exposed (flag on)", env.api ? "YES" : "NO", env.api ? "good" : "bad")}
      {row(
        "Pixels actually drawn",
        probe === null ? "probing…" : probe.ok ? "YES" : `NO — ${probe.reason}`,
        probe === null ? "flat" : probe.ok ? "good" : "bad",
      )}
      {probe && (
        <div style={{ color: "var(--text-mute)", paddingLeft: 220, marginTop: -3 }}>
          {probe.detail}
        </div>
      )}
      {env && row(
        "prefers-reduced-motion",
        env.reduced ? "REDUCE — blocks effects" : "no-preference",
        env.reduced ? "bad" : "good",
      )}
      {row("Dashboard gate grants", gated ? "YES" : "NO", gated ? "good" : "bad")}
      {env && (() => {
        // Read at render rather than snapshotted into state: these are plain
        // module counters with no browser API behind them, and a stored copy is
        // both stale and — across a Fast Refresh that preserves the old object
        // shape — a crash waiting to happen. This panel exists to explain
        // breakage, so it must not be able to break.
        const b = budgetState();
        return row(
          "WebGL slots in use",
          `${b.used} + ${b.reservedUsed} reserved of ${b.max}`,
          "flat",
        );
      })()}

      {failures.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-neutral)" }}>
          <div style={{ color: "var(--dot-red)", fontWeight: 600, marginBottom: 4 }}>
            Exceptions the components caught while drawing
          </div>
          {failures.map((f) => (
            <div key={f.component} style={{ display: "flex", gap: 10 }}>
              <span style={{ width: 210, flexShrink: 0, color: "var(--text-dim)" }}>{f.component}</span>
              <code style={{ color: "var(--dot-red)" }}>{f.message}</code>
            </div>
          ))}
        </div>
      )}

      <div style={{ color: "var(--text-mute)", marginTop: 6 }}>
        {probe && !probe.ok && env?.api
          ? "The flag is on but the browser will not rasterise, so the effects run in their reduced mode. This no longer suppresses them — the gate requires WebGL2, not HTML-in-Canvas."
          : "The cells below mount the raw components. The dashboard mounts them through the gate above."}
      </div>
    </div>
  );
}

export default function Lab() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [probeReason, setProbeReason] = useState<string | null>(null);

  useEffect(() => {
    // The FUNCTIONAL probe, not `typeof drawElementImage === "function"`. The
    // nominal check is what previously reported SUPPORTED on a browser where
    // the draw then threw on every frame — the banner promised live effects
    // while the panels rendered nothing.
    let alive = true;
    void probeHtmlInCanvas().then((r) => {
      if (!alive) return;
      setSupported(r.ok);
      setProbeReason(r.reason);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ fontSize: "1.1rem", color: "var(--neon-cyan)", fontWeight: 600 }}>
          Canvas UI — proving ground
        </h1>
        <div
          style={{
            border: "1px solid",
            borderColor:
              supported === null ? "var(--border-neutral)" : supported ? "var(--border-green-30)" : "rgba(255,95,86,.4)",
            color: supported === null ? "var(--text-dim)" : supported ? "var(--neon-green)" : "var(--dot-red)",
            background: "rgba(0,0,0,.3)",
            borderRadius: "var(--radius)",
            padding: "12px 14px",
            fontSize: ".8rem",
            lineHeight: 1.6,
          }}
        >
          {supported === null && "Drawing a test element to see whether HTML-in-Canvas really works…"}
          {supported === true && "HTML-in-Canvas RASTERISES here — verified by reading pixels back, not by feature detection. The effects below additionally refract the live content behind them."}
          {supported === false && (
            <>
              <strong>
                {probeReason === "disabled"
                  ? "HTML-in-Canvas is switched OFF here — the effects still run."
                  : "HTML-in-Canvas did not produce pixels — the effects still run."}
              </strong>
              <br />
              {probeReason === "disabled" ? (
                <>
                  This is our choice, not your browser&rsquo;s. Driving the API crashed Chrome
                  with STATUS_BREAKPOINT — a renderer CHECK failure, meaning the browser
                  aborted itself — so it is disabled by default and no dashboard is worth a
                  crash. The effects run on plain WebGL2 instead, which is the mode
                  canvasui.dev itself ships. What is missing is content refraction: the
                  effect cannot bend the pixels behind it.
                  {" "}Add <code>?hic=on</code> to opt back in, at the risk of that crash.
                </>
              ) : (
                <>
                  This is the reduced mode, not a failure: the components pass the API&rsquo;s
                  availability to the shader as a uniform and have a full branch for its
                  absence, so they still render over the live DOM content. What is missing is
                  content refraction — the effect cannot bend the pixels behind it.
                </>
              )}
              <br />
              {probeReason !== "disabled" && (
                <>
                  The reason below distinguishes &ldquo;the flag is off&rdquo; from &ldquo;the
                  flag is on but the draw fails&rdquo;, which look identical from outside and
                  need opposite fixes. If it is off: open{" "}
                  <code>chrome://flags/#canvas-draw-element</code>, set it to Enabled, and
                  relaunch — Chromium browsers only.
                </>
              )}
            </>
          )}
        </div>
      </header>

      <GateDiagnostics />

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Cell name="Glass" note="Refractive glass over live content. The dashboard's panel surface candidate.">
          <Glass><div style={PANEL}><Metrics /></div></Glass>
        </Cell>

        <Cell name="Frost" note="Frosted variant — softer, less refraction, more diffusion.">
          <Frost><div style={PANEL}><Metrics /></div></Frost>
        </Cell>

        <Cell name="Grid" note="Content lifted onto a 3D tile grid; ripples follow the cursor.">
          <Grid><div style={PANEL}><Metrics /></div></Grid>
        </Cell>

        <Cell name="Glyph Rain" note="Matrix rain over the panel. Closest to the Cyber-Noir terminal language.">
          <GlyphRain><div style={PANEL}><Metrics /></div></GlyphRain>
        </Cell>

        <Cell name="Liquid" note="Pointer-driven fluid distortion.">
          <Liquid><div style={PANEL}><Metrics /></div></Liquid>
        </Cell>

        <Cell name="Decrypt Reveal" note="Content renders as cipher and decrypts within a radius of the cursor.">
          <DecryptReveal><div style={PANEL}><Metrics /></div></DecryptReveal>
        </Cell>
      </div>

      <p style={{ color: "var(--text-mute)", fontSize: ".74rem", lineHeight: 1.7 }}>
        All six are pure WebGL2 with no npm dependencies — no three.js. They respect
        <code> prefers-reduced-motion</code> and pause when scrolled out of view. Tell me which
        ones earn their place and I will rebuild the dashboard around them.
      </p>
    </main>
  );
}
