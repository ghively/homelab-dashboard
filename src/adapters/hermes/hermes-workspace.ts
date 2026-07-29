// Hermes Workspace adapter — active tasks, artifact inventory, storage.
// Host: gh-ai (192.168.0.50 or Tailscale 100.92.162.32)
// API: Internal API: active tasks, artifact inventory, storage

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { Item, Metric, VisualQueryResult } from "../types";

class HermesWorkspaceAdapter implements DataAdapter {
  readonly name = "hermes-workspace";
  readonly description = "Hermes Workspace — active tasks and artifact inventory.";
  readonly category = "ai" as const;

  async health() {
    const start = Date.now();
    try {
      // TODO: Real health check: internal workspace API health
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : "Unknown" };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const now = new Date().toISOString();
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
        { id: "t_b68aa39e", label: "Phase 6: AI & Agent Adapters", subtitle: "builder · running", state: "running", meta: { assignee: "builder", priority: 85, created_at: "2026-07-29" } },
        { id: "t_8ec67ef1", label: "Phase 1: OpenUI Dashboard Scaffold", subtitle: "builder · done", state: "done", meta: { assignee: "builder", priority: 95, completed_at: "2026-07-29" } },
        { id: "t_37022ed1", label: "Phase 11: Dashboard Composition", subtitle: "builder · todo", state: "todo", meta: { assignee: "builder", priority: 99, blocked_by: ["Phase 2-10"] } },
        { id: "t_56833a87", label: "Agent Vault Phase 5", subtitle: "builder · done", state: "done", meta: { assignee: "builder", priority: 70, completed_at: "2026-07-28" } },
      ];

      return {
        title: "Hermes Workspace — Active Tasks",
        subtitle: "Task queue and artifact inventory",
        state: "healthy",
        metrics,
        items,
        source: this.name,
        fetchedAt: now,
        ageMs: Date.now() - start,
      };
    } catch (err) {
      return {
        title: "Hermes Workspace — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
        source: this.name,
        fetchedAt: now,
        ageMs: Date.now() - start,
      };
    }
  }
}

const adapter = new HermesWorkspaceAdapter();
export { adapter as default };