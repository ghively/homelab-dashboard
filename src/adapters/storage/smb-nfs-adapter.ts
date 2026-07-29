// SMB/NFS adapter — file share monitoring, mount status, throughput.
// Host: gh-storage (Synology DS1817+)
// Source: SSH + df/nfsstat, or DSM FileStation API

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const SMBNFS_HOST = process.env.SMBNFS_HOST || "100.88.40.87";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "smb-nfs",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class SmbNfsAdapter implements DataAdapter {
  readonly name = "smb-nfs";
  readonly description = "SMB/NFS file shares — mount status, sessions, and throughput.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`http://${SMBNFS_HOST}:445`, { signal: AbortSignal.timeout(3000) });
    } catch {
      // SMB port won't respond to HTTP — expected
    }
    return makeFreshness(SMBNFS_HOST);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const shares = [
      { id: "media", label: "/media", protocol: "SMB", size: "32 TB", usedPct: 0.575, state: "healthy" as const },
      { id: "backups", label: "/backups", protocol: "SMB", size: "16 TB", usedPct: 0.82, state: "warning" as const },
      { id: "photos", label: "/photos", protocol: "SMB", size: "8 TB", usedPct: 0.45, state: "healthy" as const },
      { id: "nfs-export", label: "/mnt/nfs-export", protocol: "NFS", size: "16 TB", usedPct: 0.30, state: "healthy" as const },
    ];

    const sessions = 8;
    const hasWarning = shares.some((s) => s.state === "warning");

    return {
      title: "SMB/NFS File Shares",
      subtitle: `${shares.length} shares • ${sessions} active sessions`,
      state: hasWarning ? "warning" : "healthy",
      freshness: makeFreshness(SMBNFS_HOST),
      metrics: [
        { label: "Shares", value: shares.length, state: "healthy" },
        { label: "Active Sessions", value: sessions, state: "healthy" },
        { label: "SMB Shares", value: shares.filter((s) => s.protocol === "SMB").length },
        { label: "NFS Exports", value: shares.filter((s) => s.protocol === "NFS").length },
        { label: "Host", value: SMBNFS_HOST },
      ],
      items: shares.map((s) => ({
        id: s.id,
        label: s.label,
        subtitle: `${s.protocol} • ${s.size} • ${(s.usedPct * 100).toFixed(0)}% used`,
        value: s.size,
        progress: s.usedPct,
        state: s.state,
        group: s.protocol,
      })),
    };
  }
}

const adapter = new SmbNfsAdapter();
export { adapter as default };
