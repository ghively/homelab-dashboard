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
import { Glass, supportsHtmlInCanvas } from "@/components/canvasui/Glass";
import { Frost } from "@/components/canvasui/Frost";
import { Grid } from "@/components/canvasui/Grid";
import { GlyphRain } from "@/components/canvasui/GlyphRain";
import { Liquid } from "@/components/canvasui/Liquid";
import { DecryptReveal } from "@/components/canvasui/DecryptReveal";

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

export default function Lab() {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // Deferred to a microtask rather than called straight in the effect body:
    // setting state synchronously during an effect is what react-hooks flags as
    // a cascading-render risk. The check itself touches browser APIs, so it
    // cannot run during render either.
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) setSupported(supportsHtmlInCanvas());
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
          {supported === null && "Checking HTML-in-Canvas support…"}
          {supported === true && "HTML-in-Canvas is SUPPORTED — every effect below is live."}
          {supported === false && (
            <>
              <strong>HTML-in-Canvas is NOT enabled in this browser.</strong>
              <br />
              Everything below renders as plain content with no effect. To turn it on:
              open <code>chrome://flags/#canvas-draw-element</code>, set it to Enabled, and relaunch.
              Chrome or a Chromium browser only — Firefox and Safari have not implemented it.
            </>
          )}
        </div>
      </header>

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
