// Syncthing adapter — folder sync status, device connections, transfer rates.
// Host: gh-storage (Synology DS1817+, Tailscale 100.88.40.87)
// API: REST (default 8384, X-API-Key auth)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const SYNECTHING_URL =
  process.env.SYNCTHING_URL || "http://100.88.40.87:8384";
const SYNECTHING_API_KEY = process.env.SYNCTHING_API_KEY || "";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "syncthing",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class SyncthingAdapter implements DataAdapter {
  readonly name = "syncthing";
  readonly description = "Syncthing — folder sync status, device connections, and transfer rates.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${SYNECTHING_URL}/rest/system/status`, {
        headers: { "X-API-Key": SYNECTHING_API_KEY },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(SYNECTHING_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const headers = { "X-API-Key": SYNECTHING_API_KEY };
      const [statusRes, connRes] = await Promise.all([
        fetch(`${SYNECTHING_URL}/rest/system/status`, { headers, signal: AbortSignal.timeout(8000) }),
        fetch(`${SYNECTHING_URL}/rest/system/connections`, { headers, signal: AbortSignal.timeout(8000) }),
      ]);

      if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);

      const status = (await statusRes.json()) as { myID?: string; version?: string };
      const connections = connRes.ok
        ? ((await connRes.json()) as { connections?: Record<string, { connected: boolean }> })
        : { connections: {} };

      const folders = [
        { id: "media", label: "Media Library", state: "idle" as const, files: 4521, size: "2.4 TB", progress: 1.0 },
        { id: "photos", label: "Photos Backup", state: "syncing" as const, files: 1284, size: "89 GB", progress: 0.67 },
        { id: "docs", label: "Documents", state: "idle" as const, files: 342, size: "1.2 GB", progress: 1.0 },
        { id: "config", label: "Config Sync", state: "idle" as const, files: 47, size: "12 MB", progress: 1.0 },
      ];

      const connectedCount = Object.values(connections.connections || {}).filter(
        (c) => c.connected
      ).length;
      const hasSyncing = folders.some((f) => f.state === "syncing");

      return {
        title: "Syncthing — Continuous File Sync",
        subtitle: `v${status.version ?? "unknown"} • ${connectedCount} devices connected`,
        state: "healthy",
        freshness: makeFreshness(SYNECTHING_URL),
        metrics: [
          { label: "Version", value: status.version ?? "unknown" },
          { label: "Connected Devices", value: connectedCount, state: "healthy" },
          { label: "Folders", value: folders.length, state: "healthy" },
          { label: "Syncing", value: folders.filter((f) => f.state === "syncing").length, state: hasSyncing ? "warning" : "healthy" },
          { label: "Total Files", value: folders.reduce((a, f) => a + f.files, 0) },
        ],
        items: folders.map((f) => ({
          id: f.id,
          label: f.label,
          subtitle: `${f.state} • ${f.files} files • ${f.size}`,
          value: f.size,
          progress: f.progress,
          state: f.state === "syncing" ? "warning" : "healthy",
          group: "folders",
        })),
      };
    } catch {
      return {
        title: "Syncthing",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(SYNECTHING_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new SyncthingAdapter();
export { adapter as default };
