// Hermes Dashboard adapter — users, workspaces, task activity.
// Host: gh-ai (192.168.0.50 or Tailscale 100.92.162.32)
// API: HTTP: users, workspaces, task activity

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const HERMES_DASHBOARD_URL =
  process.env.HERMES_DASHBOARD_URL || "http://gh-ai:3000";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "hermes-dashboard",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class HermesDashboardAdapter implements DataAdapter {
  readonly name = "hermes-dashboard";
  readonly description = "Hermes Dashboard — users, workspaces, and task activity.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${HERMES_DASHBOARD_URL}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(HERMES_DASHBOARD_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const start = Date.now();

    try {
      // TODO: Fetch from Hermes Dashboard API:
      // - User count, active users
      // - Workspace count, active workspaces
      // - Task activity: running, blocked, done
      // - Recent task events

      const metrics: Metric[] = [
        { label: "Total Users", value: 3, state: "healthy" },
        { label: "Active Users (24h)", value: 2, state: "healthy" },
        { label: "Total Workspaces", value: 5, state: "healthy" },
        { label: "Running Tasks", value: 8, state: "healthy" },
        { label: "Blocked Tasks", value: 2, state: "warning" },
        { label: "Tasks Completed (24h)", value: 47, state: "healthy" },
      ];

      const items: Item[] = [
        { id: "builder", label: "builder", subtitle: "Software Engineer", value: 12, state: "healthy" },
        { id: "reviewer", label: "reviewer", subtitle: "Code Reviewer", value: 3, state: "healthy" },
        { id: "qa", label: "qa", subtitle: "QA Engineer", value: 5, state: "healthy" },
        { id: "ops", label: "ops", subtitle: "Operations", value: 2, state: "healthy" },
      ];

      return {
        title: "Hermes Dashboard — Users & Workspaces",
        subtitle: "Task activity across all workspaces",
        state: "healthy",
        freshness: makeFreshness(HERMES_DASHBOARD_URL),
        metrics,
        items,
      };
    } catch (err) {
      return {
        title: "Hermes Dashboard — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        freshness: makeFreshness(HERMES_DASHBOARD_URL),
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }
}

const adapter = new HermesDashboardAdapter();
export { adapter as default };