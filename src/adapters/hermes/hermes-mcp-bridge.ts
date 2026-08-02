// Hermes MCP bridge adapter — service reachability probe.
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

const HERMES_MCP_BRIDGE_URL = process.env.HERMES_MCP_BRIDGE_URL || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "hermes-mcp-bridge",
    source: HERMES_MCP_BRIDGE_URL || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class HermesMCPBridgeAdapter implements DataAdapter {
  readonly name = "hermes-mcp-bridge";
  readonly description = "Hermes MCP bridge — service reachability.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    if (HERMES_MCP_BRIDGE_URL) {
      try {
        await fetch(HERMES_MCP_BRIDGE_URL, { signal: AbortSignal.timeout(5000) });
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

    if (!HERMES_MCP_BRIDGE_URL) {
      return {
        title: "Hermes MCP bridge",
        subtitle: "Endpoint not configured",
        state: "empty",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set HERMES_MCP_BRIDGE_URL to probe this service.",
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(HERMES_MCP_BRIDGE_URL, { signal: AbortSignal.timeout(8000) });
      const latency = Date.now() - start;

      // Any HTTP response means the service is up and answering. A 404 at "/"
      // just means there is no route there, which is normal for an API — it is
      // not a fault, and reporting it as one filled the dashboard with warnings
      // for services that were fine. Only a 5xx indicates the service itself is
      // failing.
      const ok = res.status < 500;

      const metrics: Metric[] = [
        { label: "Status", value: ok ? "UP" : "ERROR", state: ok ? "healthy" : "warning" },
        { label: "HTTP", value: res.status, state: ok ? "healthy" : "warning" },
        { label: "Latency", value: latency, unit: "ms", state: latency > 2000 ? "warning" : "healthy" },
      ];

      return {
        title: "Hermes MCP bridge",
        subtitle: HERMES_MCP_BRIDGE_URL,
        state: ok ? "healthy" : "warning",
        freshness: makeFreshness(),
        metrics,
        summary: `Responded ${res.status} in ${latency}ms`,
      };
    } catch {
      return {
        title: "Hermes MCP bridge",
        subtitle: "Endpoint unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new HermesMCPBridgeAdapter();
export { adapter as default };
