// Hermes API server adapter — service reachability probe.
//
// Hermes exposes no documented metrics API, so this adapter reports only what
// it can actually observe: whether the configured endpoint answers, the HTTP
// status it returns, and how long it took. Every value below is measured.
//
// The previous version returned a hardcoded inventory (session counts, tool
// invocation totals, error rates) that the dashboard rendered as live data.
// If a real metrics endpoint is added later, widen query() then — do not
// reintroduce placeholder numbers.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const HERMES_API_SERVER_URL = process.env.HERMES_API_SERVER_URL || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "hermes-api-server",
    source: HERMES_API_SERVER_URL || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class HermesAPIServerAdapter implements DataAdapter {
  readonly name = "hermes-api-server";
  readonly description = "Hermes API server — service reachability.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    if (HERMES_API_SERVER_URL) {
      try {
        await fetch(HERMES_API_SERVER_URL, { signal: AbortSignal.timeout(5000) });
      } catch {
        // Unreachable — freshness still records the endpoint queried.
      }
    }
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    if (!HERMES_API_SERVER_URL) {
      return {
        title: "Hermes API server",
        subtitle: "Endpoint not configured",
        state: "empty",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set HERMES_API_SERVER_URL to probe this service.",
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(HERMES_API_SERVER_URL, { signal: AbortSignal.timeout(8000) });
      const latency = Date.now() - start;
      const ok = res.ok;

      const metrics: Metric[] = [
        { label: "Status", value: ok ? "UP" : "ERROR", state: ok ? "healthy" : "warning" },
        { label: "HTTP", value: res.status, state: ok ? "healthy" : "warning" },
        { label: "Latency", value: latency, unit: "ms", state: latency > 2000 ? "warning" : "healthy" },
      ];

      return {
        title: "Hermes API server",
        subtitle: HERMES_API_SERVER_URL,
        state: ok ? "healthy" : "warning",
        freshness: makeFreshness(),
        metrics,
        summary: `Responded ${res.status} in ${latency}ms`,
      };
    } catch {
      return {
        title: "Hermes API server",
        subtitle: "Endpoint unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new HermesAPIServerAdapter();
export { adapter as default };
