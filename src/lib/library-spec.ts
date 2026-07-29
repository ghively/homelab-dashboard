import { z } from "zod";
import { defineComponent, createLibrary } from "@openuidev/lang-core";
import baseSpec from "@/generated/spec.json";
import manifest from "@/visual/visual-component-manifest-v4.json";

const VisualStateSchema = z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]);
const MetricSchema = z.object({ label: z.string(), value: z.union([z.string(), z.number()]), unit: z.string().optional(), trend: z.number().optional(), state: VisualStateSchema.optional() });
const ItemSchema = z.object({ id: z.string(), label: z.string(), subtitle: z.string().optional(), image: z.string().optional(), value: z.union([z.string(), z.number()]).optional(), progress: z.number().min(0).max(1).optional(), state: VisualStateSchema.optional(), group: z.string().optional(), meta: z.record(z.string(), z.any()).optional() });
const SeriesSchema = z.object({ name: z.string(), unit: z.string().optional(), points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })) });
const NodeSchema = z.object({ id: z.string(), label: z.string(), x: z.number().optional(), y: z.number().optional(), state: VisualStateSchema.optional(), value: z.number().optional() });
const EdgeSchema = z.object({ source: z.string(), target: z.string(), label: z.string().optional(), value: z.number().optional(), state: VisualStateSchema.optional() });
const EventSchema = z.object({ id: z.string(), at: z.string(), title: z.string(), detail: z.string().optional(), image: z.string().optional(), state: VisualStateSchema.optional(), durationMs: z.number().optional() });
const VisualDataSchema = z.object({ title: z.string().optional(), subtitle: z.string().optional(), state: VisualStateSchema.default("healthy"), density: z.enum(["compact", "comfortable", "immersive"]).default("comfortable"), metrics: z.array(MetricSchema).default([]), items: z.array(ItemSchema).default([]), series: z.array(SeriesSchema).default([]), nodes: z.array(NodeSchema).default([]), edges: z.array(EdgeSchema).default([]), events: z.array(EventSchema).default([]), summary: z.string().optional(), updatedAt: z.string().optional(), markdown: z.string().optional(), html: z.string().optional(), selectedId: z.string().optional(), query: z.string().optional() });

const manifestComponents = manifest.components as Array<{ component: string; purpose: string; renderer_family: string }>;
const visualComponents = manifestComponents.map(spec => defineComponent({
  name: spec.component,
  description: `${spec.purpose} Renderer family: ${spec.renderer_family}.`,
  props: VisualDataSchema,
  component: null,
}));

const visualGroup = {
  name: "Homelab Visual (Cyber Noir v4)",
  components: manifestComponents.map(c => c.component),
  notes: [
    "- 905 domain components across 79 renderer families. All use the VisualData schema.",
    "- Each component renders through its assigned renderer family (donut, timeline, metric-strip, artwork-wall, sankey, etc.).",
    "- Pass structured data: title, subtitle, state, metrics[], items[], series[], events[], nodes[], edges[].",
  ],
};

const visualLibrary = createLibrary({ components: visualComponents });

export const librarySpec = {
  ...baseSpec,
  components: {
    ...baseSpec.components,
    ...visualLibrary.toSpec().components,
  },
  componentGroups: [
    ...(baseSpec.componentGroups ?? []),
    visualGroup,
  ],
};
