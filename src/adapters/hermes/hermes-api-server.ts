// Hermes API Server adapter — OpenAI API: /v1/models, request rate, token throughput.
// Host: gh-ai (192.168.0.50 or Tailscale 100.92.162.32)
// API: OpenAI-compatible API endpoints

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { Item, Metric, Series } from "../types";

class HermesAPIServerAdapter implements DataAdapter {
  readonly name = "hermes-api-server";
  readonly description = "Hermes API Server — OpenAI-compatible API with rate and token metrics.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    const start = Date.now();
    try {
      // TODO: Real health check: GET http://gh-ai:4000/health
      const now = new Date().toISOString();
      return {
        adapter: this.name,
        source: "hermes-api",
        queriedAt: now,
        stalenessSeconds: Math.floor((Date.now() - start) / 1000),
        cacheHit: false,
      };
    } catch (err) {
      const now = new Date().toISOString();
      return {
        adapter: this.name,
        source: "hermes-api",
        queriedAt: now,
        stalenessSeconds: Math.floor((Date.now() - start) / 1000),
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
      // Mock data — replace with real API calls to Hermes
      const models = [
        { id: "gpt-4o-mini", name: "GPT-4o Mini", context: 128000 },
        { id: "gpt-4.1-turbo", name: "GPT-4.1 Turbo", context: 128000 },
        { id: "glm-4.5-air", name: "GLM-4.5 Air", context: 128000 },
        { id: "deepseek-v3", name: "DeepSeek V3", context: 64000 },
      ];

      const series: Series[] = [
        {
          name: "requests",
          unit: "req/s",
          points: [
            { x: "00:00", y: 12 },
            { x: "00:01", y: 15 },
            { x: "00:02", y: 18 },
            { x: "00:03", y: 14 },
            { x: "00:04", y: 16 },
            { x: "00:05", y: 19 },
            { x: "00:06", y: 17 },
          ],
        },
        {
          name: "tokens",
          unit: "tok/s",
          points: [
            { x: "00:00", y: 2400 },
            { x: "00:01", y: 3200 },
            { x: "00:02", y: 3800 },
            { x: "00:03", y: 2800 },
            { x: "00:04", y: 3400 },
            { x: "00:05", y: 4100 },
            { x: "00:06", y: 3600 },
          ],
        },
      ];

      const metrics: Metric[] = [
        { label: "Requests/sec", value: 17, state: "healthy", trend: 0.1 },
        { label: "Tokens/sec", value: 3300, state: "healthy", trend: 0.15 },
        { label: "Avg Latency", value: "850ms", unit: "ms", state: "healthy", trend: -0.05 },
        { label: "Uptime", value: "99.7%", unit: "%", state: "healthy" },
        { label: "Models", value: models.length, state: "healthy" },
      ];

      const items: Item[] = models.map((m) => ({
        id: m.id,
        label: m.name,
        subtitle: `${(m.context / 1000).toFixed(0)}K context`,
        value: "Active",
        state: "healthy",
      }));

      return {
        title: "Hermes API Server",
        subtitle: "OpenAI-compatible inference API",
        state: "healthy",
        freshness: {
          adapter: this.name,
          source: "hermes-api",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics,
        items,
        series,
      };
    } catch (error) {
      return {
        title: "Hermes API Server",
        subtitle: error instanceof Error ? error.message : "Unknown error",
        state: "critical",
        freshness: {
          adapter: this.name,
          source: "hermes-api",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }
}

const adapter = new HermesAPIServerAdapter();
export { adapter as default };