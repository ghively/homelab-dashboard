"use client";

import { useState, useMemo } from "react";
import {
  DashboardShell,
  Hero,
  QuickTags,
  EntityDrawer,
  SavedViews,
  useWorldData,
  useFleetData,
  type FleetData,
} from "@/components/dashboard";
import { GenerativeChat, useGenerativeChat, type UseGenerativeChat } from "@/components/generative-chat";
import { RichWorld } from "@/components/rich-world";
import { WORLDS, type WorldId } from "@/lib/workspace-config";
import type { VisualStateValue } from "@/adapters/types";

export default function Home() {
  const [activeWorld, setActiveWorld] = useState<WorldId | "home">("home");
  // Owned here, not inside GenerativeChat, and not per-world either: both
  // conversations previously lived and died with whichever component
  // rendered <GenerativeChat>, so navigating to any other world (clicking
  // "Media" in the sidebar to check something, say) unmounted it and coming
  // back started over with no warning anything had been lost. Home() itself
  // never unmounts across activeWorld changes, so state living here survives
  // navigation. Two separate conversations (home's general chat, the AI
  // workspace's) rather than one shared thread — different context, and
  // conflating them would mean an AI-infra question shows up mid movie-night
  // conversation.
  const homeChat = useGenerativeChat();
  const aiChat = useGenerativeChat();
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

  // Fetched once here rather than inside LandingPage, because the shell needs
  // it too: the DEMO DATA banner is a claim about the whole fleet, and the only
  // thing that knows whether any adapter is live is the fleet endpoint.
  const { data: fleet, loading: fleetLoading } = useFleetData(fixtureState);
  const dataSource: "fixture" | "live" | "unknown" = fleetLoading || !fleet
    ? "unknown"
    : fleet.overall.live > 0
      ? "live"
      : "fixture";

  if (activeWorld === "home") {
    return (
      <DashboardShell
        activeWorld={activeWorld}
        onWorldChange={setActiveWorld}
        onNewChat={() => homeChat.clear()}
        fixtureState={fixtureState}
        onFixtureChange={setFixtureState}
        dataSource={dataSource}
      >
        <LandingPage chat={homeChat} fleet={fleet} />
      </DashboardShell>
    );
  }

  if (activeWorld === "ai") {
    return (
      <DashboardShell
        activeWorld={activeWorld}
        onWorldChange={setActiveWorld}
        onNewChat={() => {
          homeChat.clear();
          setActiveWorld("home");
        }}
        fixtureState={fixtureState}
        onFixtureChange={setFixtureState}
        dataSource={dataSource}
      >
        <AIWorkspace
          chat={aiChat}
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
      dataSource={dataSource}
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


function LandingPage({ chat, fleet }: { chat: UseGenerativeChat; fleet: FleetData | null }) {
  const overall = fleet?.overall;

  /*
    The home page IS the conversation.

    It previously opened on a hero, then the chat, then a grid of world tiles —
    so the one thing this product does was the third thing on the page, below
    two blocks explaining that it existed. Everything here is generated from a
    sentence, so the sentence gets the screen.

    The worlds did not disappear; they moved to the sidebar, which is where
    navigation belongs and where it stays reachable from inside a conversation
    rather than only from the top of the home page. Fleet health rides along as
    the composer's subtitle, so the context survives without costing a section.
  */
  return (
    <GenerativeChat
      chat={chat}
      subtitle={
        overall
          ? `Live from ${overall.healthy}/${overall.total} reporting adapters · fleet ${overall.state}`
          : undefined
      }
    />
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
        <RichWorld
          entries={filteredResults}
          title={worldConfig.label}
          subtitle={worldConfig.tagline}
          onEntityClick={onEntityClick}
        />
      )}
    </>
  );
}

// ── AI Workspace (NL composition) ────────────────────────────

function AIWorkspace({
  chat,
  fixtureState,
  activeTag,
  onTagClick,
  onEntityClick,
}: {
  chat: UseGenerativeChat;
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

      <GenerativeChat chat={chat} />

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
        <RichWorld
          entries={data.results.filter(
            ({ adapter, result }) => !activeTag || matchesTag(adapter, result, activeTag),
          )}
          title={worldConfig.label}
          subtitle={worldConfig.tagline}
          onEntityClick={onEntityClick}
        />
      )}
    </>
  );
}
