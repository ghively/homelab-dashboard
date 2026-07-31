/**
 * Server-safe component definitions — schemas and descriptions only, no React.
 *
 * The chat API route needs `.prompt()` but importing @openuidev/react-lang or
 * @openuidev/react-ui pulls in React client code (createContext) that crashes
 * the Next.js server bundle. lang-core's defineComponent accepts a null
 * component, which is all prompt generation needs.
 */
import { defineComponent, markReactive } from "@openuidev/lang-core";
import { z } from "zod";
import {
  VisualStateSchema,
  MetricSchema,
  ItemSchema,
  SeriesSchema,
  NodeSchema,
  EdgeSchema,
  EventSchema,
} from "@/visual/components/schemas";

// Re-export so this file is the single server-side import surface.
export {
  VisualStateSchema,
  MetricSchema,
  ItemSchema,
  SeriesSchema,
  NodeSchema,
  EdgeSchema,
  EventSchema,
};

const baseSchemaFields = {
  title: z.string().optional(),
  subtitle: z.string().optional(),
  state: VisualStateSchema.optional(),
};

// ── Leaf components extracted as named consts so their .ref can be used ─────
// by the nesting containers (DetailPanel, Kanban, Section).

export const MetricStripSchema = defineComponent({
  name: "MetricStrip",
  description:
    "Horizontal row of 1–6 key metrics (label + value + unit + optional trend %). " +
    "Use for numeric summaries: CPU %, memory, counts, pass/fail, health totals. " +
    "For a single bounded value with a known max (disk %, battery), use Gauge instead.",
  props: z.object({ ...baseSchemaFields, metrics: z.array(MetricSchema) }),
  component: null,
});

export const GaugeSchema = defineComponent({
  name: "Gauge",
  description:
    "Single-value radial gauge for ONE bounded metric (disk %, CPU %, memory %, battery). " +
    "value must be 0–max. thresholds.color: at/above warning = amber, at/above critical = red. " +
    "For unbounded counts or multiple metrics use MetricStrip. For a filled ring without a needle use Donut.",
  props: z.object({
    ...baseSchemaFields,
    value: z.number(),
    max: z.number().optional(),
    unit: z.string().optional(),
    thresholds: z.object({ warning: z.number(), critical: z.number() }).optional(),
  }),
  component: null,
});

