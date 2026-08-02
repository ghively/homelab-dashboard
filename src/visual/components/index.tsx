/**
 * Homelab Visual Components — narrow-schema set for OpenUI generative UI.
 *
 * Replaces the 905-name manifest approach. Each component has a narrow Zod
 * schema (only the props it actually renders), a description that is prompt
 * text (states what it is, what non-obvious props do, and when to choose it
 * over a similar component), and a renderer that shows NoData states honestly
 * when data is absent.
 *
 * NOTE: intentionally no "use client" here. This module is imported by both
 * the server-side chat route (for library.prompt()) and the client-side
 * <Renderer>. The defineComponent() calls and Zod schemas are server-safe;
 * the React render functions are closures that are only invoked on the client
 * by <Renderer>. Adding "use client" would stub the exports on the server,
 * breaking prompt generation.
 */

import React from "react";
import { z } from "zod";
import {
  defineComponent,
  reactive,
  tagSchemaId,
  useStateField,
  useTriggerAction,
  type ComponentRenderProps,
} from "@openuidev/react-lang";
import {
  SurfaceStyleSchema,
  SpanSchema,
  RowSpanSchema,
  surfaceClass,
  type GridSpan,
  type SurfaceExtras,
  type SurfaceStyle,
} from "./surface-style";
import "../cyber-noir-visual-components-v4.css";

// ── Shared schemas (tagged so signatures stay short) ──────────

const VisualStateSchema = z.enum([
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

const MetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.number().optional(),
  state: VisualStateSchema.optional(),
});
tagSchemaId(MetricSchema, "Metric");

const ItemSchema = z.object({
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

const SeriesSchema = z.object({
  name: z.string(),
  unit: z.string().optional(),
  points: z.array(
    z.object({ x: z.union([z.string(), z.number()]), y: z.number() }),
  ),
});
tagSchemaId(SeriesSchema, "Series");

const EventSchema = z.object({
  id: z.string(),
  at: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  image: z.string().optional(),
  state: VisualStateSchema.optional(),
});
tagSchemaId(EventSchema, "Event");

const NodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  state: VisualStateSchema.optional(),
  value: z.number().optional(),
});
tagSchemaId(NodeSchema, "Node");

const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  value: z.number().optional(),
  state: VisualStateSchema.optional(),
});
tagSchemaId(EdgeSchema, "Edge");

// ── Helper components ─────────────────────────────────────────

/**
 * The panel chrome every visual component renders inside.
 *
 * Exported because the dashboard shell needs it too. Plan Task 5.2 called for
 * deleting the duplicate `VisualPanel`/`MetricStrip` in
 * src/components/dashboard.tsx and importing these instead; that task was
 * skipped, so the shell kept rendering its own older copies and none of the
 * Phase 5 surface treatment reached the pages you actually navigate.
 *
 * `badge` is an optional slot rendered before the state pill — the shell uses
 * it to mark a panel as sample data.
 */
