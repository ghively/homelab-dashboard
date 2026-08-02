"use client";

import { useState, useMemo } from "react";
import {
  DashboardShell,
  Hero,
  WorldCard,
  QuickTags,
  VisualPanel,
  MetricStrip,
  EntityDrawer,
  SavedViews,
  useWorldData,
  useFleetData,
} from "@/components/dashboard";
import { GenerativeChat } from "@/components/generative-chat";
import { GlyphRain } from "@/components/canvasui/GlyphRain";
import { useEffectGate } from "@/components/canvasui/Effect";
import { DecryptText } from "@/components/decrypt-text";
import { WORLDS, type WorldId } from "@/lib/workspace-config";
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
  const [drawerSource, setDrawerSource] = useState<"live" | "fixture" | "offline" | undefined>();
  const [savedView, setSavedView] = useState("overview");

  if (activeWorld === "home") {
    return (
      <DashboardShell
        activeWorld={activeWorld}
        onWorldChange={setActiveWorld}
        fixtureState={fixtureState}
        onFixtureChange={setFixtureState}
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
      >
        <AIWorkspace
          fixtureState={fixtureState}
          activeTag={activeTag}
          onTagClick={setActiveTag}
          onEntityClick={(entity, adapter, source) => {
            setDrawerEntity(entity);
            setDrawerSource(source);
            setDrawerAdapter(adapter);
          }}
        />
        <EntityDrawer
          open={!!drawerEntity}
          onClose={() => setDrawerEntity(null)}
          entity={drawerEntity}
          adapterName={drawerAdapter}
          entitySource={drawerSource}
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
    >
      <WorldView
        world={activeWorld}
        fixtureState={fixtureState}
        activeTag={activeTag}
        onTagClick={setActiveTag}
        savedView={savedView}
        onSaveView={setSavedView}
        onEntityClick={(entity, adapter, source) => {
          setDrawerEntity(entity);
          setDrawerSource(source);
          setDrawerAdapter(adapter);
        }}
      />
      <EntityDrawer
        open={!!drawerEntity}
        onClose={() => setDrawerEntity(null)}
        entity={drawerEntity}
        adapterName={drawerAdapter}
        entitySource={drawerSource}
      />
    </DashboardShell>
  );
}

// ── Landing Page (Visual OS Home) ────────────────────────────


/**
 * The landing hero, wrapped in glyph rain.
 *
 * This is hand-rolled rather than the shared <Hero> because the chat-first
 * landing needs different copy and metrics. That divergence is exactly why the
 * rain added to <Hero> never appeared here — <Hero> is only used by the world
 * views and the AI workspace.
 */
function LandingHero({
  overall,
}: {
  overall: { state: string; healthy: number; total: number } | undefined;
}) {
  const rain = useEffectGate(true);

  const inner = (
    <header className="dash-hero dash-hero-chat cnv-surface tr-medium bl-md bg-gradient el-md">
      <div>
        <h1>
          <DecryptText text="What do you want to see?" duration={1100} />
        </h1>
        <p>
          Describe a dashboard in plain language — it is generated live from{" "}
          {overall ? `${overall.healthy}/${overall.total} reporting adapters` : "your adapters"}.
        </p>
      </div>
      {overall && (
        <div className="dash-hero-metrics">
          <div className={`dash-hero-metric state-${overall.state}`}>
            <small>Fleet</small>
            <strong>{overall.state}</strong>
          </div>
        </div>
      )}
    </header>
  );

  if (!rain) return inner;

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
      {/*
        The chat IS the product. This page used to open on a grid of world tiles
        with a State Fixture Exerciser underneath — a dev harness — while the
        generative chat sat inside the "AI" world, two clicks away. The one
        thing the system exists to do was the hardest thing to find.

        Order is now: ask -> generated dashboard -> fleet status as context.
        The exerciser is gone from the product surface; the world tiles remain
        below as a way to browse adapters directly.
      */}
      <LandingHero overall={overall} />

      <GenerativeChat />

      <div className="dash-section-header">
        <h2>Fleet</h2>
        <small>
          {loading ? "Checking adapters…" : "Click a world to browse its adapters directly"}
        </small>
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
    </>
  );
}


// ── World View (generic workspace) ───────────────────────────

