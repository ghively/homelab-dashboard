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
  // `filters` is whatever the model passed via Query()'s second argument
  // (minus `view`, which selects the map key itself) — e.g. {genre: "Horror"}.
  // Most handlers ignore the second param entirely; JS/TS allow that.
  queryMap: Record<
    string,
    (a: T, filters?: Record<string, unknown>) => Promise<{ data: VisualData; freshness: ContractsFreshnessInfo }>
  >;
  defaultQuery?: string;
  // Write actions. Optional — most adapters stay read-only. Each handler
  // returns success:false with a message on an expected failure (bad id,
  // service rejects it) rather than throwing, since a mutation's result is
  // shown to the user directly, not classified through classifyError() the
  // way a query failure is.
  mutationMap?: Record<
    string,
    (a: T, args: Record<string, unknown>) => Promise<{ success: boolean; message: string }>
  >;
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
  const { name, description, category, adapter, queryMap, defaultQuery, mutationMap } = opts;

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
      const nested = await handler(adapter, params?.filters);
      return flattenResult(name, nested);
    },

    ...(mutationMap
      ? {
          async mutate(action: string, args: Record<string, unknown>) {
            const handler = mutationMap[action];
            if (!handler) {
              const available = Object.keys(mutationMap).join(", ");
              return { success: false, message: `Unknown action "${action}" for adapter "${name}". Available: ${available}` };
            }
            return handler(adapter, args);
          },
        }
      : {}),
  };
}
