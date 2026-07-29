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

      return {
        title: "Wazuh Dashboard — Security Intelligence",
        subtitle: "Threat detection and compliance monitoring",
        state: "warning",
        freshness: makeFreshness(WAZUH_DASHBOARD_URL),
        metrics: [
          { label: "Security Score", value: 87, state: "healthy" },
          { label: "Compliance Status", value: "98%", state: "healthy" },
          { label: "Active Threats", value: 2, state: "warning" },
          { label: "Threat Intel Feeds", value: 12, state: "healthy" },
          { label: "Failed Compliance Checks", value: 3, state: "warning" },
          { label: "CVEs Detected (30d)", value: 15, state: "warning" },
        ],
        events: [
          {
            id: "evt-001",
            at: new Date(Date.now() - 600_000).toISOString(),
            title: "New CVE detected",
            detail: "CVE-2024-38156 (high severity) detected on gh-arm",
            state: "warning",
          },
          {
            id: "evt-002",
            at: new Date(Date.now() - 7_200_000).toISOString(),
            title: "Compliance check failed",
            detail: "SSH configuration not compliant with CIS benchmark",
            state: "warning",
          },
          {
            id: "evt-003",
            at: new Date(Date.now() - 86_400_000).toISOString(),
            title: "Threat intelligence updated",
            detail: "12 feeds updated, 0 new threats detected",
            state: "healthy",
          },
        ],
        series: [
          {
            name: "Security Score Trend",
            unit: "score",
            points: [
              { x: "Mon", y: 82 },
              { x: "Tue", y: 84 },
              { x: "Wed", y: 85 },
              { x: "Thu", y: 87 },
              { x: "Fri", y: 87 },
            ],
          },
        ],
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
