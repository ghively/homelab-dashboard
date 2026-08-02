// Wazuh Indexer adapter — log search, alert analytics, data retention.
// Host: gh-arm (Tailscale 100.65.126.126)
// API: OpenSearch REST (default 9200)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const WAZUH_INDEXER_URL =
  process.env.WAZUH_INDEXER_URL || "https://100.65.126.126:9200";

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

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
      const [healthRes, indicesRes] = await Promise.all([
        fetch(`${WAZUH_INDEXER_URL}/_cluster/health`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${WAZUH_INDEXER_URL}/_cat/indices?format=json&bytes=b`, {
          signal: AbortSignal.timeout(8000),
        }),
      ]);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);

      const raw = (await healthRes.json()) as {
        status?: string;
        number_of_nodes?: number;
        active_shards?: number;
      };
      const clusterStatus = raw.status ?? "unknown";

      // Index inventory comes from _cat/indices. The previous version hardcoded
      // "Total Indices: 47", "2.4M" documents, "15.2 GB", four per-index sizes,
      // and an alerts-per-hour series — none of it from the cluster.
      interface CatIndex {
        index?: string;
        health?: string;
        "docs.count"?: string;
        "store.size"?: string;
      }
      const indices: CatIndex[] = indicesRes.ok ? await indicesRes.json() : [];
      const known = indices.filter((i) => i.index && !i.index.startsWith("."));
      const totalDocs = known.reduce((a, i) => a + Number(i["docs.count"] ?? 0), 0);
      const totalBytes = known.reduce((a, i) => a + Number(i["store.size"] ?? 0), 0);

      const metrics: Metric[] = [
        {
          label: "Cluster Status",
          value: clusterStatus,
          state: clusterStatus === "green" ? "healthy" : "warning",
        },
        { label: "Nodes", value: raw.number_of_nodes ?? 0 },
        { label: "Active Shards", value: raw.active_shards ?? 0 },
      ];
      if (indicesRes.ok) {
        metrics.push(
          { label: "Indices", value: known.length },
          { label: "Documents", value: totalDocs.toLocaleString() },
          { label: "Store Size", value: formatBytes(totalBytes) },
        );
      }

      return {
        title: "Wazuh Indexer — Log Storage & Analytics",
        subtitle: `Cluster: ${clusterStatus}`,
        state:
          clusterStatus === "red" ? "critical" : clusterStatus === "yellow" ? "warning" : "healthy",
        freshness: makeFreshness(WAZUH_INDEXER_URL),
        metrics,
        items: known
          .sort((a, b) => Number(b["store.size"] ?? 0) - Number(a["store.size"] ?? 0))
          .slice(0, 12)
          .map((i) => ({
            id: i.index!,
            label: i.index!,
            subtitle: `${Number(i["docs.count"] ?? 0).toLocaleString()} docs`,
            value: formatBytes(Number(i["store.size"] ?? 0)),
            state: i.health === "red" ? ("critical" as const)
              : i.health === "yellow" ? ("warning" as const)
              : ("healthy" as const),
            group: "indices",
          })),
        summary: `${known.length} indices, ${totalDocs.toLocaleString()} documents`,
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
