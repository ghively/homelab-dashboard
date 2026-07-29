"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { WORLDS, type WorldId } from "@/lib/workspace-config";
import { ALL_STATES } from "@/lib/adapter-aggregator";
import type { VisualStateValue } from "@/adapters/types";

// ── Dashboard Shell ──────────────────────────────────────────

interface ShellProps {
  children: ReactNode;
  activeWorld: WorldId | "home";
  onWorldChange: (w: WorldId | "home") => void;
  fixtureState: VisualStateValue | null;
  onFixtureChange: (s: VisualStateValue | null) => void;
}

export function DashboardShell({
  children,
  activeWorld,
  onWorldChange,
  fixtureState,
  onFixtureChange,
}: ShellProps) {
  return (
    <div className="dash-root">
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
      <main className="dash-main">{children}</main>
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
  return (
    <header className="dash-hero" style={accent ? { borderColor: accent } : undefined}>
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
  return (
    <button className="dash-world-card" onClick={onClick} style={{ borderTopColor: accent }}>
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

interface VisualPanelProps {
  title: string;
  subtitle?: string;
  state?: VisualStateValue;
  children: ReactNode;
}

export function VisualPanel({ title, subtitle, state = "healthy", children }: VisualPanelProps) {
  return (
    <section className={`cnv cnv-surface state-${state}`}>
      <header className="cnv-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <span className="cnv-badge">{state}</span>
      </header>
      {children}
    </section>
  );
}

// ── Metric Strip ─────────────────────────────────────────────

interface MetricStripProps {
  metrics: Array<{ label: string; value: string | number; unit?: string; trend?: number; state?: string }>;
}

export function MetricStrip({ metrics }: MetricStripProps) {
  return (
    <div className="cnv-metrics">
      {metrics.slice(0, 8).map((m) => (
        <article key={m.label} className={`state-${m.state ?? "healthy"}`}>
          <small>{m.label}</small>
          <strong>
            {m.value}
            {m.unit}
          </strong>
          {m.trend != null && (
            <span>
              {m.trend > 0 ? "↗" : "↘"} {Math.abs(m.trend)}%
            </span>
          )}
        </article>
      ))}
    </div>
  );
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
}

export function EntityDrawer({ open, onClose, entity, adapterName }: EntityDrawerProps) {
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
              <small>Source</small>
              <strong>{adapterName}</strong>
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

// ── AI Query Input ───────────────────────────────────────────

interface AIQueryInputProps {
  onSubmit: (query: string) => void;
  result: { workspace: string; components: string[] } | null;
}

export function AIQueryInput({ onSubmit, result }: AIQueryInputProps) {
  const [text, setText] = useState("");
  return (
    <div className="dash-ai-query">
      <div className="dash-ai-input-wrap">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask in natural language: 'Show me how gh-vps connects to caddy'"
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onSubmit(text.trim());
              setText("");
            }
          }}
        />
        <button onClick={() => text.trim() && (onSubmit(text.trim()), setText(""))}>
          Compose →
        </button>
      </div>
      {result && (
        <div className="dash-ai-result">
          <strong>Workspace: {result.workspace}</strong>
          <div className="dash-ai-components">
            {result.components.map((c) => (
              <span key={c} className="dash-ai-component-tag">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
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
    fetchData();
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
