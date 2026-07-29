// Fixture data generators for testing all adapter states.
// These return valid VisualQueryResult structures without making real API calls.

import type { Item, Metric, Node, Edge, Event, VisualQueryResult, VisualStateValue } from "./types";

// Create a fixture result with the specified state.
export function createFixture(params: {
  source: string;
  state: VisualStateValue;
  title: string;
  subtitle?: string | undefined;
  metrics?: Metric[] | undefined;
  items?: Item[] | undefined;
  nodes?: Node[] | undefined;
  edges?: Edge[] | undefined;
  events?: Event[] | undefined;
  summary?: string | undefined;
}): VisualQueryResult {
  const now = new Date().toISOString();
  return {
    state: params.state,
    freshness: {
      adapter: params.source,
      source: params.source,
      queriedAt: now,
      stalenessSeconds: 0,
      cacheHit: false,
    },
    metrics: params.metrics ?? [],
    items: params.items ?? [],
    nodes: params.nodes ?? [],
    edges: params.edges ?? [],
    events: params.events ?? [],
    title: params.title,
    subtitle: params.subtitle,
    summary: params.summary,
  };
}

// State-specific fixture generators.
export function fixtureHealthy(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "healthy" as const,
    title: `${source} - Online`,
    subtitle: "All systems operational",
    metrics: [
      { label: "Status", value: "OK", state: "healthy" as const },
      { label: "Latency", value: "12ms", unit: "ms", trend: -0.1, state: "healthy" as const },
    ],
  });
}

export function fixtureWarning(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "warning" as const,
    title: `${source} - Degraded`,
    subtitle: "Elevated latency or partial outage",
    metrics: [
      { label: "Status", value: "Degraded", state: "warning" as const },
      { label: "Latency", value: "342ms", unit: "ms", trend: 0.8, state: "warning" as const },
      { label: "Error Rate", value: "2.3%", unit: "%", state: "warning" as const },
    ],
  });
}

export function fixtureCritical(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "critical" as const,
    title: `${source} - Critical`,
    subtitle: "Service unreachable or non-functional",
    metrics: [
      { label: "Status", value: "DOWN", state: "critical" as const },
      { label: "Latency", value: "∞", unit: "ms", state: "critical" as const },
      { label: "Error Rate", value: "100%", unit: "%", state: "critical" as const },
    ],
  });
}

export function fixtureOffline(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "offline" as const,
    title: `${source} - Offline`,
    subtitle: "Host or network unreachable",
    metrics: [{ label: "Status", value: "OFFLINE", state: "offline" as const }],
    summary: "Connection refused or timeout",
  });
}

export function fixtureStale(source: string): VisualQueryResult {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
  return createFixture({
    source,
    state: "stale" as const,
    title: `${source} - Stale Data`,
    subtitle: "Last successful fetch >5 minutes ago",
    metrics: [
      { label: "Status", value: "OK", state: "stale" as const },
      { label: "Last Fetch", value: fiveMinAgo, state: "stale" as const },
    ],
    summary: "Data is stale but last known state was healthy",
  });
}

export function fixtureLoading(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "loading" as const,
    title: `${source} - Loading`,
    subtitle: "Fetching data...",
    metrics: [{ label: "Status", value: "Loading...", state: "loading" as const }],
  });
}

export function fixtureEmpty(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "empty" as const,
    title: `${source} - No Data`,
    subtitle: "Service reachable but returned no results",
    metrics: [{ label: "Status", value: "OK", state: "healthy" as const }],
    items: [],
    summary: "No items found for this query",
  });
}

export function fixtureDenied(source: string): VisualQueryResult {
  return createFixture({
    source,
    state: "denied" as const,
    title: `${source} - Access Denied`,
    subtitle: "Authentication or authorization failure",
    metrics: [{ label: "Status", value: "DENIED", state: "denied" as const }],
    summary: "Check credentials and permissions",
  });
}

// Route to the appropriate fixture generator.
export function getFixtureForState(source: string, state: VisualStateValue): VisualQueryResult {
  switch (state) {
    case "healthy":
      return fixtureHealthy(source);
    case "warning":
      return fixtureWarning(source);
    case "critical":
      return fixtureCritical(source);
    case "offline":
      return fixtureOffline(source);
    case "stale":
      return fixtureStale(source);
    case "loading":
      return fixtureLoading(source);
    case "empty":
      return fixtureEmpty(source);
    case "denied":
      return fixtureDenied(source);
  }
}