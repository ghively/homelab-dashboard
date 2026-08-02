// Open WebUI adapter — service health and (with a token) model inventory.
//
// /health answers anonymously with {"status":true}. /api/models needs a bearer
// token, so the model count only appears when OPENWEBUI_TOKEN is set; without
// it the panel says the inventory is unreadable rather than guessing at it.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, fetchJson, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const OPENWEBUI_URL = process.env.OPENWEBUI_URL || "";
const OPENWEBUI_TOKEN = process.env.OPENWEBUI_TOKEN || "";

interface ModelList {
  data?: Array<{ id?: string; name?: string; owned_by?: string }>;
}

class OpenWebUIAdapter implements DataAdapter {
  readonly name = "openwebui";
  readonly description = "Open WebUI — service health and model inventory.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, OPENWEBUI_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!OPENWEBUI_URL) {
      return notConfiguredResult(this.name, "Open WebUI", "OPENWEBUI_URL");
    }

    const base = OPENWEBUI_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const health = await fetchJson<{ status?: boolean }>(`${base}/health`);
      const up = health.status === true;

      let models: ModelList["data"] | null = null;
      if (OPENWEBUI_TOKEN) {
        const body = await fetchJson<ModelList>(
          `${base}/api/models`,
          { headers: { Authorization: `Bearer ${OPENWEBUI_TOKEN}` } },
          ADAPTER_FANOUT_TIMEOUT_MS,
        ).catch(() => null);
        models = body?.data ?? null;
      }

      const metrics: Metric[] = [
        { label: "Service", value: up ? "UP" : "DEGRADED", state: up ? "healthy" : "warning" },
        {
          label: "Models",
          value: models ? models.length : "needs token",
          state: models ? "healthy" : "empty",
        },
      ];

      const items: Item[] = (models ?? []).slice(0, 40).map((m, i) => ({
        id: `model:${m.id ?? i}`,
        label: m.name ?? m.id ?? `model ${i}`,
        subtitle: m.owned_by ?? "",
        state: "healthy" as const,
      }));

      return {
        title: "Open WebUI",
        subtitle: up
          ? models
            ? `${models.length} models available`
            : "Serving • model inventory needs OPENWEBUI_TOKEN"
          : "Health endpoint reported not-ok",
        state: up ? "healthy" : "warning",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: up
          ? `Open WebUI serving${models ? ` with ${models.length} models` : "; model list requires OPENWEBUI_TOKEN"}.`
          : "Open WebUI answered /health with status:false.",
      };
    } catch (err) {
      return failureResult(this.name, "Open WebUI", base, err, start);
    }
  }
}

const adapter = new OpenWebUIAdapter();
export { adapter as default };
