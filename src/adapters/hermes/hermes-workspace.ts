// Hermes Workspace adapter — active tasks, artifact inventory, storage.
// Host: gh-ai (192.168.0.50 or Tailscale 100.92.162.32)
// API: Internal API: active tasks, artifact inventory, storage

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";

class HermesWorkspaceAdapter implements DataAdapter {
  readonly name = "hermes-workspace";
  readonly description = "Hermes Workspace — active tasks and artifact inventory.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    const start = Date.now();
    try {
      // TODO: Real health check: internal workspace API health
      return { adapter: this.name, source: this.name, queriedAt: new Date().toISOString(), stalenessSeconds: 0, cacheHit: false };
    } catch {
      return { adapter: this.name, source: this.name, queriedAt: new Date().toISOString(), stalenessSeconds: Math.round((Date.now() - start) / 1000), cacheHit: false };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const start = Date.now();

    try {
      // TODO: Fetch from Hermes Workspace API:
      // - Active tasks by status
      // - Artifact inventory by type
      // - Storage usage per workspace
      // - Recent task events

      const metrics: Metric[] = [
        { label: "Active Tasks", value: 8, state: "healthy" },
        { label: "Blocked Tasks", value: 2, state: "warning" },
        { label: "Artifacts (24h)", value: 124, state: "healthy" },
        { label: "Storage Used", value: 2.3, unit: "GB", state: "healthy" },
        { label: "Workspaces", value: 5, state: "healthy" },
      ];

      const items: Item[] = [
        { id: "t_b68aa39e", label: "Phase 6: AI & Agent Adapters", subtitle: "builder · running", state: "warning", group: "running", meta: { assignee: "builder", priority: 85, created_at: "2026-07-29" } },
        { id: "t_8ec67ef1", label: "Phase 1: OpenUI Dashboard Scaffold", subtitle: "builder · done", state: "healthy", group: "done", meta: { assignee: "builder", priority: 95, completed_at: "2026-07-29" } },
        { id: "t_37022ed1", label: "Phase 11: Dashboard Composition", subtitle: "builder · todo", state: "empty", group: "todo", meta: { assignee: "builder", priority: 99, blocked_by: ["Phase 2-10"] } },
        { id: "t_56833a87", label: "Agent Vault Phase 5", subtitle: "builder · done", state: "healthy", group: "done", meta: { assignee: "builder", priority: 70, completed_at: "2026-07-28" } },
      ];

      return {
        title: "Hermes Workspace — Active Tasks",
        subtitle: "Task queue and artifact inventory",
        state: "healthy",
        metrics,
        items,
        source: "live",
        freshness: {
          adapter: this.name,
          source: this.name,
          queriedAt: new Date(start).toISOString(),
          stalenessSeconds: 0,
          cacheHit: false,
        },
      };
    } catch (err) {
      return {
        title: "Hermes Workspace — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
        source: "live",
        freshness: {
          adapter: this.name,
          source: this.name,
          queriedAt: new Date(start).toISOString(),
          stalenessSeconds: 0,
          cacheHit: false,
        },
      };
    }
  }
}

const adapter = new HermesWorkspaceAdapter();
export { adapter as default };