import { z } from "zod";

/**
 * VisualState represents the health/status of any entity or component.
 */
export type VisualStateValue = "healthy" | "warning" | "critical" | "offline" | "stale" | "loading" | "empty" | "denied";

/**
 * Metric represents a single key/value measurement with optional context.
 */
export const MetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.number().optional(),
  state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
});
export type Metric = z.infer<typeof MetricSchema>;

/**
 * Item represents a discrete entity in a collection.
 */
export const ItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  image: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  progress: z.number().min(0).max(1).optional(),
  state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
  group: z.string().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});
export type Item = z.infer<typeof ItemSchema>;

/**
 * Series represents a time-series for charts and timelines.
 */
export const SeriesSchema = z.object({
  name: z.string(),
  unit: z.string().optional(),
  points: z.array(
    z.object({
      x: z.union([z.string(), z.number()]),
      y: z.number(),
    })
  ),
});
export type Series = z.infer<typeof SeriesSchema>;

/**
 * Node represents a graph node for topology views.
 */
export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
  value: z.number().optional(),
});
export type Node = z.infer<typeof NodeSchema>;

/**
 * Edge represents a graph edge between nodes.
 */
export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  value: z.number().optional(),
  state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

/**
 * Event represents a timeline entry or event stream item.
 */
export const EventSchema = z.object({
  id: z.string(),
  at: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  image: z.string().optional(),
  state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
  durationMs: z.number().optional(),
});
export type Event = z.infer<typeof EventSchema>;

/**
 * Freshness metadata for all query results
 */
export const FreshnessInfoSchema = z.object({
  adapter: z.string(),
  source: z.string(),
  queriedAt: z.string().datetime(),
  stalenessSeconds: z.number().default(0),
  lastChange: z.string().datetime().optional(),
  cacheHit: z.boolean().default(false),
  version: z.string().optional(),
});

export type FreshnessInfo = z.infer<typeof FreshnessInfoSchema>;

/**
 * Visual query result returned by all adapters
 * This is the normalized contract between adapters and the OpenUI renderer
 *
 * NOTE on `source`: adapters do not set it and cannot know it — whether a
 * result is live or fixture data is decided at the boundary by queryAdapter().
 * It is therefore optional here. Use ResolvedQueryResult (below) for the
 * post-boundary type, where it is guaranteed.
 */
export const VisualQueryResultSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).default("healthy"),
  source: z.enum(["fixture", "live"]).optional(),
  freshness: FreshnessInfoSchema,
  metrics: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    unit: z.string().optional(),
    trend: z.number().optional(),
    state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
  })).optional(),
  items: z.array(z.object({
    id: z.string(),
    label: z.string(),
    subtitle: z.string().optional(),
    image: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    progress: z.number().min(0).max(1).optional(),
    state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
    group: z.string().optional(),
    meta: z.record(z.string(), z.any()).optional(),
  })).optional(),
  series: z.array(z.object({
    name: z.string(),
    unit: z.string().optional(),
    points: z.array(z.object({
      x: z.union([z.string(), z.number()]),
      y: z.number(),
    })),
  })).optional(),
  events: z.array(z.object({
    id: z.string(),
    at: z.string(),
    title: z.string(),
    detail: z.string().optional(),
    image: z.string().optional(),
    state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
    durationMs: z.number().optional(),
  })).optional(),
  nodes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
    value: z.number().optional(),
  })).optional(),
  edges: z.array(z.object({
    source: z.string(),
    target: z.string(),
    label: z.string().optional(),
    value: z.number().optional(),
    state: z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]).optional(),
  })).optional(),
  facets: z.array(z.object({
    name: z.string(),
    values: z.array(z.object({
      label: z.string(),
      count: z.number(),
    })),
  })).optional(),
  summary: z.string().optional(),
  query: z.string().optional(),
});

export type VisualQueryResult = z.infer<typeof VisualQueryResultSchema>;

/**
 * A result that has passed through queryAdapter(), which always stamps
 * `source`. Use this for anything downstream of the adapter boundary — the API
 * routes, the tool provider, the DEMO DATA banner — so "is this real data?"
 * stays a compile-time guarantee rather than a convention.
 */
export type ResolvedQueryResult = VisualQueryResult & {
  source: "fixture" | "live";
};

/**
 * Adapter contract — all CI/CD adapters implement this
 */
export interface ServiceAdapter {
  /** Adapter identifier */
  readonly name: string;
  /** Human-readable service name */
  readonly serviceName: string;
  /** Service host/address */
  readonly host: string;

  /** Health check — returns freshness info and current state */
  health(): Promise<FreshnessInfo>;

  /** Query the service and return normalized visual data */
  query(
    queryType?: string,
    params?: Record<string, unknown>
  ): Promise<VisualQueryResult>;
}

/**
 * 1Password credential entry
 */
export interface CredentialEntry {
  item: string;
  vault?: string;
  field?: string;
  envVar?: string;
}

/**
 * API client configuration
 */
export interface ApiClientConfig {
  baseURL: string;
  token?: string;
  timeout?: number;
}

/**
 * Legacy adapter configuration — for backward compatibility
 */
export interface AdapterConfig {
  enabled: boolean;
  refreshIntervalMs: number;
  timeoutMs: number;
  retryAttempts: number;
  [key: string]: unknown;
}

/**
 * Legacy adapter result — for backward compatibility
 */
export interface AdapterResult {
  adapter: string;
  success: boolean;
  timestamp: string;
  data: unknown;
  error?: string;
  state: AdapterState;
  latencyMs: number;
}

/**
 * Legacy adapter state enum — for backward compatibility
 */
export type AdapterState = "healthy" | "warning" | "critical" | "offline" | "stale" | "loading" | "empty" | "denied";

/**
 * Legacy health check type — for backward compatibility with existing adapters
 */
export type HealthCheck = FreshnessInfo;