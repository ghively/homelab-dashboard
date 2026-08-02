// Wazuh Manager adapter — intrusion detection, security events, agent status.
// Host: gh-arm (Tailscale 100.65.126.126)
// API: REST over HTTPS (default 55000)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const WAZUH_MANAGER_URL =
  process.env.WAZUH_MANAGER_URL || "https://100.65.126.126:55000";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "wazuh-manager",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class WazuhManagerAdapter implements DataAdapter {
  readonly name = "wazuh-manager";
  readonly description =
    "Wazuh Manager — intrusion detection, security events, and agent status.";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    const start = Date.now();
    try {
      await fetch(`${WAZUH_MANAGER_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline — still return freshness
    }
    const f = makeFreshness(WAZUH_MANAGER_URL);
    f.stalenessSeconds = (Date.now() - start) / 1000;
    return f;
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const res = await fetch(
        `${WAZUH_MANAGER_URL}/agents/summary/status`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = (await res.json()) as {
        data?: {
          affected?: number;
          total?: number;
          active?: number;
          disconnected?: number;
          never_connected?: number;
          pending?: number;
        };
      };
      const active = raw.data?.active ?? 0;
      const total = raw.data?.total ?? 0;
      const disconnected = raw.data?.disconnected ?? 0;
      const neverConnected = raw.data?.never_connected ?? 0;
      const pending = raw.data?.pending ?? 0;

      // Only values the API actually returned. The previous version padded this
      // out with invented alert counts and three fabricated security events
      // (a named brute-force source IP, an /etc/passwd modification). Inventing
      // security findings is worse than showing none — do not reintroduce them.
      // Alerts live in the Indexer, not this endpoint; see wazuh-indexer.
      return {
        title: "Wazuh Manager — Agent Status",
        subtitle: "Intrusion detection agent monitoring",
        state: disconnected > 0 ? "warning" : "healthy",
        freshness: makeFreshness(WAZUH_MANAGER_URL),
        metrics: [
          { label: "Active Agents", value: active, state: "healthy" },
          { label: "Total Agents", value: total, state: "healthy" },
          {
            label: "Disconnected",
            value: disconnected,
            state: disconnected > 0 ? "warning" : "healthy",
          },
          { label: "Never Connected", value: neverConnected, state: "healthy" },
          { label: "Pending", value: pending, state: "healthy" },
        ],
        summary: `${active} of ${total} agents active`,
      };
    } catch {
      // Unreachable — report offline. No cached or placeholder values.
      return {
        title: "Wazuh Manager — Security Overview",
        subtitle: "API unreachable — showing cached data",
        state: "offline",
        freshness: makeFreshness(WAZUH_MANAGER_URL),
        metrics: [
          { label: "Status", value: "UNREACHABLE", state: "offline" },
          { label: "Endpoint", value: WAZUH_MANAGER_URL },
        ],
      };
    }
  }
}

const adapter = new WazuhManagerAdapter();
export { adapter as default };
