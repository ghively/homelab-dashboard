/**
 * Core contracts for all Media World adapters.
 * These types are shared across all service adapters.
 */

import { z } from "zod";

/**
 * VisualState represents the health/status of any entity or component.
 * Maps to the 8 state fixtures used in dashboard verification.
 */
export const VisualStateSchema = z.enum([
  "healthy",
  "warning",
  "critical",
  "offline",
  "stale",
  "loading",
  "empty",
  "denied",
]);
export type VisualState = z.infer<typeof VisualStateSchema>;

/**
 * Metric represents a single key/value measurement with optional context.
 */
export const MetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.number().optional(), // Percent change, positive/negative
  state: VisualStateSchema.optional(),
});
export type Metric = z.infer<typeof MetricSchema>;

/**
 * Item represents a discrete entity in a collection.
 * Used for movies, series, albums, games, ROMs, queue items, etc.
 */
export const ItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  image: z.string().optional(), // Artwork URL
  value: z.union([z.string(), z.number()]).optional(), // Sort/filter value
  progress: z.number().min(0).max(1).optional(), // 0-1 completion
  state: VisualStateSchema.optional(),
  group: z.string().optional(), // For grouping (status, category, etc.)
  meta: z.record(z.string(), z.any()).optional(), // Arbitrary additional data
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
      x: z.union([z.string(), z.number()]), // Timestamp or category
      y: z.number(), // Value
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
  state: VisualStateSchema.optional(),
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
  state: VisualStateSchema.optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

/**
 * Event represents a timeline entry or event stream item.
 */
export const EventSchema = z.object({
  id: z.string(),
  at: z.string(), // ISO timestamp or display time
  title: z.string(),
  detail: z.string().optional(),
  image: z.string().optional(),
  state: VisualStateSchema.optional(),
  durationMs: z.number().optional(),
});
export type Event = z.infer<typeof EventSchema>;

/**
 * VisualData is the unified shape all adapters produce.
 * Narrowed: dead fields (html, query, selectedId, updatedAt, density) removed —
 * no renderer ever read them. Adapters no longer set updatedAt.
 */
export const VisualDataSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  state: VisualStateSchema.default("healthy"),
  metrics: z.array(MetricSchema).default([]),
  items: z.array(ItemSchema).default([]),
  series: z.array(SeriesSchema).default([]),
  nodes: z.array(NodeSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  events: z.array(EventSchema).default([]),
  summary: z.string().optional(),
  markdown: z.string().optional(),
});
export type VisualData = z.infer<typeof VisualDataSchema>;

/**
 * FreshnessInfo tracks data provenance and staleness.
 */
export const FreshnessInfoSchema = z.object({
  timestamp: z.string(), // ISO timestamp when data was fetched
  source: z.string(), // Service name and endpoint
  cacheAgeMs: z.number().optional(), // Age since last refresh
  lastError: z.string().optional(),
  state: VisualStateSchema,
});
export type FreshnessInfo = z.infer<typeof FreshnessInfoSchema>;

/**
 * VisualQueryResult is the full adapter output.
 * Includes both the visual data and freshness metadata.
 */
export const VisualQueryResultSchema = z.object({
  data: VisualDataSchema,
  freshness: FreshnessInfoSchema,
});
export type VisualQueryResult = z.infer<typeof VisualQueryResultSchema>;

/**
 * MediaEntity represents a generic media item across all services.
 * Shared fields: ID, title, artwork, status, year/rating.
 */
export const MediaEntitySchema = z.object({
  id: z.string(),
  title: z.string(),
  artwork: z.string().optional(),
  status: z.string().optional(), // "available", "missing", "downloading", etc.
  year: z.number().optional(),
  rating: z.number().optional(),
  overview: z.string().optional(),
});
export type MediaEntity = z.infer<typeof MediaEntitySchema>;

/**
 * QueryParams for component-specific queries.
 */
export const QueryParamsSchema = z.object({
  limit: z.number().optional().default(50),
  offset: z.number().optional().default(0),
  filter: z.record(z.string(), z.any()).optional(),
  sort: z
    .object({
      field: z.string(),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
});
export type QueryParams = z.infer<typeof QueryParamsSchema>;

/**
 * AdapterHealth represents the health status of an adapter.
 */
export const AdapterHealthSchema = z.object({
  service: z.string(),
  state: VisualStateSchema,
  lastCheck: z.string(),
  version: z.string().optional(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type AdapterHealth = z.infer<typeof AdapterHealthSchema>;