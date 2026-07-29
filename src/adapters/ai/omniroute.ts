// OmniRoute adapter — providers, routes, circuit breakers, costs.
// Host: gh-arm (192.168.0.156 or Tailscale 100.65.126.126)
// API: Dashboard API (exact endpoint TBD from docs)

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { Item, Metric, VisualQueryResult } from "../types";

// Mock OmniRoute data structure.
interface OmniRouteModel {
  id: string;
  name: string;
  provider: string;
  route: string;
  state: "healthy" | "degraded" | "offline";
  latencyMs: number;
  costPerToken: number;
  tokensPerMin: number;
}

class OmniRouteAdapter implements DataAdapter {
  readonly name = "omniroute";
  readonly description = "Model routing and circuit breaker provider.";
  readonly category = "ai" as const;

  async health() {
    const start = Date.now();
    try {
      // TODO: Real health check via OmniRoute Dashboard API.
      return {
        adapter: this.name,
        source: "omniroute-mock",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    } catch (err) {
      return {
        adapter: this.name,
        source: "omniroute-mock",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      // TODO: Fetch from OmniRoute Dashboard API.
      // Mock data for now.
      const models: OmniRouteModel[] = [
        { id: "gpt-5.2", name: "GPT-5.2", provider: "zai", route: "zai-glm-5.2", state: "healthy", latencyMs: 120, costPerToken: 0.000002, tokensPerMin: 50000 },
        { id: "claude-3.7", name: "Claude 3.7", provider: "anthropic", route: "anthropic-claude-3.7", state: "healthy", latencyMs: 180, costPerToken: 0.000003, tokensPerMin: 40000 },
        { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "ollama", route: "ollama-llama-3.3-70b", state: "degraded", latencyMs: 450, costPerToken: 0, tokensPerMin: 8000 },
        { id: "qwen-2.5", name: "Qwen 2.5", provider: "zai", route: "zai-qwen-2.5", state: "healthy", latencyMs: 95, costPerToken: 0.000001, tokensPerMin: 60000 },
      ];

      const items: Item[] = models.map((m) => ({
        id: m.id,
        label: m.name,
        subtitle: `${m.provider} via ${m.route}`,
        state: m.state === "healthy" ? "healthy" : m.state === "degraded" ? "warning" : "critical",
        meta: { provider: m.provider, route: m.route, latencyMs: m.latencyMs, costPerToken: m.costPerToken, tokensPerMin: m.tokensPerMin },
      }));

      const metrics: Metric[] = [
        { label: "Total Routes", value: models.length, state: "healthy" },
        { label: "Healthy Routes", value: models.filter((m) => m.state === "healthy").length, state: "healthy" },
        { label: "Degraded Routes", value: models.filter((m) => m.state === "degraded").length, state: "warning" },
        { label: "Avg Latency", value: Math.round(models.reduce((a, b) => a + b.latencyMs, 0) / models.length), unit: "ms", state: models.some((m) => m.latencyMs > 300) ? "warning" : "healthy" },
      ];

      return {
        title: "OmniRoute — Model Routing",
        subtitle: "Circuit breakers, provider routes, and token costs",
        state: "healthy",
        freshness: {
          adapter: this.name,
          source: "omniroute-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics,
        items,
      };
    } catch (err) {
      return {
        title: "OmniRoute — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        freshness: {
          adapter: this.name,
          source: "omniroute-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }
}

const adapter = new OmniRouteAdapter();
export { adapter as default };