export function Surface({
  title,
  subtitle,
  state = "healthy",
  surfaceStyle,
  gridSpan,
  badge,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  state?: string;
  surfaceStyle?: SurfaceStyle | undefined;
  gridSpan?: GridSpan | undefined;
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${surfaceClass(state, surfaceStyle, gridSpan)}${className ? ` ${className}` : ""}`}>
      <header className="cnv-head">
        {/* Traffic-light dots, per the design system's Window Header component.
            Decorative only — the panel is not a real window — so they are
            aria-hidden and carry no controls. */}
        <div className="cnv-dots" aria-hidden="true">
          <i className="cnv-dot cnv-dot-r" />
          <i className="cnv-dot cnv-dot-y" />
          <i className="cnv-dot cnv-dot-g" />
        </div>
        <div className="cnv-head-title">
          <h3>{title}</h3>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <div className="cnv-badges">
          {badge}
          <span className="cnv-badge">{state}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * The KPI row. Extracted so MetricStrip and the dashboard shell render the
 * exact same markup instead of maintaining two copies that drift.
 */
export function Metrics({
  metrics,
}: {
  metrics: Array<{ label: string; value: string | number; unit?: string; trend?: number }>;
}) {
  return (
    <div className="cnv-metrics">
      {metrics.slice(0, 6).map((m, i) => {
        // The cyber-noir dashboard theme shows a gradient fill track under any
        // bounded value. Derived from unit === "%" rather than added as a prop,
        // so this costs nothing in the prompt and needs no schema change.
        const pct =
          m.unit === "%" && typeof m.value === "number"
            ? Math.max(0, Math.min(100, m.value))
            : null;
        return (
          <article key={i}>
            <small>{m.label}</small>
            <strong>
              {m.value}
              {m.unit}
            </strong>
            {m.trend != null && (
              <span>
                {m.trend > 0 ? "↗" : "↘"} {Math.abs(m.trend)}%
              </span>
            )}
            {pct !== null && (
              <div className="cnv-track" aria-hidden="true">
                <i style={{ width: pct + "%" }} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function NoData({ label = "No data" }: { label?: string }) {
  return (
    <div className="cnv-state-nodata">
      <strong>{label}</strong>
    </div>
  );
}

// ── 1. MetricStrip ────────────────────────────────────────────

export const MetricStrip = defineComponent({
  name: "MetricStrip",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema),
  }),
  description:
    "Compact row of KPI values (up to 6). Use for scalar counts and summaries: CPU %, memory, request rate, active users. " +
    "Each metric shows label, value, optional unit, and a trend arrow. " +
    "Choose this over Gauge when there are multiple independent numbers. " +
    "Choose Gauge when there is ONE bounded number (e.g. disk fill %).",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; metrics: z.infer<typeof MetricSchema>[] } & SurfaceExtras>) => {
    if (!props.metrics?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Metrics"} state={props.state}><NoData label="No metrics" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Metrics"} subtitle={props.subtitle} state={props.state}>
        <Metrics metrics={props.metrics} />
      </Surface>
    );
  },
});

// ── 2. Gauge ──────────────────────────────────────────────────

export const Gauge = defineComponent({
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; value: number; max?: number; unit?: string; state?: string; thresholds?: { warning: number; critical: number } } & SurfaceExtras>) => {
    const v = Number(props.value);
    if (!Number.isFinite(v)) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Gauge"} state={props.state}><NoData label="No gauge value" /></Surface>;
    const max = props.max ?? 100;
    const pct = Math.min(100, Math.max(0, (v / max) * 100));
    const th = props.thresholds;
    let color = "var(--cnv-series-1)";
    if (th) {
      if (pct >= th.critical) color = "#ff5555";
      else if (pct >= th.warning) color = "#ffc266";
    }
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Gauge"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div style={{ background: `conic-gradient(${color} 0 ${pct}%, #2b2f3a ${pct}%)` }}>
            <strong>{v}{props.unit ?? (max === 100 ? "%" : "")}</strong>
          </div>
        </div>
      </Surface>
    );
  },
});

// ── 3. Donut ──────────────────────────────────────────────────

export const Donut = defineComponent({
  name: "Donut",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    segments: z.array(z.object({ label: z.string(), value: z.number(), color: z.string().optional() })),
  }),
  description:
    "Distribution donut chart showing proportional segments of a whole (e.g. storage by type, traffic by source). " +
    "Each segment has a label, value (numeric), and optional color. " +
    "Choose over BarRank when proportions matter more than ranking. " +
    "Choose Capacity when there is a single used/available split.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; segments: { label: string; value: number; color?: string }[] } & SurfaceExtras>) => {
    if (!props.segments?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Distribution"} state={props.state}><NoData label="No distribution data" /></Surface>;
    const total = props.segments.reduce((s, x) => s + Number(x.value) || 0, 0);
    if (total === 0) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Distribution"} state={props.state}><NoData label="Total is zero" /></Surface>;
    const colors = ["var(--cnv-series-1)", "var(--cnv-series-2)", "var(--cnv-series-3)", "var(--cnv-series-4)", "#ff6b6b", "#74b9ff"];
    let acc = 0;
    const stops = props.segments.map((seg, i) => {
      const pct = (Number(seg.value) / total) * 100;
      const start = acc;
      acc += pct;
      return { color: seg.color ?? colors[i % colors.length], start, end: acc, label: seg.label, value: seg.value, pct };
    });
    const grad = stops.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Distribution"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div style={{ background: `conic-gradient(${grad})` }}>
            <strong>{total}</strong>
          </div>
          <section>
            {stops.map((s, i) => (
              <article key={i} style={{ borderColor: s.color }}>
                <small style={{ color: s.color }}>●</small> <strong>{s.label}</strong> <b>{s.value} ({Math.round(s.pct)}%)</b>
              </article>
            ))}
          </section>
        </div>
      </Surface>
    );
  },
});

// ── 4. LineChart ──────────────────────────────────────────────

export const LineChart = defineComponent({
  name: "LineChart",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    series: z.array(SeriesSchema),
  }),
  description:
    "Single-series line chart for time-series data (CPU over time, latency, throughput). " +
    "One Series with {name, unit?, points: [{x,y}]}. " +
    "For multiple overlapping series use MultiLine. " +
    "For ranked horizontal bars use BarRank.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; series: z.infer<typeof SeriesSchema>[] } & SurfaceExtras>) => {
    if (!props.series?.length || !props.series[0]?.points?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Line Chart"} state={props.state}><NoData label="No time-series data" /></Surface>;
    const s = props.series[0];
    const max = Math.max(...s.points.map((p) => p.y), 1);
    const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? s.name} subtitle={props.subtitle} state={props.state}>
        <svg className="cnv-chart" viewBox="0 0 640 220" role="img">
          <path d={d} fill="none" stroke="var(--cnv-series-1)" strokeWidth="3" />
        </svg>
      </Surface>
    );
  },
});

