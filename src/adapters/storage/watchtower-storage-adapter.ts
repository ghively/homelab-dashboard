// Watchtower adapter — gh-storage (Synology) Docker fleet image update monitoring.
// Host: gh-storage (Synology DS1817+, LAN 192.168.0.133, Tailscale 100.88.40.87)
// Source: Watchtower HTTP API (default 8080) via Container Manager

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const WATCHTOWER_STORAGE_URL = process.env.WATCHTOWER_STORAGE_URL || "http://100.88.40.87:8080";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "watchtower-storage",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

interface WatchtowerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  updated?: string;
  update_available?: boolean;
}

class WatchtowerStorageAdapter implements DataAdapter {
  readonly name = "watchtower-storage";
  readonly description = "Watchtower — container image update monitoring for gh-storage Docker fleet.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${WATCHTOWER_STORAGE_URL}/v1/containers`, {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(WATCHTOWER_STORAGE_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const res = await fetch(`${WATCHTOWER_STORAGE_URL}/v1/containers`, {
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const containers = (await res.json()) as WatchtowerContainer[];
      return this.buildResult(containers);
    } catch {
      return {
        title: "Watchtower — gh-storage",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(WATCHTOWER_STORAGE_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }

  private buildResult(containers: WatchtowerContainer[]): VisualQueryResult {
    const running = containers.filter((c) => c.state === "running");
    const updates = containers.filter((c) => c.update_available);
    const recentlyUpdated = containers
      .filter((c) => c.updated)
      .sort((a, b) => new Date(b.updated!).getTime() - new Date(a.updated!).getTime())
      .slice(0, 8);

    return {
      title: "Watchtower — gh-storage Docker Fleet",
      subtitle: `${containers.length} containers • ${updates.length} updates available`,
      state: updates.length > 0 ? "warning" : "healthy",
      freshness: makeFreshness(WATCHTOWER_STORAGE_URL),
      metrics: [
        { label: "Total Containers", value: containers.length, state: "healthy" },
        { label: "Running", value: running.length, state: "healthy" },
        { label: "Updates Available", value: updates.length, state: updates.length > 0 ? "warning" : "healthy" },
        { label: "Recently Updated", value: recentlyUpdated.length, state: "healthy" },
      ],
      items: [
        ...updates.map((c) => ({
          id: c.id,
          label: c.name,
          subtitle: `${c.image} • UPDATE AVAILABLE`,
          state: "warning" as const,
          group: "updates",
        })),
        ...recentlyUpdated.map((c) => ({
          id: `${c.id}-updated`,
          label: c.name,
          subtitle: `${c.image} • updated ${c.updated}`,
          state: "healthy" as const,
          group: "recent",
        })),
      ],
      summary: `${running.length}/${containers.length} running, ${updates.length} updates pending`,
    };
  }
}

const adapter = new WatchtowerStorageAdapter();
export { adapter as default };
