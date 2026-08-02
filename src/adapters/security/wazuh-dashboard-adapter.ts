// Wazuh Dashboard adapter — security visualization, threat intelligence, compliance.
// Host: gh-arm (Tailscale 100.65.126.126)
// API: REST over HTTPS (default 443, proxied through Nginx)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const WAZUH_DASHBOARD_URL =
  process.env.WAZUH_DASHBOARD_URL || "https://100.65.126.126";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "wazuh-dashboard",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class WazuhDashboardAdapter implements DataAdapter {
  readonly name = "wazuh-dashboard";
  readonly description =
    "Wazuh Dashboard — security visualization, threat intelligence, and compliance status.";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${WAZUH_DASHBOARD_URL}/api/status`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(WAZUH_DASHBOARD_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const res = await fetch(`${WAZUH_DASHBOARD_URL}/api/status`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // /api/status is the OpenSearch Dashboards status document: overall state
      // plus per-plugin states. It carries no security telemetry, so this panel
      // reports service health only.
      //
      // The previous version fetched this endpoint, discarded the response, and
      // returned an invented "Security Score" of 87, "Active Threats: 2",
      // "CVEs Detected (30d): 15", three fabricated events naming a specific
      // CVE, and a five-point score trend. None of it came from Wazuh.
      // Alert and CVE counts belong to the Indexer — see wazuh-indexer.
      const status = (await res.json()) as {
        status?: {
          overall?: { state?: string; title?: string };
          statuses?: Array<{ id?: string; state?: string; message?: string }>;
        };
        version?: { number?: string };
      };

      const overall = status.status?.overall?.state ?? "unknown";
      const plugins = status.status?.statuses ?? [];
      const degraded = plugins.filter((p) => p.state && p.state !== "green");

      const state =
        overall === "green" ? "healthy" : overall === "unknown" ? "empty" : "warning";

      return {
        title: "Wazuh Dashboard — Service Status",
        subtitle: status.version?.number
          ? `OpenSearch Dashboards ${status.version.number}`
          : "OpenSearch Dashboards",
        state,
        freshness: makeFreshness(WAZUH_DASHBOARD_URL),
        metrics: [
          { label: "Overall", value: overall.toUpperCase(), state },
          { label: "Plugins", value: plugins.length, state: "healthy" },
          {
            label: "Degraded",
            value: degraded.length,
            state: degraded.length > 0 ? "warning" : "healthy",
          },
        ],
        items: degraded.map((p, i) => ({
          id: p.id ?? `plugin-${i}`,
          label: p.id ?? "unknown plugin",
          subtitle: p.message ?? p.state ?? "",
          state: "warning" as const,
          group: "degraded",
        })),
        summary: status.status?.overall?.title ?? `Dashboard status: ${overall}`,
      };
    } catch {
      return {
        title: "Wazuh Dashboard — Security Intelligence",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(WAZUH_DASHBOARD_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new WazuhDashboardAdapter();
export { adapter as default };
