/**
 * Server-safe Zod schemas and component definitions for the homelab visuals.
 *
 * Extracted from src/visual/components/index.tsx so that prompt generation
 * (server-side) can use the exact same schemas without importing React.
 * Uses @openuidev/lang-core's defineComponent (React-free) with component:null.
 *
 * The client-side renderers in src/visual/components/index.tsx import these
 * same schemas and attach real React renderers.
 */
import { z } from "zod";
import { defineComponent, tagSchemaId, markReactive } from "@openuidev/lang-core";

// ── Shared schemas (tagged so signatures stay short) ──────────

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
tagSchemaId(VisualStateSchema, "VisualState");

export const MetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.number().optional(),
  state: VisualStateSchema.optional(),
});
tagSchemaId(MetricSchema, "Metric");

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
tagSchemaId(ItemSchema, "Item");

export const SeriesSchema = z.object({
  name: z.string(),
  unit: z.string().optional(),
  points: z.array(
    z.object({ x: z.union([z.string(), z.number()]), y: z.number() }),
  ),
});
tagSchemaId(SeriesSchema, "Series");

export const EventSchema = z.object({
  id: z.string(),
  at: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  image: z.string().optional(),
  state: VisualStateSchema.optional(),
});
tagSchemaId(EventSchema, "Event");

export const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  state: VisualStateSchema.optional(),
  value: z.number().optional(),
});
tagSchemaId(NodeSchema, "Node");

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  value: z.number().optional(),
  state: VisualStateSchema.optional(),
});
tagSchemaId(EdgeSchema, "Edge");

// ── Component definitions (schema + description, no renderer) ──
// These use component:null — lang-core accepts this for prompt generation.
// The client library (src/visual/components) re-defines them WITH renderers.

const baseFields = {
  title: z.string().optional(),
  subtitle: z.string().optional(),
  state: VisualStateSchema.optional(),
};

export const MetricStripSchema = defineComponent({
  name: "MetricStrip",
  props: z.object({ ...baseFields, metrics: z.array(MetricSchema) }),
  description:
    "Compact row of KPI values (up to 6). Use for scalar counts and summaries: CPU %, memory, request rate, active users. " +
    "Each metric shows label, value, optional unit, and a trend arrow. " +
    "Choose this over Gauge when there are multiple independent numbers. " +
    "Choose Gauge when there is ONE bounded number (e.g. disk fill %).",
  component: null as never,
});

export const GaugeSchema = defineComponent({
  name: "Gauge",
  props: z.object({
    ...baseFields,
    value: z.number(),
    max: z.number().optional(),
    unit: z.string().optional(),
    thresholds: z.object({ warning: z.number(), critical: z.number() }).optional(),
  }),
  description:
    "Single-value radial gauge for ONE bounded metric (disk fill %, CPU %, memory %). " +
    "Use when there is one number with a known maximum. For an unbounded single number use MetricStrip. " +
    "thresholds color the arc: at/above warning = amber, at/above critical = red. " +
    "Default max is 100 (percentage). Set max for non-percentage gauges.",
  component: null as never,
});

export const DonutSchema = defineComponent({
  name: "Donut",
  props: z.object({
    ...baseFields,
    segments: z.array(z.object({ label: z.string(), value: z.number(), color: z.string().optional() })),
  }),
  description:
    "Distribution donut chart showing proportional segments of a whole (e.g. storage by type, traffic by source). " +
    "Each segment has a label, value (numeric), and optional color. " +
    "Choose over BarRank when proportions matter more than ranking. " +
    "Choose Capacity when there is a single used/available split.",
  component: null as never,
});

export const LineChartSchema = defineComponent({
  name: "LineChart",
  props: z.object({ ...baseFields, series: z.array(SeriesSchema) }),
  description:
    "Single-series line chart for time-series data (CPU over time, latency, throughput). " +
    "One Series with {name, unit?, points: [{x,y}]}. " +
    "For multiple overlapping series use MultiLine. " +
    "For ranked horizontal bars use BarRank.",
  component: null as never,
});

