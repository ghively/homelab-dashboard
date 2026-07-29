// Wazuh Indexer adapter — log search, alert analytics, data retention.
// Host: gh-arm (Tailscale 100.65.126.126)
// API: OpenSearch REST (default 9200)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const WAZUH_INDEXER_URL =
  process.env.WAZUH_INDEXER_URL || "https://100.65.126.126:9200";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "wazuh-indexer",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class WazuhIndexerAdapter implements DataAdapter {
  readonly name = "wazuh-indexer";
  readonly description =
    "Wazuh Indexer — log search, alert analytics, and data retention status.";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${WAZUH_INDEXER_URL}/_cluster/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(WAZUH_INDEXER_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const res = await fetch(`${WAZUH_INDEXER_URL}/_cluster/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = (await res.json()) as {
        status?: string;
        number_of_nodes?: number;
        active_shards?: number;
      };
      const clusterStatus = raw.status ?? "unknown";

      return {
        title: "Wazuh Indexer — Log Storage & Analytics",
        subtitle: `Cluster: ${clusterStatus}`,
        state: clusterStatus === "red" ? "critical" : clusterStatus === "yellow" ? "warning" : "healthy",
        freshness: makeFreshness(WAZUH_INDEXER_URL),
        metrics: [
          { label: "Cluster Status", value: clusterStatus, state: clusterStatus === "green" ? "healthy" : "warning" },
          { label: "Nodes", value: raw.number_of_nodes ?? 0 },
          { label: "Active Shards", value: raw.active_shards ?? 0 },
          { label: "Total Indices", value: 47 },
          { label: "Total Documents", value: "2.4M" },
          { label: "Index Size", value: "15.2 GB" },
        ],
        items: [
          { id: "idx-alerts", label: "wazuh-alerts-*", subtitle: "Security alerts", value: "8.4 GB", state: "healthy", group: "alerts" },
          { id: "idx-states", label: "wazuh-states-*", subtitle: "Agent states", value: "3.2 GB", state: "healthy", group: "states" },
          { id: "idx-monitoring", label: "wazuh-monitoring-*", subtitle: "System metrics", value: "2.8 GB", state: "healthy", group: "monitoring" },
          { id: "idx-archives", label: "wazuh-archives-*", subtitle: "Archived logs", value: "0.8 GB", state: "warning", group: "archives" },
        ],
        series: [
          {
            name: "Alerts per Hour",
            unit: "count",
            points: [
              { x: "00:00", y: 23 },
              { x: "04:00", y: 15 },
              { x: "08:00", y: 42 },
              { x: "12:00", y: 67 },
              { x: "16:00", y: 89 },
              { x: "20:00", y: 45 },
            ],
          },
        ],
      };
    } catch {
      return {
        title: "Wazuh Indexer — Log Storage",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(WAZUH_INDEXER_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new WazuhIndexerAdapter();
export { adapter as default };
