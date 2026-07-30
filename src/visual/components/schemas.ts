import { z } from "zod";

export const VisualStateSchema = z.enum([
  "healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied",
]);

export const MetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.number().optional(),
  state: VisualStateSchema.optional(),
});

export const ItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  image: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  progress: z.number().min(0).max(1).optional(),
  state: VisualStateSchema.optional(),
  group: z.string().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

export const SeriesSchema = z.object({
  name: z.string(),
  unit: z.string().optional(),
  points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })),
});

export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  state: VisualStateSchema.optional(),
  value: z.number().optional(),
});

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  value: z.number().optional(),
  state: VisualStateSchema.optional(),
});

export const EventSchema = z.object({
  id: z.string(),
  at: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  image: z.string().optional(),
  state: VisualStateSchema.optional(),
  durationMs: z.number().optional(),
});

export type Metric = z.infer<typeof MetricSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Event = z.infer<typeof EventSchema>;
export type VisualState = z.infer<typeof VisualStateSchema>;