export const MultiLineSchema = defineComponent({
  name: "MultiLine",
  props: z.object({ ...baseFields, series: z.array(SeriesSchema) }),
  description:
    "Multi-series line chart for comparing trends across 2–4 metrics over the same axis (e.g. CPU vs memory vs network over time). " +
    "Each Series gets its own colored line. For a single metric use LineChart.",
  component: null as never,
});

export const BarRankSchema = defineComponent({
  name: "BarRank",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Horizontal bar chart ranking items by value (top services by traffic, largest tables by size, most active users). " +
    "Each Item needs {id, label, value}. Up to 12 bars. " +
    "For proportional parts-of-a-whole use Donut. For time-series use LineChart.",
  component: null as never,
});

export const TimelineSchema = defineComponent({
  name: "Timeline",
  props: z.object({ ...baseFields, events: z.array(EventSchema) }),
  description:
    "Vertical event timeline (deployment history, alert chronology, system events). " +
    "Each Event has {id, at (timestamp), title, detail?, state?}. " +
    "Choose over EventStream when temporal ordering is primary. " +
    "EventStream is for high-volume real-time log-like feeds.",
  component: null as never,
});

export const EventStreamSchema = defineComponent({
  name: "EventStream",
  props: z.object({ ...baseFields, events: z.array(EventSchema) }),
  description:
    "High-volume event feed / activity log (CI events, audit trail, live alerts). " +
    "Denser than Timeline — optimized for scanning many entries. " +
    "Use LogStream for raw system logs with severity levels.",
  component: null as never,
});

export const LogStreamSchema = defineComponent({
  name: "LogStream",
  props: z.object({
    ...baseFields,
    entries: z.array(z.object({
      timestamp: z.string(),
      level: z.enum(["debug", "info", "warn", "error", "fatal"]),
      message: z.string(),
      source: z.string().optional(),
    })),
  }),
  description:
    "Raw log output viewer with severity levels (debug, info, warn, error, fatal). " +
    "Each entry: {timestamp, level, message, source?}. " +
    "Use EventStream for higher-level domain events with titles and detail text.",
  component: null as never,
});

export const NodeGraphSchema = defineComponent({
  name: "NodeGraph",
  props: z.object({ ...baseFields, nodes: z.array(NodeSchema), edges: z.array(EdgeSchema) }),
  description:
    "Network topology / dependency graph (service connections, infrastructure topology). " +
    "Nodes need {id, label, x?, y?} (coordinates in a ~800×430 space). Edges need {source, target, label?, value?}. " +
    "Nodes are clickable — clicking a node drills into a detail view for that node. " +
    "For sequential pipeline/flow use Flow. For proportional flow use Sankey.",
  component: null as never,
});

export const SankeySchema = defineComponent({
  name: "Sankey",
  props: z.object({ ...baseFields, nodes: z.array(NodeSchema), edges: z.array(EdgeSchema) }),
  description:
    "Flow diagram showing volume/proportion between stages (request routing, data pipeline flow, cost allocation). " +
    "Nodes appear left-to-right; edge.value encodes flow magnitude. " +
    "Choose over NodeGraph when the quantity flowing between nodes matters. " +
    "Choose Flow for simple sequential steps without branching.",
  component: null as never,
});

export const KanbanSchema = defineComponent({
  name: "Kanban",
  props: z.object({ ...baseFields, items: z.array(ItemSchema), children: z.array(z.any()).optional() }),
  description:
    "Board with columns grouped by item.group (CI stages, deployment statuses, task states). " +
    "Each Item needs {id, label, subtitle?, group}. Items are auto-grouped by their group field. " +
    "Cards are clickable — clicking drills into a detail view for that item. " +
    "Optionally accepts children (nested components rendered below the board). " +
    "Use VisualTable for flat tabular data. Use RoomBoard for physical topology.",
  component: null as never,
});

