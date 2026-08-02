// Grafana adapter — service health and version.
//
// Scope note: /api/health is the only Grafana endpoint that answers without a
// credential. /api/search, /api/datasources and /api/alertmanager all return
// 401 for an anonymous caller, so this panel deliberately reports two facts —
// is the process serving, and is its database reachable — rather than
// inventing dashboard or datasource counts it cannot see. If a service account
// token is added (GRAFANA_TOKEN), widen query() then.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, fetchJson, makeFreshness } from "@/lib/adapter-http";

const GRAFANA_URL = process.env.GRAFANA_URL || "";
const GRAFANA_TOKEN = process.env.GRAFANA_TOKEN || "";

interface GrafanaHealth {
  database?: string;
  version?: string;
  commit?: string;
}

class GrafanaAdapter implements DataAdapter {
  readonly name = "grafana";
  readonly description = "Grafana — service health, database state, version.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, GRAFANA_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!GRAFANA_URL) {
      return {
        title: "Grafana",
        subtitle: "Not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set GRAFANA_URL to connect this service.",
      };
    }

    const base = GRAFANA_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const health = await fetchJson<GrafanaHealth>(`${base}/api/health`);
      const dbOk = health.database === "ok";

      const metrics: Metric[] = [
        { label: "Service", value: "UP", state: "healthy" },
        { label: "Database", value: health.database ?? "unknown", state: dbOk ? "healthy" : "critical" },
        { label: "Version", value: health.version ?? "unknown" },
      ];

      // Dashboard count is only readable with a token. Attempt it when one is
      // configured; never fabricate the number when it is not.
      if (GRAFANA_TOKEN) {
        const dashboards = await fetchJson<Array<unknown>>(
          `${base}/api/search?type=dash-db&limit=500`,
          { headers: { Authorization: `Bearer ${GRAFANA_TOKEN}` } },
          ADAPTER_FANOUT_TIMEOUT_MS,
        ).catch(() => null);
        metrics.push({
          label: "Dashboards",
          value: dashboards ? dashboards.length : "unreadable",
          state: dashboards ? "healthy" : "denied",
        });
      }

      return {
        title: "Grafana — Dashboards",
        subtitle: `v${health.version ?? "?"} • database ${health.database ?? "?"}`,
        state: dbOk ? "healthy" : "critical",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        summary: `Grafana ${health.version ?? "?"} serving; database ${health.database ?? "unknown"}.${
          GRAFANA_TOKEN ? "" : " Dashboard inventory needs GRAFANA_TOKEN — the API is anonymous-denied."
        }`,
      };
    } catch (err) {
      return failureResult(this.name, "Grafana", base, err, start);
    }
  }
}

const adapter = new GrafanaAdapter();
export { adapter as default };
