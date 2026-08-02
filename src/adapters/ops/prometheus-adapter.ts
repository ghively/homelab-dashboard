// Prometheus adapter — scrape target health, firing alerts, TSDB size.
//
// Everything here comes from the Prometheus HTTP API on the configured server:
//   GET /api/v1/targets?state=active   → per-target health + lastError
//   GET /api/v1/alerts                 → currently firing/pending alerts
//   GET /api/v1/status/buildinfo       → version
//   GET /api/v1/query                  → prometheus_tsdb_head_series
//
// Target health is the state driver: a down scrape target is the single most
// actionable signal this service publishes, and it is why this panel exists.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, fetchJson, makeFreshness } from "@/lib/adapter-http";

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || "";

interface PromTarget {
  labels?: Record<string, string>;
  health?: string;
  lastError?: string;
  lastScrape?: string;
  scrapeUrl?: string;
}

interface PromAlert {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  state?: string;
  activeAt?: string;
}

function targetName(t: PromTarget): string {
  const l = t.labels ?? {};
  return l.instance ?? l.job ?? t.scrapeUrl ?? "target";
}

class PrometheusAdapter implements DataAdapter {
  readonly name = "prometheus";
  readonly description = "Prometheus — scrape targets, firing alerts, TSDB series.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, PROMETHEUS_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!PROMETHEUS_URL) {
      return {
        title: "Prometheus",
        subtitle: "Not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set PROMETHEUS_URL to connect this service.",
      };
    }

    const base = PROMETHEUS_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      // /api/v1/targets carries the panel. The other three are enrichment and
      // run on a shorter budget so a slow one cannot take the panel down.
      const targetsBody = await fetchJson<{ data?: { activeTargets?: PromTarget[] } }>(
        `${base}/api/v1/targets?state=active`,
      );
      const targets = targetsBody.data?.activeTargets ?? [];

      const [alertsBody, buildBody, seriesBody] = await Promise.all([
        fetchJson<{ data?: { alerts?: PromAlert[] } }>(`${base}/api/v1/alerts`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(
          () => null,
        ),
        fetchJson<{ data?: { version?: string } }>(
          `${base}/api/v1/status/buildinfo`,
          {},
          ADAPTER_FANOUT_TIMEOUT_MS,
        ).catch(() => null),
        fetchJson<{ data?: { result?: Array<{ value?: [number, string] }> } }>(
          `${base}/api/v1/query?query=prometheus_tsdb_head_series`,
          {},
          ADAPTER_FANOUT_TIMEOUT_MS,
        ).catch(() => null),
      ]);

      const up = targets.filter((t) => t.health === "up");
      const down = targets.filter((t) => t.health !== "up");
      const alerts = alertsBody?.data?.alerts ?? [];
      const firing = alerts.filter((a) => a.state === "firing");
      const critical = firing.filter((a) => (a.labels?.severity ?? "").toLowerCase() === "critical");
      const headSeries = Number(seriesBody?.data?.result?.[0]?.value?.[1] ?? NaN);

      const metrics: Metric[] = [
        { label: "Targets Up", value: `${up.length}/${targets.length}`, state: down.length ? "warning" : "healthy" },
        { label: "Targets Down", value: down.length, state: down.length ? "critical" : "healthy" },
        { label: "Firing Alerts", value: firing.length, state: firing.length ? "warning" : "healthy" },
        { label: "Critical Alerts", value: critical.length, state: critical.length ? "critical" : "healthy" },
        ...(Number.isFinite(headSeries) ? [{ label: "Head Series", value: Math.round(headSeries) }] : []),
        { label: "Version", value: buildBody?.data?.version ?? "unknown" },
      ];

      const items: Item[] = [
        ...firing.map((a, i) => ({
          id: `alert:${a.labels?.alertname ?? i}:${a.labels?.instance ?? i}`,
          label: a.labels?.alertname ?? "alert",
          subtitle:
            a.annotations?.description ??
            a.annotations?.summary ??
            `${a.labels?.instance ?? ""} ${a.labels?.job ?? ""}`.trim(),
          value: a.labels?.severity ?? "firing",
          state: ((a.labels?.severity ?? "").toLowerCase() === "critical" ? "critical" : "warning") as
            | "critical"
            | "warning",
          group: "alerts",
        })),
        ...targets.map((t) => ({
          id: `target:${targetName(t)}:${t.labels?.job ?? ""}`,
          label: targetName(t),
          subtitle: t.health === "up" ? (t.labels?.job ?? "") : (t.lastError || "scrape failed"),
          value: t.health ?? "unknown",
          state: (t.health === "up" ? "healthy" : "critical") as "healthy" | "critical",
          group: "targets",
        })),
      ];

      const state: VisualQueryResult["state"] =
        critical.length > 0 || down.length > 0 ? "critical" : firing.length > 0 ? "warning" : "healthy";

      return {
        title: "Prometheus — Metrics",
        subtitle: `${up.length}/${targets.length} targets up • ${firing.length} firing alerts`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `${up.length} of ${targets.length} scrape targets up, ${firing.length} alert(s) firing (${critical.length} critical)${
          Number.isFinite(headSeries) ? `, ${Math.round(headSeries).toLocaleString()} head series` : ""
        }.`,
      };
    } catch (err) {
      return failureResult(this.name, "Prometheus", base, err, start);
    }
  }
}

const adapter = new PrometheusAdapter();
export { adapter as default };