export const VisualTableSchema = defineComponent({
  name: "VisualTable",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Tabular list of records (containers, devices, adapters, configs). " +
    "Each Item shows {label, subtitle, value, state}. Rows are clickable — clicking a row " +
    "drills into a detail view for that entity. " +
    "Use LogStream for raw logs. Use BarRank for ranked numeric comparison. " +
    "Use DetailPanel for a single entity's key-value details.",
  component: null as never,
});

export const ArtworkWallSchema = defineComponent({
  name: "ArtworkWall",
  props: z.object({ ...baseFields, items: z.array(ItemSchema), square: z.boolean().optional() }),
  description:
    "Grid of poster/cover art (movie library, album wall, image gallery). " +
    "Each Item needs {id, label, subtitle?, image? (URL), progress?}. " +
    "Set square=true for album covers / square thumbnails. " +
    "Use PlaybackSessions for currently-playing media with stream details.",
  component: null as never,
});

export const PlaybackSessionsSchema = defineComponent({
  name: "PlaybackSessions",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Active media streams / playback sessions (Emby/Jellyfin/Plex current plays). " +
    "Each Item: {id, label (title), subtitle (client), image? (thumbnail), progress? (0–1), meta: {mode: 'direct'|'transcode'}}. " +
    "Use ArtworkWall for a static library browse view.",
  component: null as never,
});

export const CapacitySchema = defineComponent({
  name: "Capacity",
  props: z.object({ ...baseFields, metrics: z.array(MetricSchema), series: z.array(SeriesSchema).optional() }),
  description:
    "Storage / resource capacity view: a conic-gradient donut showing used% plus supporting metrics and optional trend chart. " +
    "The first metric's value becomes the donut percentage. " +
    "Choose over Gauge when you want the fill ring + supporting detail together. " +
    "Choose Gauge for a standalone single metric.",
  component: null as never,
});

export const SecurityPostureSchema = defineComponent({
  name: "SecurityPosture",
  props: z.object({ ...baseFields, items: z.array(ItemSchema), metrics: z.array(MetricSchema).optional() }),
  description:
    "Security posture matrix / vulnerability overview (Wazuh alerts, firewall rules, certificate status). " +
    "Items shown as a grid of status cells with state-colored indicators. " +
    "Each Item: {id, label, subtitle?, state}. " +
    "Use VisualTable for flat security event lists.",
  component: null as never,
});

export const MarkdownReaderSchema = defineComponent({
  name: "MarkdownReader",
  props: z.object({ ...baseFields, markdown: z.string(), items: z.array(ItemSchema).optional() }),
  description:
    "Rendered markdown document with a table of contents sidebar and optional backlinks. " +
    "The markdown prop is rendered as headings, paragraphs, and code blocks. " +
    "items[] optionally populates the backlinks sidebar. " +
    "Use Callout for short alert text, not full documents.",
  component: null as never,
});

export const KnowledgeGraphSchema = defineComponent({
  name: "KnowledgeGraph",
  props: z.object({ ...baseFields, nodes: z.array(NodeSchema), edges: z.array(EdgeSchema) }),
  description:
    "Wiki/knowledge graph showing connected notes and concepts with relationships. " +
    "Same shape as NodeGraph but styled for knowledge bases with larger text labels. " +
    "Use Backlinks for a simple list of linking notes.",
  component: null as never,
});

export const BacklinksSchema = defineComponent({
  name: "Backlinks",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "List of notes/documents that link to the current topic, with context. " +
    "Each Item: {id, label, subtitle? (context), meta: {evidence?: number}}. " +
    "Use KnowledgeGraph for a visual graph view.",
  component: null as never,
});

export const DetailPanelSchema = defineComponent({
  name: "DetailPanel",
  props: z.object({ ...baseFields, metrics: z.array(MetricSchema), summary: z.string().optional(), children: z.array(z.any()).optional() }),
  description:
    "Single-entity detail view showing labeled key-value pairs (one device, one container, one service). " +
    "Metrics render as label/value rows. summary renders as a callout paragraph. " +
    "Optionally accepts children (nested components rendered below the metrics, e.g. a chart or table). " +
    "Use MetricStrip for dashboard KPI rows. Use DetailPanel when drilling into one entity.",
  component: null as never,
});

