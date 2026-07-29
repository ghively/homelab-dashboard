// Wazuh Dashboard adapter — OpenSearch Dashboards frontend for Wazuh SIEM.
// Host: gh-vps (Tailscale: 100.92.162.32)
// URL: https://wazuh.hively.dev (443)
import type { DataAdapter, HealthCheck } from "./adapter-base";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import type { Metric, VisualQueryResult } from "./types";

const WAZUH_DASHBOARD_URL = process.env.WAZUH_DASHBOARD_URL || "https://wazuh.hively.dev";

class WazuhDashboardAdapter implements DataAdapter {
  readonly name = "wazuh-dashboard";
  readonly description = "Wazuh Dashboard (OpenSearch Dashboards) — SIEM visualization layer.";
  readonly category = "security" as const;

  async health(): Promise<HealthCheck> {
    const now = new Date().toISOString();
    try {
      const response = await fetch(`${WAZUH_DASHBOARD_URL}/api/status`, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        return { adapter: this.name, source: "wazuh-dashboard", queriedAt: now, stalenessSeconds: 0, cacheHit: false, version: "online" };
      }
      return { adapter: this.name, source: "wazuh-dashboard", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    } catch {
      return { adapter: this.name, source: "wazuh-dashboard", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fs = getFixtureState();
    if (fs) return getFixtureForState(this.name, fs);

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      const response = await fetch(`${WAZUH_DASHBOARD_URL}/api/status`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Dashboard responded ${response.status}`);
      }

      const status = await response.json() as {
        version?: { number?: string };
        status?: { overall?: { state?: string } };
      };

      const version = status.version?.number || "unknown";
      const overallState = status.status?.overall?.state || "unknown";

      const state: VisualQueryResult["state"] = overallState === "green" ? "healthy" : overallState === "yellow" ? "warning" : overallState === "red" ? "critical" : "healthy";

      const metrics: Metric[] = [
        { label: "Version", value: version, state: "healthy" },
        { label: "State", value: overallState.toUpperCase(), state },
        { label: "URL", value: WAZUH_DASHBOARD_URL, state: "healthy" },
      ];

      return {
        title: "Wazuh Dashboard",
        subtitle: `OpenSearch Dashboards ${version}`,
        state,
        freshness: { adapter: this.name, source: "wazuh-dashboard", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics,
        summary: `Dashboard ${overallState} — ${WAZUH_DASHBOARD_URL}`,
      };
    } catch (error) {
      return {
        title: "Wazuh Dashboard",
        subtitle: error instanceof Error ? error.message : "Connection failed",
        state: "offline",
        freshness: { adapter: this.name, source: "wazuh-dashboard", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics: [{ label: "Status", value: "OFFLINE", state: "offline" }],
        summary: "Wazuh Dashboard unreachable",
      };
    }
  }
}

const adapter = new WazuhDashboardAdapter();
export { adapter as default };
