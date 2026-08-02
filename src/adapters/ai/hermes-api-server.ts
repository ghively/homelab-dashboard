// Hermes API server — the OpenAI-compatible surface Hermes Agent exposes.
//
// Replaces the reachability-only probe in src/adapters/hermes/hermes-api-server.ts
// with the actual served inventory. Verified against hermes-agent 0.19.1 on
// gh-ai:
//
//   GET /health     open  -> {"status":"ok","platform":"hermes-agent","version":"0.19.1"}
//   GET /v1/models  needs Authorization: Bearer <API_SERVER_KEY>
//                   -> {"object":"list","data":[{"id":"Matthew","owned_by":"hermes",...}]}
//                   without it: 401 {"code":"gateway_auth_failed"}
//
// /health carries the version and platform, so the panel is real even with no
// key; the key only adds the model list. There are no session or
// tool-invocation counters on this surface — do not add them back.

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import {
  AdapterHttpError,
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const BASE_URL = process.env.HERMES_API_SERVER_URL || "";
const API_KEY = process.env.HERMES_API_SERVER_KEY || "";

interface HermesHealth {
  status?: string;
  platform?: string;
  version?: string;
}

interface HermesModels {
  data?: Array<{ id?: string; owned_by?: string; created?: number }>;
}

class HermesApiServerLiveAdapter implements DataAdapter {
  readonly name = "hermes-api-server";
  readonly description = "Hermes API server — health, version and served models.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, BASE_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!BASE_URL) {
      return notConfiguredResult(this.name, "Hermes API server", "HERMES_API_SERVER_URL");
    }

    const base = BASE_URL.replace(/\/$/, "");
    const start = Date.now();

    let health: HermesHealth;
    try {
      health = await fetchJson<HermesHealth>(`${base}/health`);
    } catch (err) {
      return failureResult(this.name, "Hermes API server", base, err, start);
    }

    const models = await fetchJson<HermesModels>(
      `${base}/v1/models`,
      API_KEY ? { headers: { Authorization: `Bearer ${API_KEY}` } } : {},
      ADAPTER_FANOUT_TIMEOUT_MS,
    ).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));

    const modelList = models instanceof Error ? null : (models.data ?? []);
    const modelDenied =
      models instanceof AdapterHttpError && (models.status === 401 || models.status === 403);

    const ok = (health.status ?? "").toLowerCase() === "ok";

    const metrics: Metric[] = [
      { label: "Status", value: (health.status ?? "unknown").toUpperCase(), state: ok ? "healthy" : "warning" },
      { label: "Platform", value: health.platform ?? "unknown" },
      { label: "Version", value: health.version ?? "unknown" },
      {
        label: "Models",
        value: modelList ? modelList.length : modelDenied ? "NEEDS KEY" : "UNREADABLE",
        state: modelList ? "healthy" : modelDenied ? "denied" : "warning",
      },
    ];

    const items: Item[] = (modelList ?? []).map((m, i) => ({
      id: `model:${m.id ?? i}`,
      label: m.id ?? `model ${i}`,
      subtitle: m.owned_by ?? "",
      state: "healthy" as const,
      group: "models",
    }));

    const state: VisualQueryResult["state"] = !ok ? "warning" : modelDenied ? "denied" : "healthy";

    return {
      title: "Hermes API server",
      subtitle: [
        `${health.platform ?? "hermes"} ${health.version ?? ""}`.trim(),
        modelList
          ? `${modelList.length} model${modelList.length === 1 ? "" : "s"} served`
          : modelDenied
            ? "model list needs HERMES_API_SERVER_KEY"
            : "model list unreadable",
      ].join(" • "),
      state,
      freshness: makeFreshness(this.name, base, start),
      metrics,
      items,
      summary: modelList
        ? `Hermes API server ${health.version ?? ""} healthy, serving ${modelList.length} model(s): ${modelList
            .map((m) => m.id)
            .filter(Boolean)
            .join(", ")}.`
        : `Hermes API server ${health.version ?? ""} answered /health; /v1/models requires HERMES_API_SERVER_KEY.`,
    };
  }
}

const adapter = new HermesApiServerLiveAdapter();
export { adapter as default };