export const CalloutSchema = defineComponent({
  name: "Callout",
  props: z.object({
    title: z.string().optional(),
    state: VisualStateSchema.optional(),
    summary: z.string(),
    metrics: z.array(MetricSchema).optional(),
  }),
  description:
    "Alert / attention callout for warnings, status summaries, or important notes. " +
    "summary is the main text. state colors the border (warning=amber, critical=red). " +
    "Use MarkdownReader for full documents. Use MetricStrip for data without narrative.",
  component: null as never,
});

export const EmptyStateSchema = defineComponent({
  name: "EmptyState",
  props: z.object({
    title: z.string().optional(),
    state: VisualStateSchema.optional(),
    summary: z.string(),
  }),
  description:
    "Explicit empty / placeholder state with a message. " +
    "Use when a query returned no results or a feature is not configured. " +
    "Do NOT use to hide missing data — use it to communicate absence honestly.",
  component: null as never,
});

export const ScatterSchema = defineComponent({
  name: "Scatter",
  props: z.object({
    ...baseFields,
    points: z.array(z.object({
      x: z.number(),
      y: z.number(),
      label: z.string().optional(),
      size: z.number().optional(),
      state: VisualStateSchema.optional(),
    })),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
  }),
  description:
    "Scatter plot showing correlation between two numeric variables (latency vs throughput, request count vs error rate, cost vs tokens). " +
    "Each point is {x, y, label?, size?, state?}. size scales the dot radius (bubble effect). " +
    "Choose over LineChart when individual observations matter more than a trend line. " +
    "Choose Heatmap when both axes are categorical bins rather than continuous numbers.",
  component: null as never,
});

export const HeatmapSchema = defineComponent({
  name: "Heatmap",
  props: z.object({
    ...baseFields,
    rows: z.array(z.string()),
    cols: z.array(z.string()),
    cells: z.array(z.object({
      row: z.number().int(),
      col: z.number().int(),
      value: z.number(),
      state: VisualStateSchema.optional(),
    })),
    valueLabel: z.string().optional(),
  }),
  description:
    "Grid heatmap showing intensity of a value across two categorical axes (request latency by hour×day, error rate by service×endpoint, CI failure by runner×stage). " +
    "rows[] and cols[] are the axis labels. cells[] has {row (index), col (index), value, state?}. " +
    "Cell color intensity is driven by value (higher = more saturated) unless state overrides. " +
    "Choose over Scatter when both axes are categories/bins, not continuous numbers. " +
    "Choose over Matrix (SecurityPosture) when the cell encodes a numeric magnitude, not just on/off state.",
  component: null as never,
});

export const RoomBoardSchema = defineComponent({
  name: "RoomBoard",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Physical topology / room-based layout (home automation devices by room, rack layout). " +
    "Items grouped by item.group (room name or rack position). " +
    "Use Kanban for workflow/task boards. Use NodeGraph for logical network topology.",
  component: null as never,
});

export const FlowSchema = defineComponent({
  name: "Flow",
  props: z.object({ ...baseFields, nodes: z.array(NodeSchema) }),
  description:
    "Sequential pipeline / flow diagram (CI/CD stages, request pipeline, data processing steps). " +
    "Nodes rendered left-to-right with connecting arrows. Only the label and value of each node is shown. " +
    "Use Sankey when the magnitude of flow between nodes matters. " +
    "Use NodeGraph for non-sequential / branching topology.",
  component: null as never,
});

// ── Phase 4: Interactivity schemas ───────────────────────────

// FilterDropdown value is reactive so $<name> bindings in Query args re-fetch
// when the selection changes. markReactive is the lang-core equivalent of
// react-lang's reactive() for the server-side (prompt) path.
const FilterValueSchema = z.string().optional();
markReactive(FilterValueSchema);

