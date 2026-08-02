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
import { defineComponent, tagSchemaId } from "@openuidev/lang-core";
import {
  SurfaceStyleSchema,
  SpanSchema,
  RowSpanSchema,
} from "@/visual/components/surface-style";

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

export const ArtworkLayoutSchema = z.enum(["grid", "rail", "feature"]);

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

/**
 * Props every panel carries, in the SAME ORDER as the renderers in
 * src/visual/components/index.tsx.
 *
 * Order is load-bearing. OpenUI maps generated positional arguments onto props
 * by declaration order, so if this list and the renderer's disagree, every
 * argument lands in the wrong prop. That is exactly what happened: these three
 * were present on the renderers but missing here, so a model-generated
 * `Callout("Disk full", "critical", "…")` was parsed as
 * `surfaceStyle="Disk full", span="critical", rowSpan="…"` and the panel
 * rendered blank. Keep this in sync — `.verify/parity` (see AGENTS.md) fails
 * the build on drift.
 */
const baseFields = {
  surfaceStyle: SurfaceStyleSchema.optional(),
  span: SpanSchema,
  rowSpan: RowSpanSchema,
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
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    value: z.number(),
    max: z.number().optional(),
    unit: z.string().optional(),
    state: VisualStateSchema.optional(),
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
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Board with columns grouped by item.group (CI stages, deployment statuses, task states). " +
    "Each Item needs {id, label, subtitle?, group}. Items are auto-grouped by their group field. " +
    "Use VisualTable for flat tabular data. Use RoomBoard for physical topology.",
  component: null as never,
});

export const VisualTableSchema = defineComponent({
  name: "VisualTable",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Tabular list of records (containers, devices, adapters, configs). " +
    "Each Item shows {label, subtitle, value, state}. Rows are read-only. " +
    "Use LogStream for raw logs. Use BarRank for ranked numeric comparison. " +
    "Use DetailPanel for a single entity's key-value details.",
  component: null as never,
});

export const ArtworkWallSchema = defineComponent({
  name: "ArtworkWall",
  props: z.object({ ...baseFields, items: z.array(ItemSchema), square: z.boolean().optional(), layout: ArtworkLayoutSchema.optional() }),
  description:
    "Grid of poster/cover art (movie library, album wall, image gallery). " +
    "Each Item needs {id, label, subtitle?, image? (URL), progress?}. " +
    "Set square=true for album covers / square thumbnails. " +
    "layout='grid' is the responsive default for browsing a library; layout='rail' is a horizontally scrolling recently-added strip; " +
    "layout='feature' spotlights the first item with supporting posters. " +
    "Use PlaybackSessions for currently-playing media with stream details.",
  component: null as never,
});

export const PlaybackSessionsSchema = defineComponent({
  name: "PlaybackSessions",
  props: z.object({ ...baseFields, items: z.array(ItemSchema) }),
  description:
    "Active media streams / playback sessions (Emby/Jellyfin/Plex current plays). " +
    "Each Item: {id, label (title), subtitle? (client), image? (thumbnail), progress? (0–1), meta?: {mode?, client?, device?, user?, quality?, isPaused?, paused?}}. isPaused is the live Emby pause state; paused is a legacy alias. " +
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
  props: z.object({ ...baseFields, metrics: z.array(MetricSchema), summary: z.string().optional() }),
  description:
    "Single-entity detail view showing labeled key-value pairs (one device, one container, one service). " +
    "Metrics render as label/value rows. summary renders as a callout paragraph. " +
    "Use MetricStrip for dashboard KPI rows. Use DetailPanel when drilling into one entity.",
  component: null as never,
});

export const CalloutSchema = defineComponent({
  name: "Callout",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
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
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
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

// ── Exports ───────────────────────────────────────────────────


// ── Interactive + layout components ───────────────────────────
// These were missing from this file entirely, so the prompt never described
// them and the model could not reliably emit them. FilterDropdown is the whole
// of Phase 4's reactive filtering; DashboardGrid is Phase 5's 12-column layout.
// Prop order matches the renderers exactly — see the baseFields note above.

export const FilterDropdownSchema = defineComponent({
  name: "FilterDropdown",
  // Content props first — see the matching note in src/visual/components/index.tsx.
  props: z.object({
    name: z.string(),
    label: z.string().optional(),
    value: z.string().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
  }),
  description:
    "Interactive dropdown filter. name is the $variable to bind — reference it as $<name> in a Query()'s args. " +
    "When the user selects an option, every Query() referencing that $variable re-fetches automatically. " +
    "value is the initial selection (optional). Each option: {value, label}. " +
    "Place inside a Stack at the top of a dashboard to control the panels below.",
  component: null as never,
});

export const SectionSchema = defineComponent({
  name: "Section",
  props: z.object({
    ...baseFields,
    children: z.array(z.any()),
  }),
  description:
    "Grouping container that renders a title and a vertical stack of child panels. " +
    "Use to organize a dashboard into named regions. children accepts a tight set of display components: " +
    "MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall. " +
    "Do NOT nest Section, Kanban, or Stack inside a Section.",
  component: null as never,
});

export const DashboardGridSchema = defineComponent({
  name: "DashboardGrid",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    children: z.array(z.any()),
  }),
  description:
    "12-column responsive grid for multi-panel dashboard layouts. " +
    "Set each CHILD panel's span (1-12) for its width and rowSpan (1-3) for its height — " +
    "span 6 is half width, span 4 a third, span 12 full width. " +
    "Prefer this over Stack whenever panels need specific widths. " +
    "Use Stack for simple vertical stacking, Section for a titled group of panels.",
  component: null as never,
});

export const homelabSchemaComponents = [
  MetricStripSchema, GaugeSchema, DonutSchema, LineChartSchema, MultiLineSchema, BarRankSchema,
  TimelineSchema, EventStreamSchema, LogStreamSchema, NodeGraphSchema, SankeySchema,
  KanbanSchema, VisualTableSchema, ArtworkWallSchema, PlaybackSessionsSchema,
  CapacitySchema, SecurityPostureSchema, MarkdownReaderSchema, KnowledgeGraphSchema,
  BacklinksSchema, DetailPanelSchema, CalloutSchema, EmptyStateSchema, RoomBoardSchema, FlowSchema,
  FilterDropdownSchema, SectionSchema, DashboardGridSchema,
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
  ],
};
