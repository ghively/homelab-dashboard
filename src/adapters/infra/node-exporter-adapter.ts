// node_exporter adapter — per-host CPU load, memory and root filesystem.
//
// Configured as a comma-separated list of `label=url` pairs in
// NODE_EXPORTER_URLS, e.g.
//   gh-ai=http://100.92.162.32:9100,gh-arm=http://gh-arm:9100
// A bare url is accepted too; the hostname becomes the label.
//
// Hosts are probed in parallel on the fan-out budget, and a host that does not
// answer is reported as offline *in the item list* rather than taking the
// whole panel down — the point of a fleet panel is to show which host is the
// problem, which is impossible if one dead host blanks the panel.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  classifyError,
  fetchText,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";
import { findSample, formatBytes, parsePromText, sampleValue } from "../ops/prom-text";

const NODE_EXPORTER_URLS = process.env.NODE_EXPORTER_URLS || "";

interface HostTarget {
  label: string;
  url: string;
}

interface HostReading {
  label: string;
  url: string;
  ok: boolean;
  error?: string;
  cores?: number;
  load1?: number;
  memTotal?: number;
  memAvailable?: number;
  rootSize?: number;
  rootAvail?: number;
  uptimeSeconds?: number;
  kernel?: string;
  arch?: string;
}

function parseTargets(raw: string): HostTarget[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      if (eq > 0) return { label: entry.slice(0, eq).trim(), url: entry.slice(eq + 1).trim() };
      try {
        return { label: new URL(entry).hostname, url: entry };
      } catch {
        return { label: entry, url: entry };
      }
    });
}

async function readHost(t: HostTarget): Promise<HostReading> {
  try {
    const body = await fetchText(`${t.url.replace(/\/$/, "")}/metrics`, {}, ADAPTER_FANOUT_TIMEOUT_MS);
    const s = parsePromText(body);

    const uname = findSample(s, "node_uname_info");
    // node_cpu_seconds_total has one series per cpu per mode; distinct cpu
    // labels in the idle mode is the core count without summing anything.
    const cores = new Set(
      s.filter((x) => x.name === "node_cpu_seconds_total" && x.labels.mode === "idle").map((x) => x.labels.cpu),
    ).size;
    const bootTime = sampleValue(s, "node_boot_time_seconds");

    return {
      label: uname?.labels.nodename || t.label,
      url: t.url,
      ok: true,
      ...(cores > 0 ? { cores } : {}),
      ...(sampleValue(s, "node_load1") != null ? { load1: sampleValue(s, "node_load1")! } : {}),
      ...(sampleValue(s, "node_memory_MemTotal_bytes") != null
        ? { memTotal: sampleValue(s, "node_memory_MemTotal_bytes")! }
        : {}),
      ...(sampleValue(s, "node_memory_MemAvailable_bytes") != null
        ? { memAvailable: sampleValue(s, "node_memory_MemAvailable_bytes")! }
        : {}),
      ...(sampleValue(s, "node_filesystem_size_bytes", { mountpoint: "/" }) != null
        ? { rootSize: sampleValue(s, "node_filesystem_size_bytes", { mountpoint: "/" })! }
        : {}),
      ...(sampleValue(s, "node_filesystem_avail_bytes", { mountpoint: "/" }) != null
        ? { rootAvail: sampleValue(s, "node_filesystem_avail_bytes", { mountpoint: "/" })! }
        : {}),
      ...(bootTime ? { uptimeSeconds: Date.now() / 1000 - bootTime } : {}),
      ...(uname?.labels.release ? { kernel: uname.labels.release } : {}),
      ...(uname?.labels.machine ? { arch: uname.labels.machine } : {}),
    };
  } catch (err) {
    return { label: t.label, url: t.url, ok: false, error: classifyError(err).message };
  }
}