// ── 5. MultiLine ──────────────────────────────────────────────

export const MultiLine = defineComponent({
  name: "MultiLine",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    series: z.array(SeriesSchema),
  }),
  description:
    "Multi-series line chart for comparing trends across 2–4 metrics over the same axis (e.g. CPU vs memory vs network over time). " +
    "Each Series gets its own colored line. For a single metric use LineChart.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; series: z.infer<typeof SeriesSchema>[] } & SurfaceExtras>) => {
    if (!props.series?.length || props.series.every((s) => !s.points?.length)) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Multi-Line"} state={props.state}><NoData label="No time-series data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Multi-Line"} subtitle={props.subtitle} state={props.state}>
        <svg className="cnv-chart" viewBox="0 0 640 220" role="img">
          {props.series.slice(0, 4).map((s, si) => {
            if (!s.points?.length) return null;
            const max = Math.max(...s.points.map((p) => p.y), 1);
            const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
            return <path key={s.name} d={d} fill="none" stroke={`var(--cnv-series-${si + 1})`} strokeWidth="3" />;
          })}
        </svg>
        <div className="cnv-metrics">
          {props.series.map((s, i) => <article key={i}><small style={{ color: `var(--cnv-series-${i + 1})` }}>●</small> <strong>{s.name}</strong></article>)}
        </div>
      </Surface>
    );
  },
});

// ── 6. BarRank ────────────────────────────────────────────────

