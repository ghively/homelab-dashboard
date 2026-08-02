// OmniRoute adapter — AI gateway on gh-arm.
//
// OmniRoute publishes two HTTP surfaces on separate ports:
//   :20128  MANAGEMENT — the Next.js dashboard + /api/* JSON routes. Every
//           /api/* route answers 401 {"code":"AUTH_001"} without a key. The
//           bare root answers 307 -> /dashboard and stamps the response with
//           `x-omniroute-route-class: MANAGEMENT`, unauthenticated.
//   :20129  API — OpenAI-compatible only. /v1/models answers 401
//           {"code":"AUTH_002"} without a key; anything else 404s with
//           "API port only serves OpenAI-compatible routes".
//
// So reachability is observable anonymously and the inventory is not. This
// adapter measures the first and asks for the second: with no key the panel
// renders `denied` and names OMNIROUTE_API_KEY (the "OmniRoute API Manage
// Key" in 1Password), which is the actionable fact. It never guesses at a
// provider or model count — the previous version of this module returned a
// hardcoded "7 providers / 42 models" that the dashboard rendered as live.

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import {
  AdapterHttpError,
  ADAPTER_FANOUT_TIMEOUT_MS,
  classifyError,
  failureResult,
  fetchJson,
  fetchWithTimeout,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const OMNIROUTE_URL = process.env.OMNIROUTE_URL || "";
const OMNIROUTE_API_URL = process.env.OMNIROUTE_API_URL || "";
const OMNIROUTE_API_KEY = process.env.OMNIROUTE_API_KEY || "";

interface OpenAiModelList {
  data?: Array<{ id?: string; owned_by?: string }>;
}

function authHeaders(): Record<string, string> {
  return OMNIROUTE_API_KEY ? { Authorization: `Bearer ${OMNIROUTE_API_KEY}` } : {};
}

class OmniRouteAdapter implements DataAdapter {
  readonly name = "omniroute";
  readonly description = "OmniRoute — multi-provider AI gateway on gh-arm.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, OMNIROUTE_URL || OMNIROUTE_API_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!OMNIROUTE_URL && !OMNIROUTE_API_URL) {
      return notConfiguredResult(this.name, "OmniRoute", "OMNIROUTE_URL");
    }

    const mgmt = OMNIROUTE_URL.replace(/\/$/, "");
    const api = (OMNIROUTE_API_URL || OMNIROUTE_URL).replace(/\/$/, "");
    const source = mgmt || api;
    const start = Date.now();

    // Reachability first, on the management port. redirect:"manual" keeps the
    // 307 -> /dashboard visible instead of following it into an HTML page, and
    // the route-class header is OmniRoute's own signature — proof the thing
    // answering is OmniRoute and not something else bound to the port.
    let mgmtStatus: number | null = null;
    let routeClass: string | null = null;
    if (mgmt) {
      try {
        const res = await fetchWithTimeout(`${mgmt}/`, { redirect: "manual" });
        mgmtStatus = res.status;
        routeClass = res.headers.get("x-omniroute-route-class");
      } catch (err) {
        return failureResult(this.name, "OmniRoute", source, err, start);
      }
    }

    // Model inventory. The OpenAI-compatible port has a known payload shape, so
    // it is the one surface whose parse can be trusted without a live key.
    let models: OpenAiModelList["data"] | null = null;
    let modelError: unknown = null;
    try {
      const body = await fetchJson<OpenAiModelList>(
        `${api}/v1/models`,
        { headers: authHeaders() },
        ADAPTER_FANOUT_TIMEOUT_MS,
      );
      models = body.data ?? [];
    } catch (err) {
      modelError = err;
    }

    // A management port that never answered and no model list is a dead
    // service, not a credential problem.
    if (mgmtStatus === null && models === null && modelError) {
      const c = classifyError(modelError);
      if (c.kind !== "unauthorized") {
        return failureResult(this.name, "OmniRoute", source, modelError, start);
      }
    }

    const unauthorized =
      modelError instanceof AdapterHttpError &&
      (modelError.status === 401 || modelError.status === 403);

    const providers = new Set((models ?? []).map((m) => m.owned_by).filter(Boolean));

    const metrics: Metric[] = [];
    if (mgmtStatus !== null) {
      metrics.push({
        label: "Management",
        value: `HTTP ${mgmtStatus}`,
        state: mgmtStatus < 500 ? "healthy" : "critical",
      });
    }
    if (routeClass) metrics.push({ label: "Route Class", value: routeClass });
    if (models) {
      metrics.push(
        { label: "Models", value: models.length, state: "healthy" },
        { label: "Providers", value: providers.size, state: "healthy" },
      );
    } else if (unauthorized) {
      metrics.push({ label: "Models", value: "NEEDS API KEY", state: "denied" });
    } else if (modelError) {
      const c = classifyError(modelError);
      metrics.push({ label: "Models", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state });
    }

    const items: Item[] = (models ?? []).slice(0, 60).map((m, i) => ({
      id: `model:${m.id ?? i}`,
      label: m.id ?? `model ${i}`,
      subtitle: m.owned_by ?? "",
      state: "healthy" as const,
      group: "models",
    }));

    if (models) {
      return {
        title: "OmniRoute — AI Gateway",
        subtitle: `${models.length} models • ${providers.size} providers`,
        state: "healthy",
        freshness: makeFreshness(this.name, source, start),
        metrics,
        items,
        summary: `OmniRoute serving ${models.length} models across ${providers.size} providers.`,
      };
    }

    if (unauthorized) {
      return {
        title: "OmniRoute — AI Gateway",
        subtitle: `Gateway reachable • model inventory rejected (HTTP ${(modelError as AdapterHttpError).status})`,
        state: "denied",
        freshness: makeFreshness(this.name, source, start),
        metrics,
        summary:
          "OmniRoute is up and answering, but /v1/models rejected the request. Set OMNIROUTE_API_KEY (the OmniRoute API Manage Key) to read the model and provider inventory.",
      };
    }

    // Management port answered but the API port did not — degraded, not down.
    const c = classifyError(modelError);
    return {
      title: "OmniRoute — AI Gateway",
      subtitle: `Management reachable • API port: ${c.message}`,
      state: "warning",
      freshness: makeFreshness(this.name, source, start),
      metrics,
      summary: `OmniRoute management port answered HTTP ${mgmtStatus}; ${api}/v1/models failed: ${c.message}`,
    };
  }
}

const adapter = new OmniRouteAdapter();
export { adapter as default };