function hostState(h: HostReading): "healthy" | "warning" | "critical" | "offline" {
  if (!h.ok) return "offline";
  const memUsed = h.memTotal && h.memAvailable ? 1 - h.memAvailable / h.memTotal : 0;
  const diskUsed = h.rootSize && h.rootAvail ? 1 - h.rootAvail / h.rootSize : 0;
  const loadPerCore = h.load1 != null && h.cores ? h.load1 / h.cores : 0;
  if (diskUsed > 0.95 || memUsed > 0.95) return "critical";
  if (diskUsed > 0.85 || memUsed > 0.85 || loadPerCore > 1.5) return "warning";
  return "healthy";
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

class NodeExporterAdapter implements DataAdapter {
  readonly name = "node-exporter";
  readonly description = "node_exporter — per-host CPU load, memory and root filesystem.";
  readonly category = "host" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, NODE_EXPORTER_URLS || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const targets = parseTargets(NODE_EXPORTER_URLS);
    if (targets.length === 0) {
      return notConfiguredResult(this.name, "Host Fleet — System Metrics", "NODE_EXPORTER_URLS");
    }

    const start = Date.now();
    const readings = await Promise.all(targets.map(readHost));
    const live = readings.filter((r) => r.ok);
    const dead = readings.filter((r) => !r.ok);

    const avg = (pick: (h: HostReading) => number | undefined): number | null => {
      const vals = live.map(pick).filter((v): v is number => v != null && Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    const avgMemPct = avg((h) => (h.memTotal && h.memAvailable ? (1 - h.memAvailable / h.memTotal) * 100 : undefined));
    const avgDiskPct = avg((h) => (h.rootSize && h.rootAvail ? (1 - h.rootAvail / h.rootSize) * 100 : undefined));
    const avgLoadPerCore = avg((h) => (h.load1 != null && h.cores ? h.load1 / h.cores : undefined));

    const worst = readings.reduce<"healthy" | "warning" | "critical" | "offline">((w, h) => {
      const rank = { healthy: 0, warning: 1, critical: 2, offline: 3 } as const;
      const s = hostState(h);
      return rank[s] > rank[w] ? s : w;
    }, "healthy");

    const metrics: Metric[] = [
      {
        label: "Hosts Reporting",
        value: `${live.length}/${readings.length}`,
        state: dead.length ? "warning" : "healthy",
      },
      ...(avgLoadPerCore != null
        ? [
            {
              label: "Avg Load/Core",
              value: avgLoadPerCore.toFixed(2),
              state: (avgLoadPerCore > 1.5 ? "warning" : "healthy") as "warning" | "healthy",
            },
          ]
        : []),
      ...(avgMemPct != null
        ? [
            {
              label: "Avg Memory",
              value: `${avgMemPct.toFixed(0)}%`,
              state: (avgMemPct > 85 ? "warning" : "healthy") as "warning" | "healthy",
            },
          ]
        : []),
      ...(avgDiskPct != null
        ? [
            {
              label: "Avg Root Disk",
              value: `${avgDiskPct.toFixed(0)}%`,
              state: (avgDiskPct > 85 ? "warning" : "healthy") as "warning" | "healthy",
            },
          ]
        : []),
      { label: "Unreachable", value: dead.length, state: dead.length ? "warning" : "healthy" },
    ];

    const items: Item[] = readings.map((h) => {
      const memPct = h.memTotal && h.memAvailable ? (1 - h.memAvailable / h.memTotal) * 100 : null;
      const diskPct = h.rootSize && h.rootAvail ? (1 - h.rootAvail / h.rootSize) * 100 : null;
      const parts = h.ok
        ? [
            h.cores ? `${h.cores} cores` : null,
            h.load1 != null ? `load ${h.load1.toFixed(2)}` : null,
            memPct != null ? `mem ${memPct.toFixed(0)}% of ${formatBytes(h.memTotal!)}` : null,
            diskPct != null ? `/ ${diskPct.toFixed(0)}% of ${formatBytes(h.rootSize!)}` : null,
            h.uptimeSeconds ? `up ${fmtUptime(h.uptimeSeconds)}` : null,
            h.arch ?? null,
          ].filter(Boolean)
        : [h.error ?? "unreachable"];
      return {
        id: `host:${h.label}`,
        label: h.label,
        subtitle: parts.join(" • "),
        ...(diskPct != null ? { value: `${diskPct.toFixed(0)}% disk` } : { value: h.ok ? "up" : "offline" }),
        ...(diskPct != null ? { progress: Math.min(1, Math.max(0, diskPct / 100)) } : {}),
        state: hostState(h),
      };
    });

    return {
      title: "Host Fleet — System Metrics",
      subtitle: `${live.length}/${readings.length} hosts reporting${
        avgDiskPct != null ? ` • avg root disk ${avgDiskPct.toFixed(0)}%` : ""
      }`,
      state: worst === "offline" && live.length > 0 ? "warning" : worst,
      freshness: makeFreshness(this.name, `${targets.length} node_exporter targets`, start),
      metrics,
      items,
      summary:
        `${live.length} of ${readings.length} node_exporter targets answered.` +
        (dead.length ? ` Unreachable: ${dead.map((d) => `${d.label} (${d.error})`).join("; ")}.` : ""),
    };
  }
}

const adapter = new NodeExporterAdapter();
export { adapter as default };
