// Hermes MCP Bridge adapter — connected clients, tool invocations, latency.
// Host: gh-ai (192.168.0.50 or Tailscale 100.92.162.32)
// API: MCP protocol via stdio

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const HERMES_MCP_BRIDGE_URL =
  process.env.HERMES_MCP_BRIDGE_URL || "http://gh-ai:3000";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "hermes-mcp-bridge",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class HermesMCPBridgeAdapter implements DataAdapter {
  readonly name = "hermes-mcp-bridge";
  readonly description = "Hermes MCP Bridge — Model Context Protocol client connections.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${HERMES_MCP_BRIDGE_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(HERMES_MCP_BRIDGE_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      // TODO: Fetch from Hermes MCP Bridge:
      // - Connected MCP servers
      // - Tool counts per server
      // - Invocation counts and latency
      // - Connection health

      const metrics: Metric[] = [
        { label: "Connected Servers", value: 13, state: "healthy" },
        { label: "Total Tools", value: 342, state: "healthy" },
        { label: "Invocations (24h)", value: 5820, state: "healthy" },
        { label: "Avg Tool Latency", value: 85, unit: "ms", state: "healthy" },
      ];

      const items: Item[] = [
        { id: "agent-vault", label: "agent-vault", subtitle: "Entity queries, doc search", value: 47, state: "healthy", meta: { tools: 12, invocations: 847, avg_latency_ms: 45 } },
        { id: "pihole", label: "pihole", subtitle: "DNS sinkhole control", value: 23, state: "healthy", meta: { tools: 8, invocations: 312, avg_latency_ms: 120 } },
        { id: "synology", label: "synology", subtitle: "NAS management", value: 18, state: "healthy", meta: { tools: 15, invocations: 245, avg_latency_ms: 95 } },
        { id: "home-assistant", label: "home-assistant", subtitle: "Home automation", value: 31, state: "healthy", meta: { tools: 22, invocations: 634, avg_latency_ms: 65 } },
        { id: "gitlab", label: "gitlab", subtitle: "GitLab CE management", value: 12, state: "healthy", meta: { tools: 10, invocations: 189, avg_latency_ms: 150 } },
      ];

      return {
        title: "Hermes MCP Bridge — Connected Clients",
        subtitle: "MCP servers and tool invocation metrics",
        state: "healthy",
        freshness: makeFreshness(HERMES_MCP_BRIDGE_URL),
        metrics,
        items,
      };
    } catch (err) {
      return {
        title: "Hermes MCP Bridge — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        freshness: makeFreshness(HERMES_MCP_BRIDGE_URL),
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }
}

const adapter = new HermesMCPBridgeAdapter();
export { adapter as default };