// Open WebUI — API surface view.
//
// `openwebui-api` and `openwebui-vector` are two views of the one Open WebUI
// container (gh-ai, published on :3001). This module covers the service/API
// side; the RAG side lives in openwebui-vector.ts.
//
// What answers anonymously (verified against 0.9.5):
//   GET /api/config   -> version, name, oauth providers, feature flags,
//                        `onboarding` (true = no account exists yet)
//   GET /api/version  -> version, deployment_id
//   GET /health/db    -> {"status": true}   database reachable
// Everything under /api/models and /api/v1/* is 401 "Not authenticated".
//
// So the panel is built from the three open endpoints, and the model
// inventory appears only when OPENWEBUI_TOKEN is set. Nothing is inferred:
// if the token is absent the Models metric says so rather than showing a
// number nobody measured.

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

const OPENWEBUI_URL = process.env.OPENWEBUI_URL || "";
const OPENWEBUI_TOKEN = process.env.OPENWEBUI_TOKEN || "";

interface OpenWebUiConfig {
  status?: boolean;
  name?: string;
  version?: string;
  onboarding?: boolean;
  oauth?: { providers?: Record<string, unknown> };
  features?: Record<string, boolean>;
}

interface OpenWebUiModels {
  data?: Array<{ id?: string; name?: string; owned_by?: string }>;
}

class OpenWebUiApiAdapter implements DataAdapter {
  readonly name = "openwebui-api";
  readonly description = "Open WebUI — service, version and model API.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, OPENWEBUI_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!OPENWEBUI_URL) {
      return notConfiguredResult(this.name, "Open WebUI — API", "OPENWEBUI_URL");
    }

    const base = OPENWEBUI_URL.replace(/\/$/, "");
    const start = Date.now();

    let config: OpenWebUiConfig;
    try {
      config = await fetchJson<OpenWebUiConfig>(`${base}/api/config`);
    } catch (err) {
      return failureResult(this.name, "Open WebUI — API", base, err, start);
    }

    // Enrichment: a failure here must not take the panel down, so each runs on
    // the shorter fan-out budget and degrades to "unknown" rather than throwing.
    const [dbBody, models] = await Promise.all([
      fetchJson<{ status?: boolean }>(`${base}/health/db`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
      OPENWEBUI_TOKEN
        ? fetchJson<OpenWebUiModels>(
            `${base}/api/models`,
            { headers: { Authorization: `Bearer ${OPENWEBUI_TOKEN}` } },
            ADAPTER_FANOUT_TIMEOUT_MS,
          ).catch((e: unknown) => (e instanceof AdapterHttpError ? e : null))
        : Promise.resolve(null),
    ]);

    const modelList = models && !(models instanceof AdapterHttpError) ? (models.data ?? []) : null;
    const modelDenied =
      models instanceof AdapterHttpError && (models.status === 401 || models.status === 403);

    const serving = config.status === true;
    const dbOk = dbBody?.status === true;
    const features = config.features ?? {};
    const onboarding = config.onboarding === true;
    const oauthProviders = Object.keys(config.oauth?.providers ?? {}).length;

    const metrics: Metric[] = [
      { label: "Service", value: serving ? "UP" : "DEGRADED", state: serving ? "healthy" : "warning" },
      { label: "Version", value: config.version ?? "unknown" },
      {
        label: "Database",
        value: dbBody ? (dbOk ? "OK" : "NOT OK") : "UNKNOWN",
        state: dbBody ? (dbOk ? "healthy" : "critical") : "empty",
      },
      {
        label: "Models",
        value: modelList ? modelList.length : modelDenied ? "TOKEN REJECTED" : "NEEDS TOKEN",
        state: modelList ? "healthy" : modelDenied ? "denied" : "empty",
      },
      {
        label: "Onboarding",
        value: onboarding ? "PENDING" : "COMPLETE",
        state: onboarding ? "warning" : "healthy",
      },
      { label: "OAuth Providers", value: oauthProviders },
    ];

    // Feature flags are real booleans off /api/config; render the enabled ones
    // so the panel says what this instance actually permits.
    const featureItems: Item[] = Object.entries(features).map(([k, v]) => ({
      id: `feature:${k}`,
      label: k.replace(/^enable_/, "").replace(/_/g, " "),
      subtitle: v ? "enabled" : "disabled",
      state: (v ? "healthy" : "empty") as "healthy" | "empty",
      group: "features",
    }));

    const modelItems: Item[] = (modelList ?? []).slice(0, 40).map((m, i) => ({
      id: `model:${m.id ?? i}`,
      label: m.name ?? m.id ?? `model ${i}`,
      subtitle: m.owned_by ?? "",
      state: "healthy" as const,
      group: "models",
    }));

    const state: VisualQueryResult["state"] = !serving
      ? "warning"
      : dbBody && !dbOk
        ? "critical"
        : modelDenied
          ? "denied"
          : "healthy";
    // `onboarding` is deliberately NOT a panel state. It means no account has
    // been created yet, which is a real and slightly alarming fact about this
    // instance (signup is open), but it is a configuration observation rather
    // than a service fault — it rides in the metric, the subtitle and the
    // summary where it stays visible without permanently degrading the world.

    const subtitleParts = [
      `${config.name ?? "Open WebUI"} ${config.version ?? ""}`.trim(),
      dbBody ? (dbOk ? "db ok" : "db failing") : "db unknown",
      modelList
        ? `${modelList.length} models`
        : modelDenied
          ? "model list rejected"
          : "model list needs OPENWEBUI_TOKEN",
    ];
    if (onboarding) subtitleParts.push("no account created yet");

    return {
      title: "Open WebUI — API",
      subtitle: subtitleParts.join(" • "),
      state,
      freshness: makeFreshness(this.name, base, start),
      metrics,
      items: [...modelItems, ...featureItems],
      summary: modelList
        ? `Open WebUI ${config.version ?? ""} serving ${modelList.length} models.`
        : `Open WebUI ${config.version ?? ""} is serving; /api/models requires OPENWEBUI_TOKEN${
            onboarding ? " and this instance has no account yet (onboarding pending)" : ""
          }.`,
    };
  }
}

const adapter = new OpenWebUiApiAdapter();
export { adapter as default };
