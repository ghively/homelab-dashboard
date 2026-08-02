// Loki adapter — readiness, build info, and ingester throughput.
//
// Loki publishes no summary JSON API, so the numbers come from /metrics
// (Prometheus exposition format) and the version from the buildinfo endpoint.
// /ready is the state driver: Loki answers 503 with a reason string while it
// is replaying the WAL, and that is exactly the window where a green badge
// would be a lie.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  ADAPTER_TIMEOUT_MS,
  failureResult,
  fetchJson,
  fetchText,
  makeFreshness,
} from "@/lib/adapter-http";
import { formatBytes, parsePromText, sampleValue, sumSamples } from "./prom-text";

const LOKI_URL = process.env.LOKI_URL || "";

class LokiAdapter implements DataAdapter {
  readonly name = "loki";
  readonly description = "Loki — log ingestion readiness and throughput.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, LOKI_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!LOKI_URL) {
      return {
        title: "Loki",
        subtitle: "Not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set LOKI_URL to connect this service.",
      };
    }

    const base = LOKI_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const readyRes = await fetch(`${base}/ready`, {
        signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        cache: "no-store",
      });
      const readyText = (await readyRes.text()).trim();
      const ready = readyRes.ok && /ready/i.test(readyText);

      const [build, metricsText] = await Promise.all([
        fetchJson<{ version?: string }>(
          `${base}/loki/api/v1/status/buildinfo`,
          {},
          ADAPTER_FANOUT_TIMEOUT_MS,
        ).catch(() => null),
        fetchText(`${base}/metrics`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => ""),
      ]);

      const samples = metricsText ? parsePromText(metricsText) : [];
      const chunks = sampleValue(samples, "loki_ingester_memory_chunks");
      const streams = sampleValue(samples, "loki_ingester_memory_streams");
      const bytesReceived = sumSamples(samples, "loki_distributor_bytes_received_total");
      const linesReceived = sumSamples(samples, "loki_distributor_lines_received_total");

      const metrics: Metric[] = [
        { label: "Ready", value: ready ? "YES" : readyText.slice(0, 40) || "NO", state: ready ? "healthy" : "critical" },
        { label: "Version", value: build?.version ?? "unknown" },
        ...(chunks != null ? [{ label: "Memory Chunks", value: Math.round(chunks) }] : []),
        ...(streams != null ? [{ label: "Memory Streams", value: Math.round(streams) }] : []),
        ...(bytesReceived > 0 ? [{ label: "Ingested", value: formatBytes(bytesReceived) }] : []),
        ...(linesReceived > 0 ? [{ label: "Lines Ingested", value: Math.round(linesReceived) }] : []),
      ];

      return {
        title: "Loki — Log Aggregation",
        subtitle: `v${build?.version ?? "?"} • ${ready ? "ready" : "not ready"}${
          bytesReceived > 0 ? ` • ${formatBytes(bytesReceived)} ingested` : ""
        }`,
        state: ready ? "healthy" : "critical",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        summary: ready
          ? `Loki ${build?.version ?? "?"} ready; ${formatBytes(bytesReceived)} and ${Math.round(linesReceived).toLocaleString()} lines ingested since start.`
          : `Loki is not ready: ${readyText.slice(0, 120)}`,
      };
    } catch (err) {
      return failureResult(this.name, "Loki", base, err, start);
    }
  }
}

const adapter = new LokiAdapter();
export { adapter as default };
