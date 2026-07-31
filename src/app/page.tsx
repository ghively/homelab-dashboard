"use client";

import { useState, useMemo } from "react";
import {
  DashboardShell,
  Hero,
  WorldCard,
  QuickTags,
  EntityDrawer,
  SavedViews,
  useWorldData,
  useFleetData,
} from "@/components/dashboard";
import { Surface, MetricsView } from "@/visual/components/views";
import { GenerativeChat } from "@/components/generative-chat";
import { WORLDS, type WorldId } from "@/lib/workspace-config";
import { ALL_STATES } from "@/lib/adapter-aggregator";
import type { VisualStateValue, VisualQueryResult } from "@/adapters/types";

export default function Home() {
  const [activeWorld, setActiveWorld] = useState<WorldId | "home">("home");
  const [fixtureState, setFixtureState] = useState<VisualStateValue | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [drawerEntity, setDrawerEntity] = useState<{
    id?: string;
    label?: string;
    subtitle?: string;
    state?: string;
    value?: string | number;
    meta?: Record<string, unknown>;
  } | null>(null);
  const [drawerAdapter, setDrawerAdapter] = useState<string | undefined>();
  const [savedView, setSavedView] = useState("overview");

  // dataSource is now computed from the fleet API: when any adapter is
  // registered as live, the banner switches to LIVE + DEMO mode.
  const fleetData = useFleetData(fixtureState);
  const liveAdapters = fleetData.data?.liveAdapters;

  if (activeWorld === "home") {
    return (
      <DashboardShell
        activeWorld={activeWorld}
        onWorldChange={setActiveWorld}
        fixtureState={fixtureState}
        onFixtureChange={setFixtureState}
        liveAdapters={liveAdapters}
      >
        <LandingPage
          fixtureState={fixtureState}
          onWorldSelect={setActiveWorld}
        />
      </DashboardShell>
    );
  }

  if (activeWorld === "ai") {
    return (
      <DashboardShell
        activeWorld={activeWorld}
        onWorldChange={setActiveWorld}
        fixtureState={fixtureState}
        onFixtureChange={setFixtureState}
        liveAdapters={liveAdapters}
      >
        <AIWorkspace
          fixtureState={fixtureState}
          activeTag={activeTag}
          onTagClick={setActiveTag}
          onEntityClick={(entity, adapter) => {
            setDrawerEntity(entity);
            setDrawerAdapter(adapter);
          }}
        />
        <EntityDrawer
          open={!!drawerEntity}
          onClose={() => setDrawerEntity(null)}
          entity={drawerEntity}
          adapterName={drawerAdapter}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      activeWorld={activeWorld}
      onWorldChange={setActiveWorld}
      fixtureState={fixtureState}
      onFixtureChange={setFixtureState}
      liveAdapters={liveAdapters}
    >
      <WorldView
        world={activeWorld}
        fixtureState={fixtureState}
        activeTag={activeTag}
        onTagClick={setActiveTag}
        savedView={savedView}
        onSaveView={setSavedView}
        onEntityClick={(entity, adapter) => {
          setDrawerEntity(entity);
          setDrawerAdapter(adapter);
        }}
      />
      <EntityDrawer
        open={!!drawerEntity}
        onClose={() => setDrawerEntity(null)}
        entity={drawerEntity}
        adapterName={drawerAdapter}
      />
    </DashboardShell>
  );
}

// ── Landing Page (Visual OS Home) ────────────────────────────

function LandingPage({
  fixtureState,
  onWorldSelect,
}: {
  fixtureState: VisualStateValue | null;
  onWorldSelect: (w: WorldId) => void;
}) {
  const { data, loading } = useFleetData(fixtureState);

  const worldStates = useMemo(() => {
    if (!data) return {};
    return Object.fromEntries(data.worlds.map((w) => [w.id, w]));
  }, [data]);

  const overall = data?.overall;

  return (
    <>
      <Hero
        title="Visual OS"
        subtitle="Single pane of glass for the homelab fleet — 8 worlds, 60+ adapters, 905 visual components"
        accent="var(--dash-accent)"
        metrics={
          overall
            ? [
                { label: "Overall", value: overall.state, state: overall.state },
                { label: "Adapters", value: overall.total },
                { label: "Healthy", value: overall.healthy, state: "healthy" },
                { label: "Worlds", value: overall.worldCount },
              ]
            : undefined
        }
      />

      <div className="dash-section-header">
        <h2>Worlds</h2>
        <small>{loading ? "Loading fleet status..." : "Click a world to drill in"}</small>
      </div>

      <div className="dash-world-grid">
        {WORLDS.map((w) => {
          const ws = worldStates[w.id];
          return (
            <WorldCard
              key={w.id}
              icon={w.icon}
              label={w.label}
              tagline={w.tagline}
              adapterCount={w.adapters.length}
              state={ws?.state ?? "loading"}
              healthy={ws?.healthy ?? 0}
              total={ws?.total ?? w.adapters.length}
              accent={w.accent}
              onClick={() => onWorldSelect(w.id)}
            />
          );
        })}
      </div>

      <div className="dash-section-header">
        <h2>Quick Access</h2>
      </div>
      <div className="dash-quick-tags">
        {[
          "All Healthy",
          "Warnings",
          "Critical",
          "Recently Changed",
          "Energy Flow",
          "Network Mesh",
          "Security Alerts",
          "AI Spend",
        ].map((tag) => (
          <span
            key={tag}
            className="dash-tag"
            style={{ cursor: "default" }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="dash-section-header">
        <h2>State Fixture Exerciser</h2>
        <small>All 8 states rendered across sample adapters</small>
      </div>
      <FixtureExerciser />
    </>
  );
}

// ── World View (generic workspace) ───────────────────────────

function WorldView({
  world,
  fixtureState,
  activeTag,
  onTagClick,
  savedView,
  onSaveView,
  onEntityClick,
}: {
  world: WorldId;
  fixtureState: VisualStateValue | null;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  savedView: string;
  onSaveView: (id: string) => void;
  onEntityClick: (entity: Record<string, unknown>, adapter: string) => void;
}) {
  const { data, loading } = useWorldData(world, fixtureState);
  const worldConfig = WORLDS.find((w) => w.id === world)!;

  const savedViews = [
    { id: "overview", label: "Overview" },
    { id: "health", label: "Health Only" },
    { id: "alerts", label: "Alerts" },
    { id: "detail", label: "Detail View" },
  ];

  const filteredResults = useMemo(() => {
    if (!data) return [];
    if (!activeTag) return data.results;
    // Simple tag-based filter: show adapters whose name or data matches the tag
    return data.results.filter(({ adapter, result }) => {
      const haystack = `${adapter} ${result.title} ${result.subtitle ?? ""} ${(result.metrics ?? []).map((m) => m.label).join(" ")}`.toLowerCase();
      return haystack.includes(activeTag.toLowerCase());
    });
  }, [data, activeTag]);

  return (
    <>
      <Hero
        title={`${worldConfig.icon} ${worldConfig.label}`}
        subtitle={worldConfig.tagline}
        accent={worldConfig.accent}
        metrics={
          data
            ? [
                { label: "State", value: data.summary.state, state: data.summary.state },
                { label: "Adapters", value: data.summary.total },
                { label: "Healthy", value: data.summary.healthy, state: "healthy" },
              ]
            : undefined
        }
      />

      <SavedViews views={savedViews} activeView={savedView} onViewChange={onSaveView} />

      <QuickTags
        tags={worldConfig.quickTags}
        activeTag={activeTag}
        onTagClick={(t) => onTagClick(t === activeTag ? "" : t)}
      />

      {loading ? (
        <div className="dash-loading">
          <div className="dash-loading-spinner" />
          Loading {worldConfig.label}...
        </div>
      ) : (
        <div className="dash-adapter-grid">
          {filteredResults.map(({ adapter, result }) => (
            <AdapterResultCard
              key={adapter}
              adapterName={adapter}
              result={result}
              onItemClick={(item) => onEntityClick(item, adapter)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── AI Workspace (NL composition) ────────────────────────────

function AIWorkspace({
  fixtureState,
  activeTag,
  onTagClick,
  onEntityClick,
}: {
  fixtureState: VisualStateValue | null;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  onEntityClick: (entity: Record<string, unknown>, adapter: string) => void;
}) {
  const { data, loading } = useWorldData("ai", fixtureState);
  const worldConfig = WORLDS.find((w) => w.id === "ai")!;

  return (
    <>
      <Hero
        title="🧠 AI Workspace"
        subtitle="Compose visualizations from natural language. Query routing, models, spend, and agent activity."
        accent={worldConfig.accent}
        metrics={
          data
            ? [
                { label: "Providers", value: data.summary.total },
                { label: "Healthy", value: data.summary.healthy, state: "healthy" },
                { label: "State", value: data.summary.state, state: data.summary.state },
              ]
            : undefined
        }
      />

      <GenerativeChat />

      <QuickTags
        tags={worldConfig.quickTags}
        activeTag={activeTag}
        onTagClick={(t) => onTagClick(t === activeTag ? "" : t)}
      />

      {loading || !data ? (
        <div className="dash-loading">
          <div className="dash-loading-spinner" />
          Loading AI adapters...
        </div>
      ) : (
        <div className="dash-adapter-grid">
          {data.results.map(({ adapter, result }) => (
            <AdapterResultCard
              key={adapter}
              adapterName={adapter}
              result={result}
              onItemClick={(item) => onEntityClick(item, adapter)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Adapter Result Card ──────────────────────────────────────

function AdapterResultCard({
  adapterName,
  result,
  onItemClick,
}: {
  adapterName: string;
  result: VisualQueryResult;
  onItemClick: (item: Record<string, unknown>) => void;
}) {
  const hasItems = result.items && result.items.length > 0;
  const hasMetrics = result.metrics && result.metrics.length > 0;
  const hasEvents = result.events && result.events.length > 0;
  const hasNodes = result.nodes && result.nodes.length > 0;

  return (
    <Surface title={result.title} subtitle={result.subtitle} state={result.state}>
      {hasMetrics && <MetricsView metrics={result.metrics!} />}

      {hasItems && (
        <div className="dash-adapter-items" style={{ marginTop: hasMetrics ? 12 : 0 }}>
          {result.items!.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="dash-adapter-item"
              onClick={() => onItemClick(item as Record<string, unknown>)}
            >
              <div>
                <strong>{item.label}</strong>
                {item.subtitle && <small style={{ display: "block" }}>{item.subtitle}</small>}
                {item.progress != null && (
                  <div className="dash-progress-bar">
                    <i style={{ width: `${item.progress * 100}%` }} />
                  </div>
                )}
              </div>
              {item.value != null && <span>{item.value}</span>}
            </div>
          ))}
        </div>
      )}

      {hasEvents && (
        <div className="dash-adapter-items" style={{ marginTop: hasMetrics ? 12 : 0 }}>
          {result.events!.slice(0, 4).map((evt) => (
            <div key={evt.id} className="dash-adapter-item" onClick={() => onItemClick(evt as unknown as Record<string, unknown>)}>
              <div>
                <strong>{evt.title}</strong>
                {evt.detail && <small style={{ display: "block" }}>{evt.detail}</small>}
              </div>
              <small>{evt.at}</small>
            </div>
          ))}
        </div>
      )}

      {hasNodes && (
        <div className="dash-adapter-items" style={{ marginTop: hasMetrics ? 12 : 0 }}>
          {result.nodes!.slice(0, 6).map((node) => (
            <div key={node.id} className="dash-adapter-item" onClick={() => onItemClick(node as unknown as Record<string, unknown>)}>
              <strong>{node.label}</strong>
              <span className={`state-${node.state ?? "healthy"}`}>{node.state ?? "healthy"}</span>
            </div>
          ))}
        </div>
      )}

      {!hasItems && !hasMetrics && !hasEvents && !hasNodes && (
        <div className="dash-loading" style={{ padding: 20 }}>
          <small>No data to display</small>
        </div>
      )}
    </Surface>
  );
}

// ── Fixture Exerciser (all 8 states) ─────────────────────────

function FixtureExerciser() {
  const sampleAdapters = ["emby", "prometheus", "synology-dsm", "wazuh-manager"];

  return (
    <div className="dash-fixture-grid">
      {ALL_STATES.map((state) => (
        <div key={state} className="dash-fixture-cell">
          <div className="dash-fixture-cell-head">
            <h5>State: {state}</h5>
            <span className={`cnv-badge state-${state}`}>{state}</span>
          </div>
          {sampleAdapters.map((adapter) => (
            <FixtureStatePreview key={adapter} adapter={adapter} state={state} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FixtureStatePreview({
  adapter,
  state,
}: {
  adapter: string;
  state: VisualStateValue;
}) {
  const [result, setResult] = useState<VisualQueryResult | null>(null);

  useMemo(() => {
    fetch(`/api/adapters?adapter=${adapter}&state=${state}`)
      .then((r) => r.json())
      .then((d) => setResult(d.result))
      .catch(() => setResult(null));
  }, [adapter, state]);

  if (!result) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <small style={{ color: "var(--dash-muted)", display: "block", marginBottom: 4 }}>
        {adapter}
      </small>
      <div className={`state-${result.state}`} style={{ fontSize: 12 }}>
        {result.title}
      </div>
    </div>
  );
}
