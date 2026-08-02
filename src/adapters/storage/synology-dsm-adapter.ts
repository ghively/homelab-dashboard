// Synology DSM adapter — volumes, disks, SMART health, storage pools.
// Host: gh-storage (Synology DS1817+, LAN 192.168.0.133, Tailscale 100.88.40.87)
// API: DSM Web API — SYNO.API.Auth (login) then SYNO.Storage.CGI.Storage (load_info)
//
// The previous version of this file fetched nothing and returned a hardcoded
// inventory: three volumes, eight disks with individual temperatures, and the
// subtitle "DS1817+ • 13 drives". Its own comment read "Using mock data with
// real API structure". The dashboard rendered all of it as source: "live".
// Everything below is derived from the DSM response or omitted.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const SYNOLOGY_URL = process.env.SYNOLOGY_URL || "http://100.88.40.87:5000";
// SYNOLOGY_USERNAME is accepted as well as SYNOLOGY_USER — both spellings are
// in circulation and silently reading neither is a painful way to fail.
const SYNOLOGY_USER = process.env.SYNOLOGY_USER || process.env.SYNOLOGY_USERNAME || "";
const SYNOLOGY_PASSWORD = process.env.SYNOLOGY_PASSWORD || "";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "synology-dsm",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

interface DsmVolume {
  id?: string;
  status?: string;
  size?: { total?: string; used?: string };
}

interface DsmDisk {
  id?: string;
  name?: string;
  model?: string;
  status?: string;
  temp?: number;
  smart_status?: string;
}

interface DsmStorageResponse {
  success?: boolean;
  data?: { volumes?: DsmVolume[]; disks?: DsmDisk[] };
}

class SynologyDSMAdapter implements DataAdapter {
  readonly name = "synology-dsm";
  readonly description = "Synology DSM — volumes, disks, SMART health, and storage pools.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${SYNOLOGY_URL}/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Unreachable — freshness still records the endpoint queried.
    }
    return makeFreshness(SYNOLOGY_URL);
  }

  /** DSM requires a session id (sid) before any Storage call. */
  private async login(): Promise<string> {
    const url =
      `${SYNOLOGY_URL}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
      `&account=${encodeURIComponent(SYNOLOGY_USER)}` +
      `&passwd=${encodeURIComponent(SYNOLOGY_PASSWORD)}` +
      `&session=FileStation&format=sid`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`auth HTTP ${res.status}`);
    const body = (await res.json()) as { success?: boolean; data?: { sid?: string } };
    if (!body.success || !body.data?.sid) throw new Error("DSM authentication failed");
    return body.data.sid;
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    if (!SYNOLOGY_USER || !SYNOLOGY_PASSWORD) {
      return {
        title: "Synology DSM — Storage",
        subtitle: "Credentials not configured",
        state: "empty",
        freshness: makeFreshness(SYNOLOGY_URL),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set SYNOLOGY_USER and SYNOLOGY_PASSWORD to query DSM.",
      };
    }

    try {
      const sid = await this.login();
      const res = await fetch(
        `${SYNOLOGY_URL}/webapi/entry.cgi?api=SYNO.Storage.CGI.Storage&version=1` +
          `&method=load_info&_sid=${encodeURIComponent(sid)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as DsmStorageResponse;
      if (!body.success) throw new Error("DSM returned success=false");

      const volumes = body.data?.volumes ?? [];
      const disks = body.data?.disks ?? [];

      const totalBytes = volumes.reduce((a, v) => a + Number(v.size?.total ?? 0), 0);
      const usedBytes = volumes.reduce((a, v) => a + Number(v.size?.used ?? 0), 0);
      const degradedVolumes = volumes.filter((v) => v.status && v.status !== "normal");
      const badDisks = disks.filter(
        (d) => d.smart_status && d.smart_status !== "normal" && d.smart_status !== "good",
      );

      const metrics: Metric[] = [
        { label: "Volumes", value: volumes.length, state: "healthy" },
        { label: "Disks", value: disks.length, state: "healthy" },
        {
          label: "SMART Warnings",
          value: badDisks.length,
          state: badDisks.length > 0 ? "warning" : "healthy",
        },
      ];
      if (totalBytes > 0) {
        metrics.push(
          { label: "Used", value: formatBytes(usedBytes) },
          { label: "Total", value: formatBytes(totalBytes) },
          { label: "Free", value: formatBytes(totalBytes - usedBytes) },
        );
      }

      const items: Item[] = [
        ...volumes.map((v) => {
          const total = Number(v.size?.total ?? 0);
          const used = Number(v.size?.used ?? 0);
          return {
            id: v.id ?? "volume",
            label: v.id ?? "volume",
            subtitle:
              total > 0
                ? `${formatBytes(used)} / ${formatBytes(total)} • ${v.status ?? "unknown"}`
                : (v.status ?? "unknown"),
            ...(total > 0 ? { progress: used / total } : {}),
            state:
              v.status && v.status !== "normal" ? ("warning" as const) : ("healthy" as const),
            group: "volumes",
          };
        }),
        ...disks.map((d) => ({
          id: d.id ?? d.name ?? "disk",
          label: d.name ?? d.id ?? "disk",
          subtitle: [d.model, d.temp != null ? `${d.temp}°C` : null, d.smart_status]
            .filter(Boolean)
            .join(" • "),
          state:
            d.smart_status && d.smart_status !== "normal" && d.smart_status !== "good"
              ? ("warning" as const)
              : ("healthy" as const),
          group: "disks",
        })),
      ];

      const state =
        degradedVolumes.length > 0 || badDisks.length > 0 ? "warning" : "healthy";

      return {
        title: "Synology DSM — Storage",
        subtitle: `${volumes.length} volumes • ${disks.length} disks`,
        state,
        freshness: makeFreshness(SYNOLOGY_URL),
        metrics,
        items,
        summary:
          totalBytes > 0
            ? `${formatBytes(usedBytes)} of ${formatBytes(totalBytes)} used`
            : `${volumes.length} volumes, ${disks.length} disks`,
      };
    } catch {
      return {
        title: "Synology DSM — Storage",
        subtitle: "DSM API unreachable",
        state: "offline",
        freshness: makeFreshness(SYNOLOGY_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new SynologyDSMAdapter();
export { adapter as default };
