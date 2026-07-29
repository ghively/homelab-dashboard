// Hermes Gateway adapter — sessions, model routes, tool invocations.
// Host: gh-ai (192.168.0.50 or Tailscale 100.92.162.32)
// API: HTTP/OTel: sessions, model routes, tool invocations, error rate

import type { DataAdapter } from "../adapter-base";
import type { Event, FreshnessInfo, Item, Metric, Series, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const HERMES_GATEWAY_URL =
  process.env.HERMES_GATEWAY_URL || "http://gh-ai:3000";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "hermes-gateway",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class HermesGatewayAdapter implements DataAdapter {
  readonly name = "hermes-gateway";
  readonly description = "Hermes Gateway — session routing and tool invocation metrics.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${HERMES_GATEWAY_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(HERMES_GATEWAY_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      // TODO: Fetch from Hermes Gateway API + OTel metrics:
      // - Session count, active sessions
      // - Model routes (zai-glm-5.2, anthropic-claude-3.7)
      // - Tool invocation counts by tool
      // - Error rate, latency percentiles

      const metrics: Metric[] = [
        { label: "Active Sessions", value: 7, state: "healthy" },
        { label: "Total Sessions (24h)", value: 142, state: "healthy" },
        { label: "Tool Invocations (24h)", value: 2847, state: "healthy" },
        { label: "Error Rate", value: 0.8, unit: "%", state: "healthy" },
        { label: "P95 Latency", value: 1200, unit: "ms", state: "healthy" },
      ];

      const items: Item[] = [
        { id: "glm-5.2", label: "zai-glm-5.2", subtitle: "glm-4.5-air primary", value: 52, state: "healthy", meta: { provider: "zai", model: "glm-4.5-air" } },
        { id: "claude-3.7", label: "anthropic-claude-3.7", subtitle: "Claude 3.7 Sonnet", value: 35, state: "healthy", meta: { provider: "anthropic", model: "claude-3.7-sonnet" } },
        { id: "llama-3.3", label: "ollama-llama-3.3-70b", subtitle: "Local fallback", value: 13, state: "warning", meta: { provider: "ollama", model: "llama-3.3-70b" } },
      ];

      const events: Event[] = [
        { id: "evt-1", at: new Date(Date.now() - 60_000).toISOString(), title: "High latency alert", detail: "P95 latency >2s on zai route", state: "warning", durationMs: 30_000 },
        { id: "evt-2", at: new Date(Date.now() - 300_000).toISOString(), title: "Circuit breaker triggered", detail: "anthropic rate limit", state: "warning", durationMs: 15_000 },
      ];

      const series: Series[] = [
        {
          name: "Request Rate (req/s)",
          unit: "req/s",
          points: [
            { x: now, y: 12 },
            { x: new Date(Date.now() - 300_000).toISOString(), y: 10 },
            { x: new Date(Date.now() - 600_000).toISOString(), y: 14 },
            { x: new Date(Date.now() - 900_000).toISOString(), y: 11 },
            { x: new Date(Date.now() - 1_200_000).toISOString(), y: 9 },
          ],
        },
      ];

      return {
        title: "Hermes Gateway — Session Routing",
        subtitle: "Model distribution and tool invocation metrics",
        state: "healthy",
        freshness: makeFreshness(HERMES_GATEWAY_URL),
        metrics,
        items,
        events,
        series,
      };
    } catch (err) {
      return {
        title: "Hermes Gateway — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        freshness: makeFreshness(HERMES_GATEWAY_URL),
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }
}

const adapter = new HermesGatewayAdapter();
export { adapter as default };