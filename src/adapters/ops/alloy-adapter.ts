// Grafana Alloy adapter — component graph health and log-shipping throughput.
//
// Everything here comes from the Alloy HTTP server on the configured host:
//   GET /api/v0/web/components → every component in the graph with its health
//                                state + message (~2 KB on this deployment)
//   GET /-/ready               → readiness probe
//   GET /metrics               → alloy_build_info (version), config load status,
//                                process start time, loki_write_* throughput
//
// The component list carries the panel: an Alloy whose config loaded but whose
// loki.write component is unhealthy is still "ready", and the component health
// is the only place that shows up. /metrics and /-/ready run on the shorter
// fan-out budget.
//
// /metrics is ~75 KB here, which is affordable; the two heavy exporters on this
// fleet (cAdvisor at ~9.5 MB) are the reason that number is stated rather than
// assumed. Only whole-metric aggregates are read from it, never per-file series.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  fetchText,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";
import { findSample, formatBytes, parsePromText, sampleValue, sumSamples } from "./prom-text";

const ALLOY_URL = process.env.ALLOY_URL || "";

interface AlloyComponent {
  name?: string;
  localID?: string;
  label?: string;
  health?: { state?: string; message?: string; updatedTime?: string };
}

/** Alloy's health vocabulary → the dashboard's. `unknown` is not a failure. */
function componentState(health: string): "healthy" | "warning" | "critical" | "stale" {
  switch (health) {
    case "healthy":
      return "healthy";
    case "unhealthy":
      return "critical";
    case "exited":
      return "warning";
    default:
      return "stale";
  }
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

class AlloyAdapter implements DataAdapter {
  readonly name = "alloy";
  readonly description = "Grafana Alloy — collector component health and log shipping.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, ALLOY_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!ALLOY_URL) {
      return notConfiguredResult(this.name, "Grafana Alloy", "ALLOY_URL");
    }

    const base = ALLOY_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const components = await fetchJson<AlloyComponent[]>(`${base}/api/v0/web/components`);

      const [readyText, metricsText] = await Promise.all([
        fetchText(`${base}/-/ready`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
        fetchText(`${base}/metrics`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
      ]);

      const samples = metricsText ? parsePromText(metricsText) : [];
      const buildInfo = findSample(samples, "alloy_build_info");
      const version = buildInfo?.labels.version ?? "unknown";
      const configLoaded = sampleValue(samples, "alloy_config_last_load_successful");
      const processStart = sampleValue(samples, "alloy_resources_process_start_time_seconds");
      const sentBytes = sumSamples(samples, "loki_write_sent_bytes_total");
      const sentEntries = sumSamples(samples, "loki_write_sent_entries_total");
      const droppedEntries = sumSamples(samples, "loki_write_dropped_entries_total");
      const tailedBytes = sumSamples(samples, "loki_source_file_file_bytes_total");
      const tailedFiles = samples.filter((s) => s.name === "loki_source_file_file_bytes_total").length;

      const healthy = components.filter((c) => c.health?.state === "healthy");
      const unhealthy = components.filter((c) => c.health?.state === "unhealthy");
      const exited = components.filter((c) => c.health?.state === "exited");
      const ready = readyText !== null && /ready/i.test(readyText);

      const metrics: Metric[] = [
        {
          label: "Components",
          value: `${healthy.length}/${components.length}`,
          state: unhealthy.length ? "critical" : exited.length ? "warning" : "healthy",
        },
        {
          label: "Unhealthy",
          value: unhealthy.length,
          state: unhealthy.length ? "critical" : "healthy",
        },
        ...(readyText !== null
          ? [{ label: "Ready", value: ready ? "YES" : "NO", state: (ready ? "healthy" : "critical") as "healthy" | "critical" }]
          : []),
        ...(configLoaded !== undefined
          ? [
              {
                label: "Config Load",
                value: configLoaded === 1 ? "OK" : "FAILED",
                state: (configLoaded === 1 ? "healthy" : "critical") as "healthy" | "critical",
              },
            ]
          : []),
        ...(tailedFiles > 0
          ? [{ label: "Files Tailed", value: tailedFiles }, { label: "Tailed Bytes", value: formatBytes(tailedBytes) }]
          : []),
        ...(sentEntries > 0
          ? [
              { label: "Log Lines Sent", value: Math.round(sentEntries) },
              { label: "Log Bytes Sent", value: formatBytes(sentBytes) },
            ]
          : []),
        ...(samples.some((s) => s.name === "loki_write_dropped_entries_total")
          ? [
              {
                label: "Dropped Lines",
                value: Math.round(droppedEntries),
                state: (droppedEntries > 0 ? "warning" : "healthy") as "warning" | "healthy",
              },
            ]
          : []),
        ...(processStart !== undefined
          ? [{ label: "Uptime", value: formatUptime(Date.now() / 1000 - processStart) }]
          : []),
        { label: "Version", value: version },
      ];

      const items: Item[] = components.map((c, i) => ({
        id: `component:${c.localID ?? i}`,
        label: c.localID ?? c.name ?? `component-${i}`,
        subtitle: c.health?.message ?? c.name ?? "",
        value: c.health?.state ?? "unknown",
        state: componentState(c.health?.state ?? "unknown"),
        group: "components",
        ...(c.health?.updatedTime ? { meta: { updatedTime: c.health.updatedTime } } : {}),
      }));

      const state: VisualQueryResult["state"] =
        unhealthy.length > 0 || configLoaded === 0
          ? "critical"
          : exited.length > 0 || (readyText !== null && !ready) || droppedEntries > 0
            ? "warning"
            : "healthy";

      return {
        title: "Grafana Alloy — Collector",
        subtitle: `${healthy.length}/${components.length} components healthy • v${version.replace(/^v/, "")}`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `Alloy ${version}: ${healthy.length} of ${components.length} components healthy${
          unhealthy.length ? `, ${unhealthy.length} unhealthy` : ""
        }${tailedFiles ? `, tailing ${tailedFiles} file(s)` : ""}${
          sentEntries > 0 ? `, ${Math.round(sentEntries).toLocaleString()} log lines shipped` : ""
        }.`,
      };
    } catch (err) {
      return failureResult(this.name, "Grafana Alloy", base, err, start);
    }
  }
}

const adapter = new AlloyAdapter();
export { adapter as default };