export const DonutSchema = defineComponent({
  name: "Donut",
  description:
    "Conic-gradient donut showing proportional shares of a total (media by type, spend by model, storage by bay). " +
    "Pass items where each value is a count/size. For a single percentage use Gauge. For a ranked bar comparison use BarRank.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

export const LineChartSchema = defineComponent({
  name: "LineChart",
  description:
    "Single-series line chart for a trend over time (CPU over 24h, requests/sec, temperature). " +
    "Pass one Series with points {x,y}. For comparing 2–4 series on the same axis use MultiLine. " +
    "For categorical comparison use BarRank.",
  props: z.object({ ...baseSchemaFields, series: z.array(SeriesSchema) }),
  component: null,
});

export const MultiLineSchema = defineComponent({
  name: "MultiLine",
  description:
    "Multi-series line chart: compare 2–4 trends on the same axis (latency by model, bandwidth up/down). " +
    "For a single trend use LineChart. Each series is drawn in a distinct color.",
  props: z.object({ ...baseSchemaFields, series: z.array(SeriesSchema) }),
  component: null,
});

export const BarRankSchema = defineComponent({
  name: "BarRank",
  description:
    "Horizontal bar chart ranking items by a numeric value (top movies by size, queues by depth, hosts by load). " +
    "Pass items with a numeric value. For shares of a whole use Donut. For a single metric use Gauge.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema), metrics: z.array(MetricSchema).optional() }),
  component: null,
});

export const VisualTableSchema = defineComponent({
  name: "VisualTable",
  description:
    "Row-based table/list of items with label, subtitle, state, and value (inventory, fleet, config rows). " +
    "Pass items. Rows are clickable — clicking a row drills down to detail. " +
    "For work-items grouped into columns use Kanban. For a ranked bar comparison use BarRank.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

export const ArtworkWallSchema = defineComponent({
  name: "ArtworkWall",
  description:
    "Grid of poster/artwork thumbnails for media libraries (Emby, Sonarr, Radarr, RomM). " +
    "Pass items with image, label, subtitle, progress. Items are clickable for detail. " +
    "For currently-playing sessions use PlaybackSessions.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

export const CapacitySchema = defineComponent({
  name: "Capacity",
  description:
    "Composite storage/capacity view: a percentage donut plus a metrics row and a mini trend chart. " +
    "Use for storage pools, volume groups, NAS bays. metrics[0].value is the used percentage. " +
    "For a simple single percentage without extras use Gauge.",
  props: z.object({ ...baseSchemaFields, metrics: z.array(MetricSchema), series: z.array(SeriesSchema).optional() }),
  component: null,
});

// ── DetailPanel — accepts MetricStrip children for inline KPI summary ───────
export const DetailPanelSchema = defineComponent({
  name: "DetailPanel",
  description:
    "Key/value detail card for a single entity (host info, adapter config, device details). " +
    "Pass items as rows (label + value). Optionally nest a MetricStrip in children for an inline KPI summary. " +
    "For a multi-item comparison table use VisualTable.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema), children: z.array(MetricStripSchema.ref).optional() }),
  component: null,
});

// ── Kanban — accepts DetailPanel children ───────────────────────────────────
export const KanbanSchema = defineComponent({
  name: "Kanban",
  description:
    "Multi-column board grouping items by their group field (Vikunja tasks, CI jobs by stage, containers by status). " +
    "Pass items with a group field (the column). Items are clickable — clicking drills down to detail. " +
    "For a ranked list use VisualTable. For a pipeline flow use Sankey.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema), children: z.array(DetailPanelSchema.ref).optional() }),
  component: null,
});

// ── Section — tight nesting container (Phase 4.3) ───────────────────────────
export const SectionSchema = defineComponent({
  name: "Section",
  description:
    "Grouping container that renders a title and a vertical stack of child panels. " +
    "Use to organize a dashboard into named regions. children accepts a tight set of display components: " +
    "MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall. " +
    "Do NOT nest Section, Kanban, or Stack inside a Section.",
  props: z.object({
    ...baseSchemaFields,
    children: z.array(z.union([
      MetricStripSchema.ref,
      GaugeSchema.ref,
      DonutSchema.ref,
      LineChartSchema.ref,
      MultiLineSchema.ref,
      BarRankSchema.ref,
      VisualTableSchema.ref,
      DetailPanelSchema.ref,
      CapacitySchema.ref,
      ArtworkWallSchema.ref,
    ])),
  }),
  component: null,
});

// ── FilterDropdown — reactive filter (Phase 4.1) ────────────────────────────
const reactiveValueSchema = z.string().optional();
markReactive(reactiveValueSchema);

export const FilterDropdownSchema = defineComponent({
  name: "FilterDropdown",
  description:
    "Interactive dropdown filter. name is the $variable to bind — reference it as $<name> in a Query()'s args. " +
    "When the user selects an option, every Query() referencing that $variable re-fetches automatically. " +
    "value is the initial selection (optional). Each option: {value, label}. " +
    "Place inside a Stack at the top of a dashboard to control the panels below.",
  props: z.object({
    name: z.string(),
    label: z.string().optional(),
    value: reactiveValueSchema,
    options: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
  component: null,
});

// ── Remaining leaf components (no .ref consumers) ───────────────────────────

const TimelineSchema = defineComponent({
  name: "Timeline",
  description:
    "Vertical timeline of timestamped events (recent activity, deployments, alerts over time). " +
    "Pass events with at, title, detail, state. For a raw log feed use LogStream. " +
    "For a time-series of numbers use LineChart.",
  props: z.object({ ...baseSchemaFields, events: z.array(EventSchema) }),
  component: null,
});

const EventStreamSchema = defineComponent({
  name: "EventStream",
  description:
    "Scrollable feed of recent events with severity coloring (Wazuh alerts, fail2ban bans, container events). " +
    "Similar to Timeline but optimized for high-volume live feeds. Pass events with state for severity badges.",
  props: z.object({ ...baseSchemaFields, events: z.array(EventSchema) }),
  component: null,
});

const LogStreamSchema = defineComponent({
  name: "LogStream",
  description:
    "Monospace log viewer for raw text lines (Loki, journalctl, container logs). Pass items where label = log line. " +
    "For structured timestamped events use EventStream.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

const NodeGraphSchema = defineComponent({
  name: "NodeGraph",
  description:
    "SVG node-and-edge graph for topology and relationships (network mesh, service dependencies, dependency trees). " +
    "Pass nodes {id,label,x,y,state} and edges {source,target}. Nodes are clickable — clicking drills down to that node's detail. " +
    "For a left-to-right pipeline use Sankey.",
  props: z.object({ ...baseSchemaFields, nodes: z.array(NodeSchema), edges: z.array(EdgeSchema) }),
  component: null,
});

const SankeySchema = defineComponent({
  name: "Sankey",
  description:
    "Left-to-right flow diagram for pipelines and processes (CI/CD stages, data pipeline, request flow). " +
    "Pass nodes as ordered stages {id,label,value}. For a mesh/network topology use NodeGraph. " +
    "For a work-item board use Kanban.",
  props: z.object({ ...baseSchemaFields, nodes: z.array(NodeSchema) }),
  component: null,
});

const PlaybackSessionsSchema = defineComponent({
  name: "PlaybackSessions",
  description:
    "Active playback/transcode sessions with progress bars and stream details (Emby/Jellyfin active streams). " +
    "Pass items with image, label, subtitle, progress, meta.mode. For a static poster grid use ArtworkWall.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

const SecurityPostureSchema = defineComponent({
  name: "SecurityPosture",
  description:
    "Security overview: a metrics summary row plus a state-colored item grid (Wazuh alerts by severity, fail2ban, posture). " +
    "Pass metrics for counts and items for the grid (each item colored by state). For a feed of alerts use EventStream.",
  props: z.object({ ...baseSchemaFields, metrics: z.array(MetricSchema), items: z.array(ItemSchema) }),
  component: null,
});

const HeatmapSchema = defineComponent({
  name: "Heatmap",
  description:
    "Grid/matrix of state-colored cells for density or posture overviews (activity by day, coverage map). " +
    "Pass items mapped to cells, colored by state. For proportional shares use Donut. For numeric trends use LineChart.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

const MarkdownReaderSchema = defineComponent({
  name: "MarkdownReader",
  description:
    "Rendered markdown document with a table-of-contents sidebar and a backlinks sidebar (wiki notes, runbooks, docs). " +
    "Pass markdown text plus items for backlinks. For a list of documents use VisualTable.",
  props: z.object({ ...baseSchemaFields, markdown: z.string(), items: z.array(ItemSchema).optional() }),
  component: null,
});

const KnowledgeGraphSchema = defineComponent({
  name: "KnowledgeGraph",
  description:
    "Concept/relationship graph for knowledge bases — nodes as concepts, edges as relationships, with an optional path strip. " +
    "Pass nodes and edges. Pass path=true to show the first 5 nodes as a relationship chain. " +
    "For service topology use NodeGraph.",
  props: z.object({ ...baseSchemaFields, nodes: z.array(NodeSchema), edges: z.array(EdgeSchema), path: z.boolean().optional() }),
  component: null,
});

const BacklinksSchema = defineComponent({
  name: "Backlinks",
  description:
    "List of documents/notes that reference a concept, with an evidence count. " +
    "Pass items where meta.evidence is the count. For the document itself use MarkdownReader.",
  props: z.object({ ...baseSchemaFields, items: z.array(ItemSchema) }),
  component: null,
});

const CalloutSchema = defineComponent({
  name: "Callout",
  description:
    "Highlighted alert or summary banner with a headline, supporting text, and optional metrics row. " +
    "Use for warnings, status summaries, or single-point attention. For an interactive feed use EventStream.",
  props: z.object({ ...baseSchemaFields, summary: z.string().optional(), metrics: z.array(MetricSchema).optional() }),
  component: null,
});

const EmptyStateSchema = defineComponent({
  name: "EmptyState",
  description:
    "Explicit placeholder panel shown when no data is available or no component matches the request. " +
    "Use sparingly — prefer a real component with its own no-data state. state drives the message.",
  props: z.object({ title: z.string().optional(), state: VisualStateSchema.optional(), summary: z.string().optional() }),
  component: null,
});

export const serverComponents = [
  MetricStripSchema, GaugeSchema, DonutSchema, LineChartSchema, MultiLineSchema, BarRankSchema,
  TimelineSchema, EventStreamSchema, LogStreamSchema, NodeGraphSchema, SankeySchema, KanbanSchema,
  VisualTableSchema, ArtworkWallSchema, PlaybackSessionsSchema, CapacitySchema, SecurityPostureSchema,
  HeatmapSchema, MarkdownReaderSchema, KnowledgeGraphSchema, BacklinksSchema, DetailPanelSchema,
  CalloutSchema, EmptyStateSchema,
  FilterDropdownSchema, SectionSchema,
];
