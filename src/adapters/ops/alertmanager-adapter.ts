// Alertmanager adapter — active alerts, silences, receivers, cluster state.
//
// Every displayed value comes from the Alertmanager v2 HTTP API on the
// configured server:
//   GET /api/v2/alerts    → active/suppressed alerts with labels + annotations
//   GET /api/v2/status    → version, uptime, cluster peer status
//   GET /api/v2/silences  → active/pending/expired silences
//   GET /api/v2/receivers → configured notification receivers
//
// The alert list carries the panel; the other three run on the shorter fan-out
// budget so a slow one degrades the panel rather than taking it down.
//
// DEPLOYMENT NOTE (2026-08-02). On this fleet Alertmanager v0.28.1 runs as the
// `monitoring-alertmanager` container on gh-arm, but its port binding is
// 127.0.0.1:9093 — loopback only. Nothing on the tailnet can reach it, so with
// ALERTMANAGER_URL=http://gh-arm:9093 this panel renders `offline` with
// "Connection refused". That is the accurate report: the service exists, it is
// running, and it is not reachable. The fix is on gh-arm (bind the published
// port to the tailscale address instead of 127.0.0.1), not here. The parsing
// below was verified against the real instance over an SSH port-forward.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const ALERTMANAGER_URL = process.env.ALERTMANAGER_URL || "";

interface AmAlert {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
  fingerprint?: string;
  status?: {
    state?: string;
    silencedBy?: string[];
    inhibitedBy?: string[];
  };
}

interface AmStatus {
  uptime?: string;
  versionInfo?: { version?: string };
  cluster?: { status?: string; peers?: Array<{ name?: string; address?: string }> };
}

interface AmSilence {
  id?: string;
  comment?: string;
  createdBy?: string;
  endsAt?: string;
  status?: { state?: string };
  matchers?: Array<{ name?: string; value?: string; isRegex?: boolean }>;
}

interface AmReceiver {
  name?: string;
}

function severityOf(a: AmAlert): string {
  return (a.labels?.severity ?? "").toLowerCase();
}

function alertState(a: AmAlert): "critical" | "warning" | "stale" {
  // A suppressed alert (silenced or inhibited) is deliberately not paged on.
  // Rendering it at full severity would misrepresent the operator's intent.
  if (a.status?.state === "suppressed") return "stale";
  return severityOf(a) === "critical" ? "critical" : "warning";
}

class AlertmanagerAdapter implements DataAdapter {
  readonly name = "alertmanager";
  readonly description = "Alertmanager — active alerts, silences, receivers, cluster state.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, ALERTMANAGER_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!ALERTMANAGER_URL) {
      return notConfiguredResult(this.name, "Alertmanager", "ALERTMANAGER_URL");
    }

    const base = ALERTMANAGER_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const alerts = await fetchJson<AmAlert[]>(`${base}/api/v2/alerts`);

      const [status, silences, receivers] = await Promise.all([
        fetchJson<AmStatus>(`${base}/api/v2/status`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
        fetchJson<AmSilence[]>(`${base}/api/v2/silences`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
        fetchJson<AmReceiver[]>(`${base}/api/v2/receivers`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
      ]);

      const active = alerts.filter((a) => a.status?.state === "active");
      const suppressed = alerts.filter((a) => a.status?.state === "suppressed");
      const critical = active.filter((a) => severityOf(a) === "critical");
      const activeSilences = (silences ?? []).filter((s) => s.status?.state === "active");
      const clusterStatus = status?.cluster?.status ?? "unknown";
      const peers = status?.cluster?.peers?.length ?? 0;

      const metrics: Metric[] = [
        {
          label: "Active Alerts",
          value: active.length,
          state: active.length ? "warning" : "healthy",
        },
        {
          label: "Critical",
          value: critical.length,
          state: critical.length ? "critical" : "healthy",
        },
        { label: "Suppressed", value: suppressed.length },
        { label: "Active Silences", value: activeSilences.length },
        ...(receivers ? [{ label: "Receivers", value: receivers.length }] : []),
        ...(status?.cluster
          ? [
              {
                label: "Cluster",
                value: `${clusterStatus} (${peers} peer${peers === 1 ? "" : "s"})`,
                state: (clusterStatus === "ready" ? "healthy" : "warning") as "healthy" | "warning",
              },
            ]
          : []),
        { label: "Version", value: status?.versionInfo?.version ?? "unknown" },
      ];

      const items: Item[] = [
        ...alerts.map((a, i) => ({
          id: `alert:${a.fingerprint ?? i}`,
          label: a.labels?.alertname ?? "alert",
          subtitle:
            a.annotations?.summary ??
            a.annotations?.description ??
            `${a.labels?.instance ?? ""} ${a.labels?.job ?? ""}`.trim(),
          value: a.status?.state === "suppressed" ? "suppressed" : (a.labels?.severity ?? "active"),
          state: alertState(a),
          group: "alerts",
          meta: {
            ...(a.startsAt ? { startsAt: a.startsAt } : {}),
            ...(a.status?.silencedBy?.length ? { silencedBy: a.status.silencedBy } : {}),
            ...(a.status?.inhibitedBy?.length ? { inhibitedBy: a.status.inhibitedBy } : {}),
          },
        })),
        ...activeSilences.map((s, i) => ({
          id: `silence:${s.id ?? i}`,
          label: s.comment || (s.id ?? "silence"),
          subtitle: [
            (s.matchers ?? []).map((m) => `${m.name ?? ""}=${m.value ?? ""}`).join(", "),
            s.endsAt ? `until ${s.endsAt}` : "",
          ]
            .filter(Boolean)
            .join(" • "),
          value: s.createdBy || "silenced",
          state: "stale" as const,
          group: "silences",
        })),
        ...(receivers ?? []).map((r, i) => ({
          id: `receiver:${r.name ?? i}`,
          label: r.name ?? "receiver",
          subtitle: "notification receiver",
          state: "healthy" as const,
          group: "receivers",
        })),
      ];

      const state: VisualQueryResult["state"] =
        critical.length > 0 ? "critical" : active.length > 0 ? "warning" : "healthy";

      return {
        title: "Alertmanager — Alert Routing",
        subtitle: `${active.length} active • ${critical.length} critical • ${activeSilences.length} silence(s)`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `${active.length} active alert(s) (${critical.length} critical), ${suppressed.length} suppressed, ${activeSilences.length} active silence(s)${
          status?.versionInfo?.version ? ` on Alertmanager ${status.versionInfo.version}` : ""
        }.`,
      };
    } catch (err) {
      return failureResult(this.name, "Alertmanager", base, err, start);
    }
  }
}

const adapter = new AlertmanagerAdapter();
export { adapter as default };
