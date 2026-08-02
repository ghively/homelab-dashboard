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

interface FolderStatus {
  id: string;
  label: string;
  state?: string | undefined;
  files?: number | undefined;
  bytes?: number | undefined;
  progress?: number | undefined;
}

function formatBytes(bytes?: number): string | null {
  if (bytes == null) return null;
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

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
      const [statusRes, connRes, configRes] = await Promise.all([
        fetch(`${SYNECTHING_URL}/rest/system/status`, { headers, signal: AbortSignal.timeout(8000) }),
        fetch(`${SYNECTHING_URL}/rest/system/connections`, { headers, signal: AbortSignal.timeout(8000) }),
        fetch(`${SYNECTHING_URL}/rest/config/folders`, { headers, signal: AbortSignal.timeout(8000) }),
      ]);

      if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);

      const status = (await statusRes.json()) as { myID?: string; version?: string };
      const connections = connRes.ok
        ? ((await connRes.json()) as { connections?: Record<string, { connected: boolean }> })
        : { connections: {} };

      // Folder list comes from the config, then each folder's live state and
      // completion come from /rest/db/status per folder. Anything the API does
      // not return is omitted rather than filled in with a placeholder.
      const configured = configRes.ok
        ? ((await configRes.json()) as Array<{ id: string; label?: string; path?: string }>)
        : [];

      const folders: FolderStatus[] = await Promise.all(
        configured.map(async (f): Promise<FolderStatus> => {
          try {
            const dbRes = await fetch(
              `${SYNECTHING_URL}/rest/db/status?folder=${encodeURIComponent(f.id)}`,
              { headers, signal: AbortSignal.timeout(8000) },
            );
            if (!dbRes.ok) return { id: f.id, label: f.label || f.id };
            const db = (await dbRes.json()) as {
              state?: string;
              localFiles?: number;
              localBytes?: number;
              globalBytes?: number;
              needBytes?: number;
            };
            const globalBytes = db.globalBytes ?? 0;
            const needBytes = db.needBytes ?? 0;
            return {
              id: f.id,
              label: f.label || f.id,
              state: db.state,
              files: db.localFiles,
              bytes: db.localBytes,
              ...(globalBytes > 0
                ? { progress: Math.max(0, Math.min(1, 1 - needBytes / globalBytes)) }
                : {}),
            };
          } catch {
            return { id: f.id, label: f.label || f.id };
          }
        }),
      );

      const connectedCount = Object.values(connections.connections || {}).filter(
        (c) => c.connected
      ).length;
      const syncingCount = folders.filter((f) => f.state === "syncing").length;
      const hasSyncing = syncingCount > 0;
      const totalFiles = folders.reduce((a, f) => a + (f.files ?? 0), 0);

      return {
        title: "Syncthing — Continuous File Sync",
        subtitle: `v${status.version ?? "unknown"} • ${connectedCount} devices connected`,
        state: "healthy",
        freshness: makeFreshness(SYNECTHING_URL),
        metrics: [
          { label: "Version", value: status.version ?? "unknown" },
          { label: "Connected Devices", value: connectedCount, state: "healthy" },
          { label: "Folders", value: folders.length, state: "healthy" },
          { label: "Syncing", value: syncingCount, state: hasSyncing ? "warning" : "healthy" },
          { label: "Total Files", value: totalFiles },
        ],
        items: folders.map((f) => ({
          id: f.id,
          label: f.label,
          subtitle: [f.state, f.files != null ? `${f.files} files` : null, formatBytes(f.bytes)]
            .filter(Boolean)
            .join(" • "),
          ...(f.progress != null ? { progress: f.progress } : {}),
          state: f.state === "syncing" ? ("warning" as const) : ("healthy" as const),
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
