"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { WORLDS, type WorldId } from "@/lib/workspace-config";
import { ALL_STATES } from "@/lib/visual-states";
import { Surface, Metrics } from "@/visual/components";
import { Glass } from "@/components/canvasui/Glass";
import { GlyphRain } from "@/components/canvasui/GlyphRain";
import { useEffectGate } from "@/components/canvasui/Effect";
import type { VisualStateValue } from "@/adapters/types";

// ── Dashboard Shell ──────────────────────────────────────────

interface ShellProps {
  children: ReactNode;
  activeWorld: WorldId | "home";
  onWorldChange: (w: WorldId | "home") => void;
  fixtureState: VisualStateValue | null;
  onFixtureChange: (s: VisualStateValue | null) => void;
  dataSource?: "fixture" | "live";
}

export function DashboardShell({
  children,
  activeWorld,
  onWorldChange,
  fixtureState,
  onFixtureChange,
  dataSource = "fixture",
}: ShellProps) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString(undefined, {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="dash-root">
      {/* Obsidian's signature: a hairline across the top with a travelling
          highlight. Purely ambient — it carries no state, so it is aria-hidden. */}
      <div className="dash-pulse" aria-hidden="true"><i /></div>
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-brand-icon">◉</span>
          <div>
            <strong>Visual OS</strong>
            <small>Homelab Dashboard</small>
          </div>
        </div>
        <nav className="dash-nav">
          <button
            className={`dash-nav-item ${activeWorld === "home" ? "active" : ""}`}
            onClick={() => onWorldChange("home")}
          >
            <span className="dash-nav-icon">⌂</span>
            <span>Home</span>
          </button>
          {WORLDS.map((w) => (
            <button
              key={w.id}
              className={`dash-nav-item ${activeWorld === w.id ? "active" : ""}`}
              onClick={() => onWorldChange(w.id)}
              style={activeWorld === w.id ? { borderLeftColor: w.accent } : undefined}
            >
              <span className="dash-nav-icon">{w.icon}</span>
              <span>{w.label}</span>
              <small className="dash-nav-count">{w.adapters.length}</small>
            </button>
          ))}
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-fixture-toggle">
            <label>State Fixture</label>
            <select
              value={fixtureState ?? ""}
              onChange={(e) =>
                onFixtureChange(e.target.value ? (e.target.value as VisualStateValue) : null)
              }
            >
              <option value="">Live / Healthy</option>
              {ALL_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </aside>
      <main className="dash-main">
        {/* Waybar-style prompt bar, from the cyber-noir dashboard theme. The
            clock is client-only and rendered after mount so server and client
            markup match — a live time in SSR output hydrates mismatched. */}
        <div className="dash-waybar">
          <span className="dash-waybar-host">gh-ai</span>
          <span className="dash-waybar-prompt">
            <span className="p">gene@gh-ai:~$</span> dashboard --live{" "}
            <span className="dash-cursor" aria-hidden="true">▊</span>
          </span>
          <span className="dash-waybar-clock">{clock}</span>
        </div>
        {dataSource === "fixture" && (
          <div className="dash-demo-banner" role="status">
            <span className="dash-demo-banner-icon">◈</span>
            <span>
              <strong>DEMO DATA</strong>
              <small>Showing fixture data — no live adapters connected</small>
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

// ── Hero Banner ──────────────────────────────────────────────

interface HeroProps {
  title: string;
  subtitle: string;
  metrics?: Array<{ label: string; value: string | number; state?: string }>;
  accent?: string;
}

export function Hero({ title, subtitle, metrics, accent }: HeroProps) {
  const rain = useEffectGate(true);

  const inner = (
    // Phase 5's visual language (glass, gradient, elevation, glow) was only
    // ever applied to the GENERATED components. The app shell kept its original
    // flat styling, so the dashboard you actually navigate looked pre-redesign.
    // These are the same closed-enum classes the generated panels use.
    <header
      className="dash-hero cnv-surface tr-medium bl-md bg-gradient el-md"
      style={accent ? { borderColor: accent } : undefined}
    >
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {metrics && metrics.length > 0 && (
        <div className="dash-hero-metrics">
          {metrics.map((m) => (
            <div key={m.label} className={`dash-hero-metric state-${m.state ?? "healthy"}`}>
              <small>{m.label}</small>
              <strong>{m.value}</strong>
            </div>
          ))}
        </div>
      )}
    </header>
  );

  if (!rain) return inner;

  // Density and glow are deliberately low: this sits behind the headline and
  // the ask box, and the point is atmosphere, not a wall of falling glyphs.
  // Katakana plus hex digits reads as the terminal language the rest of the
  // system speaks.
  return (
    <GlyphRain
      className="dash-hero-rain"
      charset="0123456789ABCDEFｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ"
      cell={13}
      color={[0, 0.62, 0.42]}
      headColor={[0.1, 1, 0.55]}
      speed={0.14}
      density={0.055}
      glow={1.15}
      trail={0.86}
      stir={0.35}
      dim={0.72}
    >
      {inner}
    </GlyphRain>
  );
}

// ── World Card (landing page) ────────────────────────────────

interface WorldCardProps {
  icon: string;
  label: string;
  tagline: string;
  adapterCount: number;
  state: VisualStateValue;
  healthy: number;
  total: number;
  accent: string;
  onClick: () => void;
}

export function WorldCard({
  icon,
  label,
  tagline,
  adapterCount,
  state,
  healthy,
  total,
  accent,
  onClick,
}: WorldCardProps) {
  const glass = useEffectGate();

  const card = (
    <button
      className={`dash-world-card cnv-surface tr-medium bl-md el-sm state-${state}${
        ["warning", "critical", "offline", "stale", "denied"].includes(String(state))
          ? " gl-state"
          : ""
      }`}
      onClick={onClick}
      style={{ borderTopColor: accent }}
    >
      <div className="dash-world-card-head">
        <span className="dash-world-icon">{icon}</span>
        <span className={`dash-world-state state-${state}`}>{state}</span>
      </div>
      <h3>{label}</h3>
      <p>{tagline}</p>
      <div className="dash-world-card-foot">
        <span>{adapterCount} adapters</span>
        <span>
          {healthy}/{total} healthy
        </span>
      </div>
    </button>
  );

  if (!glass) return card;

  return (
    <Glass
      className="cnv-glass-host dash-world-glass"
      ior={1.22}
      blur={0.3}
      edge={0.45}
      bevel={0.3}
      aberration={0.16}
      shine={0.3}
      reflection={0.22}
    >
      {card}
    </Glass>
  );
}

// ── Quick Tags ───────────────────────────────────────────────

interface QuickTagsProps {
  tags: string[];
  activeTag: string | null;
  onTagClick: (tag: string) => void;
}

export function QuickTags({ tags, activeTag, onTagClick }: QuickTagsProps) {
  return (
    <div className="dash-quick-tags">
      {tags.map((tag) => (
        <button
          key={tag}
          className={`dash-tag ${activeTag === tag ? "active" : ""}`}
          onClick={() => onTagClick(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

// ── Visual Panel (renders adapter result inline) ─────────────

/** States worth drawing the eye to — these get the state-coloured glow. */
const NEEDS_ATTENTION = ["warning", "critical", "offline", "stale", "denied"];

interface VisualPanelProps {
  title: string;
  subtitle?: string;
  state?: VisualStateValue;
  /**
   * Where the numbers came from. "fixture" means this service is not configured
   * and the panel is showing sample data.
   */
  source?: "live" | "fixture" | "offline";
  children: ReactNode;
}

/**
 * Panel chrome for the dashboard shell.
 *
 * This used to be a hand-rolled copy of the visual library's Surface. Plan
 * Task 5.2 called for deleting it and importing the real one; that step was
 * skipped, so every page you navigate rendered older markup with none of the
 * Phase 5 surface treatment. It now delegates to Surface and adds only what the
 * shell needs on top: the sample-data badge and a state glow.
 */
export function VisualPanel({
  title,
  subtitle,
  state = "healthy",
  source,
  children,
}: VisualPanelProps) {
  const isFixture = source === "fixture";
  const glass = useEffectGate();

  const panel = (
    <Surface
      title={title}
      {...(subtitle ? { subtitle } : {})}
      state={state}
      surfaceStyle={
        glass
          ? // Real refraction is doing the work, so the CSS translucency and
            // blur come off — stacking both muddies the result and costs a
            // backdrop-filter pass for nothing. Elevation and the state glow
            // stay, since Glass does not provide them.
            {
              elevation: "md",
              ...(NEEDS_ATTENTION.includes(String(state)) ? { glow: "state" as const } : {}),
            }
          : {
              translucency: "medium",
              blur: "md",
              elevation: "md",
              ...(NEEDS_ATTENTION.includes(String(state)) ? { glow: "state" as const } : {}),
            }
      }
      {...(isFixture ? { className: "is-fixture" } : {})}
      badge={
        isFixture ? (
          <span
            className="cnv-badge cnv-badge-fixture"
            title="Sample data — this service is not configured"
          >
            SAMPLE DATA
          </span>
        ) : undefined
      }
    >
      {children}
    </Surface>
  );

  if (!glass) return panel;

  return (
    <Glass
      className="cnv-glass-host"
      ior={1.28}
      blur={0.4}
      edge={0.5}
      bevel={0.35}
      aberration={0.22}
      shine={0.35}
      reflection={0.28}
    >
      {panel}
    </Glass>
  );
}

// ── Metric Strip ─────────────────────────────────────────────

/**
 * Thin alias over the visual library's Metrics row.
 *
 * The shell used to carry its own copy of this markup (plan Task 5.2, skipped).
 * The name is kept so callers are unchanged, but there is now exactly one
 * implementation.
 */
export function MetricStrip({
  metrics,
}: {
  metrics: Array<{
    label: string;
    value: string | number;
    unit?: string;
    trend?: number;
    state?: string;
  }>;
}) {
  return <Metrics metrics={metrics} />;
}


// ── Entity Detail Drawer ─────────────────────────────────────

interface EntityDrawerProps {
  open: boolean;
  onClose: () => void;
  entity: {
    id?: string;
    label?: string;
    subtitle?: string;
    state?: string;
    value?: string | number;
    meta?: Record<string, unknown>;
  } | null;
  adapterName?: string;
  /** Whether the panel this entity came from was live or a fixture. */
  entitySource?: "live" | "fixture" | "offline";
}

export function EntityDrawer({
  open,
  onClose,
  entity,
  adapterName,
  entitySource,
}: EntityDrawerProps) {
  if (!open || !entity) return null;
  return (
    <div className="dash-drawer-overlay" onClick={onClose}>
      <div className="dash-drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{entity.label ?? "Entity Detail"}</h2>
          <button onClick={onClose}>✕</button>
        </header>
        <div className="dash-drawer-body">
          {entity.subtitle && <p className="dash-drawer-subtitle">{entity.subtitle}</p>}
          {entity.state && (
            <div className={`dash-drawer-state state-${entity.state}`}>State: {entity.state}</div>
          )}
          {entity.value != null && (
            <div className="dash-drawer-row">
              <small>Value</small>
              <strong>{entity.value}</strong>
            </div>
          )}
          {adapterName && (
            <div className="dash-drawer-row">
              {/* Labelled "Adapter", not "Source" — `source` means live vs
                  sample everywhere else in this codebase, and reusing the word
                  for the adapter name made the drawer ambiguous about where
                  the numbers actually came from. */}
              <small>Adapter</small>
              <strong>{adapterName}</strong>
            </div>
          )}
          {entitySource && (
            <div className="dash-drawer-row">
              <small>Data source</small>
              <strong className={entitySource === "fixture" ? "dash-drawer-fixture" : undefined}>
                {entitySource === "fixture" ? "SAMPLE DATA (service not configured)" : "Live"}
              </strong>
            </div>
          )}
          {entity.meta && Object.keys(entity.meta).length > 0 && (
            <div className="dash-drawer-meta">
              <small>Metadata</small>
              <pre>{JSON.stringify(entity.meta, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Saved Views Bar ──────────────────────────────────────────

interface SavedViewsProps {
  views: Array<{ id: string; label: string }>;
  activeView: string;
  onViewChange: (id: string) => void;
}

export function SavedViews({ views, activeView, onViewChange }: SavedViewsProps) {
  return (
    <div className="dash-saved-views">
      {views.map((v) => (
        <button
          key={v.id}
          className={`dash-view-btn ${activeView === v.id ? "active" : ""}`}
          onClick={() => onViewChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ── Hook: fetch world data ───────────────────────────────────

interface WorldData {
  results: Array<{ adapter: string; result: import("@/adapters/types").VisualQueryResult }>;
  summary: {
    state: VisualStateValue;
    healthy: number;
    total: number;
    title: string;
    subtitle: string;
  };
}

export function useWorldData(world: WorldId, fixtureState: VisualStateValue | null) {
  const [data, setData] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ world });
      if (fixtureState) params.set("state", fixtureState);
      const res = await fetch(`/api/adapters?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [world, fixtureState]);

  useEffect(() => {
    // Wrapped rather than called directly: fetchData sets state, and calling a
    // state-setting function synchronously in an effect body is what
    // react-hooks flags as a cascading-render risk. The scheduling is identical.
    void (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  return { data, loading };
}

// ── Hook: fetch fleet data (all worlds for landing) ──────────

interface FleetData {
  worlds: Array<{
    id: WorldId;
    state: VisualStateValue;
    healthy: number;
    total: number;
  }>;
  overall: {
    state: VisualStateValue;
    healthy: number;
    total: number;
    worldCount: number;
  };
}

export function useFleetData(fixtureState: VisualStateValue | null) {
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (fixtureState) params.set("state", fixtureState);
        const res = await fetch(`/api/fleet?${params}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fixtureState]);

  return { data, loading };
}
