/**
 * Adapter bridge: wraps a Media World adapter (returns nested
 * { data: VisualData, freshness: contracts.FreshnessInfo }) into the
 * DataAdapter interface (returns flat types.VisualQueryResult).
 *
 * The Media World adapters (emby, sonarr, radarr, sabnzbd, romm, tdarr)
 * use the internal contracts.ts shape. The dashboard, registry, and
 * aggregator use the flat types.ts shape. This bridge is the translation
 * layer between them — the two contracts never need to merge.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import type {
  FreshnessInfo as TypesFreshnessInfo,
  VisualQueryResult as TypesVisualQueryResult,
  Metric,
  Item,
  Series,
  Node,
  Edge,
  Event,
} from "@/adapters/types";
import type {
  FreshnessInfo as ContractsFreshnessInfo,
  VisualData,
} from "@/lib/adapters/core/contracts";

export interface BridgedAdapter {
  health(): Promise<ContractsFreshnessInfo>;
}

export interface BridgeAdapterOpts<T extends BridgedAdapter = BridgedAdapter> {
  name: string;
  description: string;
  category: "ai" | "media" | "ops" | "host" | "home" | "security" | "network" | "knowledge" | "personal";
  adapter: T;
  queryMap: Record<string, (a: T) => Promise<{ data: VisualData; freshness: ContractsFreshnessInfo }>>;
  defaultQuery?: string;
}

function mapFreshness(f: ContractsFreshnessInfo, adapterName: string): TypesFreshnessInfo {
  return {
    adapter: adapterName,
    source: f.source,
    queriedAt: f.timestamp,
    stalenessSeconds: f.cacheAgeMs != null ? Math.round(f.cacheAgeMs / 1000) : 0,
    cacheHit: false,
  };
}

function flattenResult(
  adapterName: string,
  nested: { data: VisualData; freshness: ContractsFreshnessInfo },
): TypesVisualQueryResult {
  const d = nested.data;
  const result: TypesVisualQueryResult = {
    title: d.title ?? adapterName,
    ...(d.subtitle != null ? { subtitle: d.subtitle } : {}),
    state: d.state ?? "healthy",
    source: "live",
    freshness: mapFreshness(nested.freshness, adapterName),
    ...(d.metrics ? { metrics: d.metrics as Metric[] } : {}),
    ...(d.items ? { items: d.items as Item[] } : {}),
    ...(d.series ? { series: d.series as Series[] } : {}),
    ...(d.nodes ? { nodes: d.nodes as Node[] } : {}),
    ...(d.edges ? { edges: d.edges as Edge[] } : {}),
    ...(d.events ? { events: d.events as Event[] } : {}),
    ...(d.summary ? { summary: d.summary } : {}),
    ...(d.query ? { query: d.query } : {}),
  };
  return result;
}

export function bridgeAdapter<T extends BridgedAdapter>(opts: BridgeAdapterOpts<T>): DataAdapter {
  const { name, description, category, adapter, queryMap, defaultQuery } = opts;

  return {
    name,
    description,
    category,

    async health() {
      const f = await adapter.health();
      return mapFreshness(f, name);
    },

    async query(params) {
      const queryName = params?.query ?? defaultQuery;
      const handler = queryName ? queryMap[queryName] : undefined;
      if (!handler) {
        const available = Object.keys(queryMap).join(", ");
        throw new Error(
          `Unknown query "${queryName ?? "(none)"}" for adapter "${name}". Available: ${available}`,
        );
      }
      const nested = await handler(adapter);
      return flattenResult(name, nested);
    },
  };
}