/**
 * Does a panel match a quick-tag? Matches the adapter name, its title/subtitle,
 * and its metric labels.
 *
 * Shared so the AI Workspace and the world views filter identically. The AI
 * Workspace previously rendered QuickTags but mapped over the unfiltered list,
 * so clicking a tag there highlighted it and changed nothing.
 */
function matchesTag(
  adapter: string,
  result: { title?: string; subtitle?: string; metrics?: Array<{ label: string }> },
  tag: string,
): boolean {
  const haystack = `${adapter} ${result.title ?? ""} ${result.subtitle ?? ""} ${(result.metrics ?? [])
    .map((m) => m.label)
    .join(" ")}`.toLowerCase();
  return haystack.includes(tag.toLowerCase());
}

// States that mean "something needs attention". `empty` and `loading` are
// deliberately excluded — an idle panel is not an alert.
const ALERT_STATES = ["warning", "critical", "offline", "stale", "denied"];

// Worst-first ordering for the Detail view, so problems lead.
const STATE_RANK: Record<string, number> = {
  offline: 0, critical: 1, denied: 2, warning: 3, stale: 4,
  loading: 5, empty: 6, healthy: 7,
};

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
  onEntityClick: (
    entity: Record<string, unknown>,
    adapter: string,
    source?: "live" | "fixture" | "offline",
  ) => void;
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
    let results = data.results;

    // The saved-view buttons used to be decorative: `savedView` only drove which
    // button looked active, and the list below never consulted it, so "Health
    // Only" and "Alerts" rendered exactly the same panels as "Overview".
    if (savedView === "health") {
      results = results.filter(({ result }) => result.state === "healthy");
    } else if (savedView === "alerts") {
      results = results.filter(({ result }) => ALERT_STATES.includes(String(result.state)));
    } else if (savedView === "detail") {
      // Detail sorts worst-first so problems lead, rather than filtering.
      results = [...results].sort(
        (a, b) =>
          (STATE_RANK[String(a.result.state)] ?? 9) - (STATE_RANK[String(b.result.state)] ?? 9),
      );
    }

    if (!activeTag) return results;
    return results.filter(({ adapter, result }) => matchesTag(adapter, result, activeTag));
  }, [data, activeTag, savedView]);

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
      ) : filteredResults.length === 0 ? (
        // Now that the saved views actually filter, an empty result is a normal
        // outcome — "Alerts" on a healthy world is the common case. Say why the
        // grid is empty and offer the way out, rather than rendering nothing.
        <div className="dash-empty-filter">
          <strong>
            {savedView === "alerts"
              ? `Nothing needs attention in ${worldConfig.label}.`
              : savedView === "health"
                ? `No healthy adapters in ${worldConfig.label}.`
                : `No adapters match this filter.`}
          </strong>
          <small>
            {activeTag ? `Filtered by tag "${activeTag}".` : null}
            {activeTag && savedView !== "overview" ? " " : null}
            {savedView !== "overview" ? `View: ${savedView}.` : null}
          </small>
          <div className="dash-empty-filter-actions">
            {activeTag && (
              <button onClick={() => onTagClick(activeTag)}>Clear tag</button>
            )}
            {savedView !== "overview" && (
              <button onClick={() => onSaveView("overview")}>Show all</button>
            )}
          </div>
        </div>
      ) : (
        <div className="dash-adapter-grid">
          {filteredResults.map(({ adapter, result }) => (
            <AdapterResultCard
              key={adapter}
              adapterName={adapter}
              result={result}
              onItemClick={(item) => onEntityClick(item, adapter, result.source)}
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
  onEntityClick: (
    entity: Record<string, unknown>,
    adapter: string,
    source?: "live" | "fixture" | "offline",
  ) => void;
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
          {data.results
            .filter(({ adapter, result }) => !activeTag || matchesTag(adapter, result, activeTag))
            .map(({ adapter, result }) => (
              <AdapterResultCard
                key={adapter}
                adapterName={adapter}
                result={result}
                onItemClick={(item) => onEntityClick(item, adapter, result.source)}
              />
            ))}
        </div>
      )}
    </>
  );
}

// ── Adapter Result Card ──────────────────────────────────────

function AdapterResultCard({
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
    <VisualPanel
      title={result.title}
      subtitle={result.subtitle}
      state={result.state}
      source={result.source}
    >
      {hasMetrics && <MetricStrip metrics={result.metrics!} />}

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
    </VisualPanel>
  );
}
