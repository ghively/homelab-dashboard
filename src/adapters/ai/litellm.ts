// LiteLLM adapter — model registry and endpoint health.
// Host: gh-arm (192.168.0.156 or Tailscale 100.65.126.126)
// API: GET /v1/models (OpenAI-compatible), GET /health (per-endpoint status)

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";

const LITELLM_URL = process.env.LITELLM_URL || "http://gh-arm:4000";
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || "";

interface LiteLLMModelEntry {
  id: string;
  owned_by?: string;
}

interface LiteLLMHealthEntry {
  model?: string;
  error?: string;
}

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "litellm",
    source: LITELLM_URL,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

function authHeaders(): Record<string, string> {
  return LITELLM_API_KEY ? { Authorization: `Bearer ${LITELLM_API_KEY}` } : {};
}

class LiteLLMAdapter implements DataAdapter {
  readonly name = "litellm";
  readonly description = "Model routing proxy across providers.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${LITELLM_URL}/v1/models`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Unreachable — freshness still records the endpoint queried.
    }
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const modelsRes = await fetch(`${LITELLM_URL}/v1/models`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!modelsRes.ok) throw new Error(`HTTP ${modelsRes.status}`);

      const parsed = (await modelsRes.json()) as { data?: LiteLLMModelEntry[] };
      const models = parsed.data ?? [];

      // /health needs an admin key and is absent on some deployments. A non-OK
      // response means "health unknown", not a failed query — the model list is
      // still real data.
      let healthy: LiteLLMHealthEntry[] = [];
      let unhealthy: LiteLLMHealthEntry[] = [];
      let healthKnown = false;
      try {
        // /health makes LiteLLM probe every configured upstream, so it can take
        // many seconds — it was 8.2s here and dominated the whole fleet rollup.
        // The model list is the primary data; endpoint health is a bonus, and a
        // timeout is already treated as "health unknown" rather than an error.
        const healthRes = await fetch(`${LITELLM_URL}/health`, {
          headers: authHeaders(),
          signal: AbortSignal.timeout(2500),
        });
        if (healthRes.ok) {
          const h = (await healthRes.json()) as {
            healthy_endpoints?: LiteLLMHealthEntry[];
            unhealthy_endpoints?: LiteLLMHealthEntry[];
          };
          healthy = h.healthy_endpoints ?? [];
          unhealthy = h.unhealthy_endpoints ?? [];
          healthKnown = true;
        }
      } catch {
        // Health endpoint unavailable.
      }

      const providers = new Set(models.map((m) => m.owned_by).filter(Boolean));

      const metrics: Metric[] = [
        { label: "Models", value: models.length, state: "healthy" },
        { label: "Providers", value: providers.size, state: "healthy" },
      ];
      if (healthKnown) {
        metrics.push(
          { label: "Healthy Endpoints", value: healthy.length, state: "healthy" },
          {
            label: "Unhealthy",
            value: unhealthy.length,
            state: unhealthy.length > 0 ? "warning" : "healthy",
          },
        );
      }

      const items: Item[] = [
        ...unhealthy.map((e, i) => ({
          id: `unhealthy-${i}`,
          label: e.model ?? "unknown",
          subtitle: e.error ? String(e.error).slice(0, 120) : "unhealthy",
          state: "warning" as const,
          group: "unhealthy",
        })),
        ...models.map((m) => ({
          id: m.id,
          label: m.id,
          subtitle: m.owned_by ?? "",
          state: "healthy" as const,
          group: "models",
        })),
      ];

      return {
        title: "LiteLLM — Model Proxy",
        subtitle: healthKnown
          ? `${models.length} models • ${unhealthy.length} unhealthy`
          : `${models.length} models`,
        state: unhealthy.length > 0 ? "warning" : "healthy",
        freshness: makeFreshness(),
        metrics,
        items,
        summary: `${models.length} models across ${providers.size} providers`,
      };
    } catch {
      return {
        title: "LiteLLM — Model Proxy",
        subtitle: "Proxy unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new LiteLLMAdapter();
export { adapter as default };
