// LiteLLM adapter — models, routing, spend, cache.
// Host: gh-arm (192.168.0.156 or Tailscale 100.65.126.126)
// API: /health, /models, spend/usage, cache performance

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { Item, Metric, VisualQueryResult } from "../types";

interface LiteLLMModel {
  model_name: string;
  provider: string;
  rpm_limit: number;
  tpm_limit: number;
}

interface LiteLLMSpend {
  total_spend: number;
  total_tokens: number;
  cost_per_token: number;
  top_models: Array<{ model: string; spend: number }>;
}

class LiteLLMAdapter implements DataAdapter {
  readonly name = "litellm";
  readonly description = "Model routing proxy with spend tracking.";
  readonly category = "ai" as const;

  async health() {
    const start = Date.now();
    try {
      // TODO: Real health check: GET http://gh-arm:8000/health
      return {
        adapter: this.name,
        source: "litellm-mock",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    } catch (err) {
      return {
        adapter: this.name,
        source: "litellm-mock",
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
      // TODO: Fetch from LiteLLM API:
      // - GET http://gh-arm:8000/models (model list)
      // - GET http://gh-arm:8000/spend (spend data)
      // - Cache metrics from prometheus if exposed

      // Mock data for now.
      const models: LiteLLMModel[] = [
        { model_name: "gpt-5.2", provider: "zai", rpm_limit: 10000, tpm_limit: 2000000 },
        { model_name: "claude-3.7", provider: "anthropic", rpm_limit: 5000, tpm_limit: 1000000 },
        { model_name: "llama-3.3-70b", provider: "ollama", rpm_limit: 2000, tpm_limit: 500000 },
        { model_name: "qwen-2.5", provider: "zai", rpm_limit: 15000, tpm_limit: 3000000 },
      ];

      const spend: LiteLLMSpend = {
        total_spend: 12.45,
        total_tokens: 8500000,
        cost_per_token: 0.00000146,
        top_models: [
          { model: "gpt-5.2", spend: 8.32 },
          { model: "claude-3.7", spend: 3.13 },
          { model: "llama-3.3-70b", spend: 0.0 },
          { model: "qwen-2.5", spend: 1.0 },
        ],
      };

      const items: Item[] = models.map((m) => ({
        id: m.model_name,
        label: m.model_name,
        subtitle: `${m.provider} · ${m.rpm_limit} RPM / ${m.tpm_limit.toLocaleString()} TPM`,
        meta: { provider: m.provider, rpm_limit: m.rpm_limit, tpm_limit: m.tpm_limit },
      }));

      const metrics: Metric[] = [
        { label: "Registered Models", value: models.length, state: "healthy" },
        { label: "Total Spend (7d)", value: `$${spend.total_spend.toFixed(2)}`, unit: "$", state: "healthy" },
        { label: "Total Tokens (7d)", value: (spend.total_tokens / 1_000_000).toFixed(2), unit: "M tokens", state: "healthy" },
        { label: "Avg Cost/M", value: `$${(spend.cost_per_token * 1_000_000).toFixed(4)}`, unit: "$/M", state: "healthy" },
      ];

      return {
        title: "LiteLLM — Model Routing & Spend",
        subtitle: "Unified proxy with cost tracking",
        state: "healthy",
        freshness: {
          adapter: this.name,
          source: "litellm-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics,
        items,
      };
    } catch (err) {
      return {
        title: "LiteLLM — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical",
        freshness: {
          adapter: this.name,
          source: "litellm-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }
}

const adapter = new LiteLLMAdapter();
export { adapter as default };