// Wazuh Indexer adapter — OpenSearch-based alert storage and search.
// Host: gh-vps (Tailscale: 100.92.162.32)
// API: https://indexer.hively.dev (9200)
import type { DataAdapter, HealthCheck } from "./adapter-base";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import type { Metric, VisualQueryResult } from "./types";

const WAZUH_INDEXER_URL = process.env.WAZUH_INDEXER_URL || "https://indexer.hively.dev";
const WAZUH_INDEXER_USER = process.env.WAZUH_INDEXER_USER || "admin";
const WAZUH_INDEXER_PASS = process.env.WAZUH_INDEXER_PASS || "";

interface IndexerHealth {
  status: string;
  cluster_name: string;
  number_of_nodes: number;
  active_shards: number;
  active_primary_shards: number;
  relocating_shards: number;
  unassigned_shards: number;
  disk_total?: string;
  disk_used?: string;
  disk_percent?: number;
}

async function indexerFetch<T>(path: string): Promise<T> {
  const auth = `Basic ${btoa(`${WAZUH_INDEXER_USER}:${WAZUH_INDEXER_PASS}`)}`;
  const response = await fetch(`${WAZUH_INDEXER_URL}${path}`, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Indexer ${response.status}: ${response.statusText}`);
  return response.json() as Promise<T>;
}

class WazuhIndexerAdapter implements DataAdapter {
  readonly name = "wazuh-indexer";
  readonly description = "Wazuh Indexer (OpenSearch) — alert storage and search.";
  readonly category = "security" as const;

  async health(): Promise<HealthCheck> {
    const now = new Date().toISOString();
    try {
      await indexerFetch<{ status: string }>("/_cluster/health");
      return { adapter: this.name, source: "wazuh-indexer", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    } catch {
      return { adapter: this.name, source: "wazuh-indexer", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fs = getFixtureState();
    if (fs) return getFixtureForState(this.name, fs);

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      const [clusterHealth, catIndices, aliases] = await Promise.all([
        indexerFetch<IndexerHealth>("/_cluster/health").catch(() => null),
        indexerFetch<Array<{ index: string; docs_count: string; store_size: string; health: string }>>("/_cat/indices?format=json").catch(() => []),
        indexerFetch<Array<{ alias: string; index: string }>>("/_cat/aliases?format=json").catch(() => []),
      ]);

      const health = clusterHealth ?? ({} as IndexerHealth);
      const indices = catIndices ?? [];
      const alertIndices = indices.filter((i) => i.index.startsWith("wazuh-alerts") || i.index.startsWith("wazuh-states"));
      const totalDocs = alertIndices.reduce((acc, i) => acc + parseInt(i.docs_count || "0", 10), 0);
      const totalSize = alertIndices.reduce((acc, i) => {
        const size = parseFloat(i.store_size);
        return acc + (isNaN(size) ? 0 : size);
      }, 0);

      const state: VisualQueryResult["state"] =
        health.status === "red" ? "critical" : health.status === "yellow" ? "warning" : "healthy";

      const metrics: Metric[] = [
        { label: "Cluster Status", value: (health.status || "unknown").toUpperCase(), state },
        { label: "Nodes", value: health.number_of_nodes ?? 0, state: "healthy" },
        { label: "Shards Active", value: health.active_shards ?? 0, state: "healthy" },
        { label: "Unassigned", value: health.unassigned_shards ?? 0, state: (health.unassigned_shards ?? 0) > 0 ? "warning" : "healthy" },
        { label: "Indices", value: indices.length, state: "healthy" },
        { label: "Alert Docs", value: totalDocs, state: "healthy" },
      ];

      return {
        title: "Wazuh Indexer",
        subtitle: `${health.cluster_name || "wazuh-cluster"} · ${alertIndices.length} alert indices`,
        state,
        freshness: { adapter: this.name, source: "wazuh-indexer", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics,
        items: alertIndices.slice(0, 12).map((i) => ({
          id: i.index,
          label: i.index,
          subtitle: `${i.docs_count} docs · ${i.store_size}`,
          value: parseInt(i.docs_count || "0", 10),
          state: i.health === "red" ? "critical" : i.health === "yellow" ? "warning" : "healthy",
          group: i.health,
        })),
        summary: `${totalDocs} alert documents across ${alertIndices.length} indices`,
      };
    } catch (error) {
      return {
        title: "Wazuh Indexer",
        subtitle: error instanceof Error ? error.message : "Connection failed",
        state: "offline",
        freshness: { adapter: this.name, source: "wazuh-indexer", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics: [{ label: "Status", value: "OFFLINE", state: "offline" }],
        summary: "Wazuh Indexer API unreachable or auth failed",
      };
    }
  }
}

const adapter = new WazuhIndexerAdapter();
export { adapter as default };