export const FilterDropdownSchema = defineComponent({
  name: "FilterDropdown",
  props: z.object({
    name: z.string(),
    label: z.string().optional(),
    value: FilterValueSchema,
    options: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
  description:
    "Interactive dropdown filter for narrowing live data. " +
    "Give each FilterDropdown a unique name (the reactive state key), an optional label, a default value, and an options list of {value, label}. " +
    "To make a Query re-fetch when the selection changes, reference $<filterName> inside the Query args, e.g. " +
    "data = Query(\"emby\", {library: $libFilter}, {...}) where libFilter = FilterDropdown(\"libFilter\", {value: \"movies\", options: [...]}). " +
    "Use multiple FilterDropdowns with distinct names for independent filters.",
  component: null as never,
});

// ── Section: generic nesting container (Phase 4 Task 4.3) ─────

export const SectionSchema = defineComponent({
  name: "Section",
  props: z.object({
    ...baseFields,
    children: z.array(z.any()),
  }),
  description:
    "Generic titled container for grouping nested components. " +
    "Renders a surface with an optional title/subtitle, then all children below. " +
    "Use for logical grouping when no specialised container fits: " +
    'Section("Drives", [Gauge(...), Gauge(...)]). ' +
    "Prefer DashboardGrid or Stack for pure layout; use Section when you need a titled wrapper around arbitrary children.",
  component: null as never,
});

// ── Exports ───────────────────────────────────────────────────

export const homelabSchemaComponents = [
  MetricStripSchema, GaugeSchema, DonutSchema, LineChartSchema, MultiLineSchema,
  ScatterSchema, BarRankSchema, HeatmapSchema,
  TimelineSchema, EventStreamSchema, LogStreamSchema, NodeGraphSchema, SankeySchema,
  KanbanSchema, VisualTableSchema, ArtworkWallSchema, PlaybackSessionsSchema,
  CapacitySchema, SecurityPostureSchema, MarkdownReaderSchema, KnowledgeGraphSchema,
  BacklinksSchema, DetailPanelSchema, CalloutSchema, EmptyStateSchema, RoomBoardSchema, FlowSchema,
  FilterDropdownSchema, SectionSchema,
];

export const homelabGroup = {
  name: "Homelab Visuals",
  components: homelabSchemaComponents.map((c) => c.name),
  notes: [
    "Shared types used in the signatures above:",
    "  VisualState = healthy | warning | critical | offline | stale | loading | empty | denied",
    "  Metric = {label: string, value: string|number, unit?: string, trend?: number, state?: VisualState}",
    "  Item   = {id: string, label: string, subtitle?: string, image?: string, value?: string|number, progress?: 0-1, state?: VisualState, group?: string, meta?: object}",
    "  Series = {name: string, unit?: string, points: {x: string|number, y: number}[]}",
    "  Event  = {id: string, at: string, title: string, detail?: string, image?: string, state?: VisualState}",
    "  Node   = {id: string, label: string, x?: number, y?: number, state?: VisualState, value?: number}",
    "  Edge   = {source: string, target: string, label?: string, value?: number, state?: VisualState}",
    "",
    "Interactivity — filters, drill-down, nesting:",
    "  FilterDropdown — reactive dropdown; bind to a Query by referencing $<filterName> in the Query args so changing the dropdown re-fetches automatically.",
    "    Example: timeRange = FilterDropdown(\"timeRange\", {value: \"24h\", options: [{value:\"1h\",label:\"1 hour\"},{value:\"24h\",label:\"24 hours\"}]})",
    "    Then in the Query: data = Query(\"emby\", {range: $timeRange}, {...}, 60)",
    "  Drill-down: VisualTable, NodeGraph, ArtworkWall, and Kanban are clickable — clicking a row/node/card sends a follow-up message that drills into that entity. No extra wiring needed; just populate the component with items/nodes.",
    "  Nesting: Section, DetailPanel, and Kanban accept a children prop (array of other components) rendered inside them.",
    "    Example: root = Section(\"Storage Detail\", [DetailPanel(diskMetrics), LineChart(diskHistory)])",
    "    Keep nesting shallow (1–2 levels) and purposeful — a detail panel with an embedded chart, a section grouping related gauges.",
  ],
};