export const BarRank = defineComponent({
  name: "BarRank",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Horizontal bar chart ranking items by value (top services by traffic, largest tables by size, most active users). " +
    "Each Item needs {id, label, value}. Up to 12 bars. " +
    "For proportional parts-of-a-whole use Donut. For time-series use LineChart.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) => {
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Bar Rank"} state={props.state}><NoData label="No data to rank" /></Surface>;
    const items = props.items;
    const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Bar Rank"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-bars">
          {items.slice(0, 12).map((i) => (
            <article key={i.id}>
              <label>{i.label}</label>
              <div><i style={{ width: `${((Number(i.value) || 0) / max) * 100}%` }} /></div>
              <b>{i.value}</b>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 7. Timeline ───────────────────────────────────────────────

export const Timeline = defineComponent({
  name: "Timeline",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    events: z.array(EventSchema),
  }),
  description:
    "Vertical event timeline (deployment history, alert chronology, system events). " +
    "Each Event has {id, at (timestamp), title, detail?, state?}. " +
    "Choose over EventStream when temporal ordering is primary. " +
    "EventStream is for high-volume real-time log-like feeds.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; events: z.infer<typeof EventSchema>[] } & SurfaceExtras>) => {
    if (!props.events?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Timeline"} state={props.state}><NoData label="No events" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Timeline"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-timeline">
          {props.events.map((e) => (
            <article key={e.id}>
              <time>{e.at}</time>
              <i />
              <div><strong>{e.title}</strong><small>{e.detail}</small></div>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 8. EventStream ────────────────────────────────────────────

export const EventStream = defineComponent({
  name: "EventStream",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    events: z.array(EventSchema),
  }),
  description:
    "High-volume event feed / activity log (CI events, audit trail, live alerts). " +
    "Denser than Timeline — optimized for scanning many entries. " +
    "Use LogStream for raw system logs with severity levels.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; events: z.infer<typeof EventSchema>[] } & SurfaceExtras>) => {
    if (!props.events?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Event Stream"} state={props.state}><NoData label="No events" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Event Stream"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-timeline">
          {props.events.slice(0, 30).map((e) => (
            <article key={e.id} className={`state-${e.state ?? "healthy"}`}>
              <time>{e.at}</time>
              <i />
              <div><strong>{e.title}</strong><small>{e.detail}</small></div>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 9. LogStream ──────────────────────────────────────────────

export const LogStream = defineComponent({
  name: "LogStream",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; entries: { timestamp: string; level: string; message: string; source?: string }[] } & SurfaceExtras>) => {
    if (!props.entries?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Log Stream"} state={props.state}><NoData label="No log entries" /></Surface>;
    const colors: Record<string, string> = { error: "#ff5555", fatal: "#ff5555", warn: "#ffc266", info: "var(--cnv-series-1)", debug: "var(--cnv-muted)" };
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Log Stream"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-table">
          {props.entries.slice(0, 50).map((e, i) => (
            <article key={i} style={{ gridTemplateColumns: "80px 70px 1fr" }}>
              <small style={{ color: "var(--cnv-series-1)" }}>{e.timestamp}</small>
              <b style={{ color: colors[e.level] ?? "var(--cnv-text)" }}>{e.level.toUpperCase()}</b>
              <span>{e.message}{e.source ? ` [${e.source}]` : ""}</span>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 10. NodeGraph ─────────────────────────────────────────────

export const NodeGraph = defineComponent({
  name: "NodeGraph",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  }),
  description:
    "Network topology / dependency graph (service connections, infrastructure topology). " +
    "Nodes need {id, label, x?, y?} (coordinates in a ~800×430 space). Edges need {source, target, label?, value?}. " +
    "Nodes are clickable — clicking one asks for that node's details. " +
    "For sequential pipeline/flow use Flow. For proportional flow use Sankey.",
  component: function NodeGraphView({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[]; edges: z.infer<typeof EdgeSchema>[] } & SurfaceExtras>) {
    const triggerAction = useTriggerAction();
    if (!props.nodes?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Node Graph"} state={props.state}><NoData label="No graph data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Network"} subtitle={props.subtitle} state={props.state}>
        <svg className="cnv-network" viewBox="0 0 800 430" role="img">
          {props.edges.map((e, i) => {
            const a = props.nodes.find((n) => n.id === e.source);
            const b = props.nodes.find((n) => n.id === e.target);
            return a && b ? <line key={i} x1={a.x ?? 0} y1={a.y ?? 0} x2={b.x ?? 0} y2={b.y ?? 0} /> : null;
          })}
          {props.nodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
              className="cnv-clickable"
              onClick={() => triggerAction(`Show details for ${n.label}`)}
            >
              <circle r="34" />
              <text textAnchor="middle" y="5">{n.label}</text>
            </g>
          ))}
        </svg>
      </Surface>
    );
  },
});

// ── 11. Sankey ────────────────────────────────────────────────

export const Sankey = defineComponent({
  name: "Sankey",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  }),
  description:
    "Flow diagram showing volume/proportion between stages (request routing, data pipeline flow, cost allocation). " +
    "Nodes appear left-to-right; edge.value encodes flow magnitude. " +
    "Choose over NodeGraph when the quantity flowing between nodes matters. " +
    "Choose Flow for simple sequential steps without branching.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[]; edges: z.infer<typeof EdgeSchema>[] } & SurfaceExtras>) => {
    if (!props.nodes?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Flow"} state={props.state}><NoData label="No flow data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Flow"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-flow">
          {props.nodes.slice(0, 8).map((n, i) => (
            <React.Fragment key={n.id}>
              <article><strong>{n.label}</strong><small>{n.value}</small></article>
              {i < props.nodes.length - 1 && <i />}
            </React.Fragment>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 12. Kanban ────────────────────────────────────────────────

export const Kanban = defineComponent({
  name: "Kanban",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Board with columns grouped by item.group (CI stages, deployment statuses, task states). " +
    "Each Item needs {id, label, subtitle?, group}. Items are auto-grouped by their group field. " +
    "Cards are clickable — clicking one asks for that item's details. " +
    "Use VisualTable for flat tabular data. Use RoomBoard for physical topology.",
  component: function KanbanView({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) {
    const triggerAction = useTriggerAction();
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Board"} state={props.state}><NoData label="No items" /></Surface>;
    const groups = [...new Set(props.items.map((i) => i.group || "Active"))];
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Board"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-board">
          {groups.map((g) => (
            <section key={g}>
              <h4>{g}</h4>
              {props.items.filter((i) => (i.group || "Active") === g).map((i) => (
                <article
                  key={i.id}
                  className="cnv-clickable"
                  onClick={() => triggerAction(`Show details for ${i.label}`)}
                ><strong>{i.label}</strong><small>{i.subtitle}</small></article>
              ))}
            </section>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 13. VisualTable ───────────────────────────────────────────

export const VisualTable = defineComponent({
  name: "VisualTable",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Tabular list of records (containers, devices, adapters, configs). " +
    "Each Item shows {label, subtitle, value, state}. Rows are clickable — clicking one " +
    "sends a follow-up asking for that entity's details; respond with a DetailPanel. " +
    "Use LogStream for raw logs. Use BarRank for ranked numeric comparison. " +
    "Use DetailPanel for a single entity's key-value details.",
  component: function VisualTableView({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) {
    const triggerAction = useTriggerAction();
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Table"} state={props.state}><NoData label="No rows" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Table"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-table">
          {props.items.map((i) => (
            <article
              key={i.id}
              className="cnv-clickable"
              onClick={() => triggerAction(`Show details for ${i.label}`)}
            >
              <strong>{i.label}</strong>
              <small>{i.subtitle}</small>
              <span>{i.state ?? "healthy"}</span>
              <b>{i.value}</b>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 14. ArtworkWall ───────────────────────────────────────────

export const ArtworkWall = defineComponent({
  name: "ArtworkWall",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
    square: z.boolean().optional(),
  }),
  description:
    "Grid of poster/cover art (movie library, album wall, image gallery). " +
    "Each Item needs {id, label, subtitle?, image? (URL), progress?}. " +
    "Set square=true for album covers / square thumbnails. " +
    "Items are clickable — clicking one asks for that title's details. " +
    "Use PlaybackSessions for currently-playing media with stream details.",
  component: function ArtworkWallView({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[]; square?: boolean } & SurfaceExtras>) {
    const triggerAction = useTriggerAction();
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Gallery"} state={props.state}><NoData label="No items" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Gallery"} subtitle={props.subtitle} state={props.state}>
        <div className={props.square ? "cnv-albums" : "cnv-posters"}>
          {props.items.slice(0, 18).map((i) => (
            <article
              key={i.id}
              className="cnv-clickable"
              onClick={() => triggerAction(`Show details for ${i.label}`)}
            >
              <div className="cnv-art" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined}>
                <b>{i.label}</b>
              </div>
              <strong>{i.label}</strong>
              <small>{i.subtitle}</small>
              {i.progress != null && <i style={{ width: `${i.progress * 100}%` }} />}
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 15. PlaybackSessions ──────────────────────────────────────

export const PlaybackSessions = defineComponent({
  name: "PlaybackSessions",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Active media streams / playback sessions (Emby/Jellyfin/Plex current plays). " +
    "Each Item: {id, label (title), subtitle (client), image? (thumbnail), progress? (0–1), meta: {mode: 'direct'|'transcode'}}. " +
    "Use ArtworkWall for a static library browse view.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) => {
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Active Sessions"} state={props.state}><NoData label="No active sessions" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Active Sessions"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-playback">
          {props.items.slice(0, 8).map((i) => (
            <article key={i.id}>
              <div className="cnv-art" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined} />
              <div>
                <strong>{i.label}</strong>
                <small>{i.subtitle}</small>
                {i.progress != null && (
                  <div className="cnv-progress"><i style={{ width: `${i.progress * 100}%` }} /></div>
                )}
              </div>
              <span>{String(i.meta?.mode ?? "direct")}</span>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 16. Capacity ──────────────────────────────────────────────

export const Capacity = defineComponent({
  name: "Capacity",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema),
    series: z.array(SeriesSchema).optional(),
  }),
  description:
    "Storage / resource capacity view: a conic-gradient donut showing used% plus supporting metrics and optional trend chart. " +
    "The first metric's value becomes the donut percentage. " +
    "Choose over Gauge when you want the fill ring + supporting detail together. " +
    "Choose Gauge for a standalone single metric.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; metrics: z.infer<typeof MetricSchema>[]; series?: z.infer<typeof SeriesSchema>[] } & SurfaceExtras>) => {
    if (!props.metrics?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Capacity"} state={props.state}><NoData label="No capacity data" /></Surface>;
    const used = Number(props.metrics[0].value);
    if (!Number.isFinite(used)) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Capacity"} state={props.state}><NoData label="No capacity data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Capacity"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div style={{ background: `conic-gradient(var(--cnv-series-1) 0 ${used}%, #2b2f3a ${used}%)` }}>
            <strong>{used}%</strong>
          </div>
          <section>
            <div className="cnv-metrics">
              {props.metrics.slice(0, 6).map((m, i) => (
                <article key={i}><small>{m.label}</small><strong>{m.value}{m.unit}</strong></article>
              ))}
            </div>
            {props.series && props.series.length > 0 && props.series[0].points?.length > 0 && (
              <svg className="cnv-chart" viewBox="0 0 640 220" role="img">
                {(() => {
                  const s = props.series![0];
                  const max = Math.max(...s.points.map((p) => p.y), 1);
                  const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
                  return <path d={d} fill="none" stroke="var(--cnv-series-1)" strokeWidth="3" />;
                })()}
              </svg>
            )}
          </section>
        </div>
      </Surface>
    );
  },
});

// ── 17. SecurityPosture ───────────────────────────────────────

export const SecurityPosture = defineComponent({
  name: "SecurityPosture",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
    metrics: z.array(MetricSchema).optional(),
  }),
  description:
    "Security posture matrix / vulnerability overview (Wazuh alerts, firewall rules, certificate status). " +
    "Items shown as a grid of status cells with state-colored indicators. " +
    "Each Item: {id, label, subtitle?, state}. " +
    "Use VisualTable for flat security event lists.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[]; metrics?: z.infer<typeof MetricSchema>[] } & SurfaceExtras>) => {
    if (!props.items?.length && !props.metrics?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Security"} state={props.state}><NoData label="No security data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Security Posture"} subtitle={props.subtitle} state={props.state}>
        {props.metrics && props.metrics.length > 0 && (
          <div className="cnv-metrics">
            {props.metrics.slice(0, 6).map((m, i) => (
              <article key={i}><small>{m.label}</small><strong>{m.value}{m.unit}</strong></article>
            ))}
          </div>
        )}
        <div className="cnv-matrix">
          {(props.items ?? []).map((i) => (
            <article key={i.id} data-state={i.state}>
              <i /><strong>{i.label}</strong><small>{i.subtitle}</small>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 18. MarkdownReader ────────────────────────────────────────

export const MarkdownReader = defineComponent({
  name: "MarkdownReader",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    markdown: z.string(),
    items: z.array(ItemSchema).optional(),
  }),
  description:
    "Rendered markdown document with a table of contents sidebar and optional backlinks. " +
    "The markdown prop is rendered as headings, paragraphs, and code blocks. " +
    "items[] optionally populates the backlinks sidebar. " +
    "Use Callout for short alert text, not full documents.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; markdown: string; items?: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) => {
    const md = props.markdown || "## No content\nNo markdown provided.";
    const lines = md.split("\n");
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Document"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-knowledge-reader">
          <aside>
            <strong>On this page</strong>
            {lines.filter((x) => x.startsWith("##")).map((x, i) => <a key={i}>{x.replace(/^#+\s*/, "")}</a>)}
          </aside>
          <article>
            {lines.map((x, i) =>
              x.startsWith("##") ? <h2 key={i}>{x.replace(/^#+\s*/, "")}</h2> :
              x.startsWith("```") ? null :
              x.trim() ? <p key={i}>{x.replace(/\*\*/g, "")}</p> : null
            )}
          </article>
          {props.items && props.items.length > 0 && (
            <aside>
              <strong>Backlinks</strong>
              {props.items.slice(0, 5).map((i) => <a key={i.id}>{i.label}</a>)}
            </aside>
          )}
        </div>
      </Surface>
    );
  },
});

// ── 19. KnowledgeGraph ────────────────────────────────────────

export const KnowledgeGraph = defineComponent({
  name: "KnowledgeGraph",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  }),
  description:
    "Wiki/knowledge graph showing connected notes and concepts with relationships. " +
    "Same shape as NodeGraph but styled for knowledge bases with larger text labels. " +
    "Use Backlinks for a simple list of linking notes.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[]; edges: z.infer<typeof EdgeSchema>[] } & SurfaceExtras>) => {
    if (!props.nodes?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Knowledge Graph"} state={props.state}><NoData label="No graph data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Knowledge Graph"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-knowledge-graph">
          <svg className="cnv-network" viewBox="0 0 800 430" role="img">
            {props.edges.map((e, i) => {
              const a = props.nodes.find((n) => n.id === e.source);
              const b = props.nodes.find((n) => n.id === e.target);
              return a && b ? <line key={i} x1={a.x ?? 0} y1={a.y ?? 0} x2={b.x ?? 0} y2={b.y ?? 0} /> : null;
            })}
            {props.nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}>
                <circle r="34" />
                <text textAnchor="middle" y="5">{n.label}</text>
              </g>
            ))}
          </svg>
        </div>
      </Surface>
    );
  },
});

// ── 20. Backlinks ─────────────────────────────────────────────

export const Backlinks = defineComponent({
  name: "Backlinks",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "List of notes/documents that link to the current topic, with context. " +
    "Each Item: {id, label, subtitle? (context), meta: {evidence?: number}}. " +
    "Use KnowledgeGraph for a visual graph view.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) => {
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Backlinks"} state={props.state}><NoData label="No backlinks" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Backlinks"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-backlinks">
          {props.items.slice(0, 8).map((i) => (
            <article key={i.id}>
              <strong>{i.label}</strong>
              <small>{i.subtitle ?? "Links to this concept."}</small>
              <span>{Number(i.meta?.evidence ?? 1)} evidence</span>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 21. DetailPanel ───────────────────────────────────────────

export const DetailPanel = defineComponent({
  name: "DetailPanel",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema),
    summary: z.string().optional(),
  }),
  description:
    "Single-entity detail view showing labeled key-value pairs (one device, one container, one service). " +
    "Metrics render as label/value rows. summary renders as a callout paragraph. " +
    "Use MetricStrip for dashboard KPI rows. Use DetailPanel when drilling into one entity.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; metrics: z.infer<typeof MetricSchema>[]; summary?: string } & SurfaceExtras>) => {
    if (!props.metrics?.length && !props.summary) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Details"} state={props.state}><NoData label="No detail data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Details"} subtitle={props.subtitle} state={props.state}>
        {props.summary && (
          <div className="cnv-callout"><p>{props.summary}</p></div>
        )}
        {props.metrics && props.metrics.length > 0 && (
          <div className="cnv-metrics">
            {props.metrics.map((m, i) => (
              <article key={i}><small>{m.label}</small><strong>{m.value}{m.unit}</strong></article>
            ))}
          </div>
        )}
      </Surface>
    );
  },
});

// ── 22. Callout ───────────────────────────────────────────────

export const Callout = defineComponent({
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
  component: ({ props }: ComponentRenderProps<{ title?: string; state?: string; summary: string; metrics?: z.infer<typeof MetricSchema>[] } & SurfaceExtras>) => {
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Notice"} state={props.state}>
        <div className="cnv-callout">
          <strong>{props.summary}</strong>
          {props.metrics && props.metrics.length > 0 && (
            <div className="cnv-metrics">
              {props.metrics.slice(0, 4).map((m, i) => (
                <article key={i}><small>{m.label}</small><strong>{m.value}{m.unit}</strong></article>
              ))}
            </div>
          )}
        </div>
      </Surface>
    );
  },
});

// ── 23. EmptyState ────────────────────────────────────────────

export const EmptyState = defineComponent({
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
  component: ({ props }: ComponentRenderProps<{ title?: string; state?: string; summary: string } & SurfaceExtras>) => {
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Empty"} state={props.state ?? "empty"}>
        <div className="cnv-state"><strong>{props.summary}</strong></div>
      </Surface>
    );
  },
});

// ── 24. RoomBoard ─────────────────────────────────────────────

export const RoomBoard = defineComponent({
  name: "RoomBoard",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Physical topology / room-based layout (home automation devices by room, rack layout). " +
    "Items grouped by item.group (room name or rack position). " +
    "Use Kanban for workflow/task boards. Use NodeGraph for logical network topology.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] } & SurfaceExtras>) => {
    if (!props.items?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Topology"} state={props.state}><NoData label="No topology data" /></Surface>;
    const groups = [...new Set(props.items.map((i) => i.group || "Default"))];
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Topology"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-board">
          {groups.map((g) => (
            <section key={g}>
              <h4>{g}</h4>
              {props.items.filter((i) => (i.group || "Default") === g).map((i) => (
                <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle}</small></article>
              ))}
            </section>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 25. Flow ──────────────────────────────────────────────────

export const Flow = defineComponent({
  name: "Flow",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
  }),
  description:
    "Sequential pipeline / flow diagram (CI/CD stages, request pipeline, data processing steps). " +
    "Nodes rendered left-to-right with connecting arrows. Only the label and value of each node is shown. " +
    "Use Sankey when the magnitude of flow between nodes matters. " +
    "Use NodeGraph for non-sequential / branching topology.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[] } & SurfaceExtras>) => {
    if (!props.nodes?.length) return <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Flow"} state={props.state}><NoData label="No flow data" /></Surface>;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Flow"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-flow">
          {props.nodes.slice(0, 8).map((n, i) => (
            <React.Fragment key={n.id}>
              <article><strong>{n.label}</strong><small>{n.value}</small></article>
              {i < props.nodes.length - 1 && <i />}
            </React.Fragment>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── Exports ───────────────────────────────────────────────────

// ── FilterDropdown — reactive filter that re-runs queries ────────────────────
// The `reactive()` marker is what lets a $variable bind here; useStateField
// writes back to the store, which re-evaluates every Query() referencing it.
export const FilterDropdown = defineComponent({
  name: "FilterDropdown",
  // Content props come FIRST here, unlike the panel components.
  // FilterDropdown is a control, not a surface, and every prompt example calls
  // it as FilterDropdown(name, label, $var, options). With surfaceStyle/span/
  // rowSpan leading, those four positional args landed on the wrong props and
  // the control silently failed to render at all. Keep this order in sync with
  // src/visual/schemas.ts.
  props: z.object({
    name: z.string(),
    label: z.string().optional(),
    value: reactive(z.string().optional()),
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
  // No explicit ComponentRenderProps annotation here: reactive() changes the
  // inferred prop type (value becomes a StateField, not a plain string), so a
  // hand-written annotation would contradict it. Let defineComponent infer.
  component: function FilterDropdownView({ props }) {
    // No explicit type argument: useStateField infers T from the value and
    // unwraps it via InferStateFieldValue. Forcing <string> would contradict
    // the StateField that reactive() produces.
    const field = useStateField(props.name, props.value);
    return (
      <div className="cnv-filter">
        {props.label && <label>{props.label}</label>}
        <select value={field.value ?? ""} onChange={(e) => field.setValue(e.target.value)}>
          <option value="">All</option>
          {props.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  },
});

// ── Section — grouping container with nested children ───────────────────────
// The children union is deliberately tight. A union of everything would let the
// model nest a whole dashboard inside a panel.
export const Section = defineComponent({
  name: "Section",
  props: z.object({
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    children: z.array(z.union([
      MetricStrip.ref,
      Gauge.ref,
      Donut.ref,
      LineChart.ref,
      MultiLine.ref,
      BarRank.ref,
      VisualTable.ref,
      DetailPanel.ref,
      Capacity.ref,
      ArtworkWall.ref,
    ])),
  }),
  description:
    "Grouping container that renders a title and a vertical stack of child panels. " +
    "Use to organize a dashboard into named regions. children accepts a tight set of display components: " +
    "MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall. " +
    "Do NOT nest Section, Kanban, or Stack inside a Section.",
  component: ({ props, renderNode }) => (
    <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Section"} subtitle={props.subtitle} state={props.state}>
      <div className="cnv-section">{renderNode(props.children)}</div>
    </Surface>
  ),
});

// ── DashboardGrid — 12-column responsive grid ───────────────────────────────
// Stack is flex and cannot express "this panel is 8 of 12 columns wide".
// This is CSS Grid: each child's own `span` prop sets its width and `rowSpan`
// its height, so the grid itself stays dumb and children keep control.
export const DashboardGrid = defineComponent({
  name: "DashboardGrid",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    surfaceStyle: SurfaceStyleSchema.optional(),
    span: SpanSchema,
    rowSpan: RowSpanSchema,
    children: z.array(z.union([
      MetricStrip.ref, Gauge.ref, Donut.ref, LineChart.ref, MultiLine.ref,
      BarRank.ref, Timeline.ref, EventStream.ref, LogStream.ref, NodeGraph.ref,
      Sankey.ref, Kanban.ref, VisualTable.ref, ArtworkWall.ref,
      PlaybackSessions.ref, Capacity.ref, SecurityPosture.ref, DetailPanel.ref,
      Callout.ref, EmptyState.ref, RoomBoard.ref, Flow.ref, Section.ref,
    ])),
  }),
  description:
    "12-column responsive grid for multi-panel dashboard layouts. " +
    "Set each CHILD panel's span (1-12) for its width and rowSpan (1-3) for its height — " +
    "span 6 is half width, span 4 a third, span 12 full width. " +
    "Prefer this over Stack whenever panels need specific widths. " +
    "Use Stack for simple vertical stacking, Section for a titled group of panels.",
  component: ({ props, renderNode }) => {
    const grid = <div className="cnv-grid">{renderNode(props.children)}</div>;
    // Only wrap in a Surface when there is a heading — a bare grid shouldn't
    // gain a panel border it didn't ask for.
    if (!props.title && !props.subtitle) return grid;
    return (
      <Surface
        title={props.title ?? "Dashboard"}
        subtitle={props.subtitle}
        state={props.state}
        surfaceStyle={props.surfaceStyle}
        gridSpan={{ span: props.span, rowSpan: props.rowSpan }}
      >
        {grid}
      </Surface>
    );
  },
});

const allComponents = [
  MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank,
  Timeline, EventStream, LogStream, NodeGraph, Sankey,
  Kanban, VisualTable, ArtworkWall, PlaybackSessions,
  Capacity, SecurityPosture, MarkdownReader, KnowledgeGraph,
  Backlinks, DetailPanel, Callout, EmptyState, RoomBoard, Flow,
  FilterDropdown, Section, DashboardGrid,
];

export const homelabComponents = allComponents;

export const homelabGroup = {
  name: "Homelab Visuals",
  components: allComponents.map((c) => c.name),
  notes: [
    "Shared types used in the signatures above:",
    "  VisualState = healthy | warning | critical | offline | stale | loading | empty | denied",
    "  Metric = {label: string, value: string|number, unit?: string, trend?: number, state?: VisualState}",
    "  Item   = {id: string, label: string, subtitle?: string, image?: string, value?: string|number, progress?: 0-1, state?: VisualState, group?: string, meta?: object}",
    "  Series = {name: string, unit?: string, points: {x: string|number, y: number}[]}",
    "  Event  = {id: string, at: string, title: string, detail?: string, image?: string, state?: VisualState}",
    "  Node   = {id: string, label: string, x?: number, y?: number, state?: VisualState, value?: number}",
    "  Edge   = {source: string, target: string, label?: string, value?: number, state?: VisualState}",
    "Interactive components: FilterDropdown binds a $variable and re-runs any Query() using it. " +
      "Section nests child panels under a title. VisualTable rows, Kanban cards, ArtworkWall items, " +
      "and NodeGraph nodes are all clickable and send a follow-up asking for that entity's details.",
  ],
};
