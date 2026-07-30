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
  tagSchemaId,
  type ComponentRenderProps,
} from "@openuidev/react-lang";
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

// ── Phase 5: Surface visual style (closed enums) ──────────────

const SurfaceStyleSchema = z.object({
  translucency: z.enum(["none", "subtle", "medium", "heavy"]).optional(),
  blur: z.enum(["none", "sm", "md", "lg"]).optional(),
  background: z.enum(["flat", "gradient", "image", "mesh"]).optional(),
  elevation: z.enum(["flat", "raised", "floating"]).optional(),
  glow: z.enum(["none", "state"]).optional(),
});
tagSchemaId(SurfaceStyleSchema, "SurfaceStyle");

type SurfaceStyle = {
  translucency?: string;
  blur?: string;
  background?: string;
  elevation?: string;
  glow?: string;
};

/** Compute CSS classes from the closed-enum surface style options. */
function surfaceClasses(style: SurfaceStyle): string[] {
  const cls: string[] = [];
  if (style.translucency && style.translucency !== "none") cls.push(`cnv-translucent-${style.translucency}`);
  if (style.blur && style.blur !== "none") cls.push(`cnv-blur-${style.blur}`);
  if (style.background && style.background !== "flat") cls.push(`cnv-bg-${style.background}`);
  if (style.elevation && style.elevation !== "flat") cls.push(`cnv-elev-${style.elevation}`);
  if (style.glow === "state") cls.push("cnv-glow-state");
  return cls;
}

// ── Helper components ─────────────────────────────────────────

/**
 * Surface — canonical panel wrapper shared by all visual components
 * and the dashboard page. Exported so dashboard.tsx can reuse it
 * instead of maintaining a duplicate VisualPanel copy.
 */
export function Surface({
  title,
  subtitle,
  state = "healthy",
  children,
  ...style
}: {
  title: string;
  subtitle?: string;
  state?: string;
  children: React.ReactNode;
} & SurfaceStyle) {
  const extra = surfaceClasses(style);
  const classNames = [`cnv cnv-surface state-${state}`];
  if (extra.length) classNames.push(...extra);
  return (
    <section className={classNames.join(" ")}>
      <header className="cnv-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <span className="cnv-badge">{state}</span>
      </header>
      {children}
    </section>
  );
}

/**
 * MetricStripContent — renders a row of metric cards. Exported so
 * dashboard.tsx can reuse it instead of maintaining a duplicate.
 */
export function MetricStripContent({
  metrics,
}: {
  metrics: Array<{ label: string; value: string | number; unit?: string; trend?: number; state?: string }>;
}) {
  return (
    <div className="cnv-metrics">
      {metrics.slice(0, 8).map((m, i) => (
        <article key={i} className={`state-${m.state ?? "healthy"}`}>
          <small>{m.label}</small>
          <strong>{m.value}{m.unit}</strong>
          {m.trend != null && (
            <span>{m.trend > 0 ? "↗" : "↘"} {Math.abs(m.trend)}%</span>
          )}
        </article>
      ))}
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; metrics: z.infer<typeof MetricSchema>[] }>) => {
    if (!props.metrics?.length) return <Surface title={props.title ?? "Metrics"} state={props.state}><NoData label="No metrics" /></Surface>;
    return (
      <Surface title={props.title ?? "Metrics"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-metrics">
          {props.metrics.slice(0, 6).map((m, i) => (
            <article key={i}>
              <small>{m.label}</small>
              <strong>{m.value}{m.unit}</strong>
              {m.trend != null && <span>{m.trend > 0 ? "↗" : "↘"} {Math.abs(m.trend)}%</span>}
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── 2. Gauge ──────────────────────────────────────────────────

export const Gauge = defineComponent({
  name: "Gauge",
  props: z.object({
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; value: number; max?: number; unit?: string; state?: string; thresholds?: { warning: number; critical: number } }>) => {
    const v = Number(props.value);
    if (!Number.isFinite(v)) return <Surface title={props.title ?? "Gauge"} state={props.state}><NoData label="No gauge value" /></Surface>;
    const max = props.max ?? 100;
    const pct = Math.min(100, Math.max(0, (v / max) * 100));
    const th = props.thresholds;
    let color = "var(--cnv-series-1)";
    if (th) {
      if (pct >= th.critical) color = "#ff5555";
      else if (pct >= th.warning) color = "#ffc266";
    }
    return (
      <Surface title={props.title ?? "Gauge"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; segments: { label: string; value: number; color?: string }[] }>) => {
    if (!props.segments?.length) return <Surface title={props.title ?? "Distribution"} state={props.state}><NoData label="No distribution data" /></Surface>;
    const total = props.segments.reduce((s, x) => s + Number(x.value) || 0, 0);
    if (total === 0) return <Surface title={props.title ?? "Distribution"} state={props.state}><NoData label="Total is zero" /></Surface>;
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
      <Surface title={props.title ?? "Distribution"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; series: z.infer<typeof SeriesSchema>[] }>) => {
    if (!props.series?.length || !props.series[0]?.points?.length) return <Surface title={props.title ?? "Line Chart"} state={props.state}><NoData label="No time-series data" /></Surface>;
    const s = props.series[0];
    const max = Math.max(...s.points.map((p) => p.y), 1);
    const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
    return (
      <Surface title={props.title ?? s.name} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    series: z.array(SeriesSchema),
  }),
  description:
    "Multi-series line chart for comparing trends across 2–4 metrics over the same axis (e.g. CPU vs memory vs network over time). " +
    "Each Series gets its own colored line. For a single metric use LineChart.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; series: z.infer<typeof SeriesSchema>[] }>) => {
    if (!props.series?.length || props.series.every((s) => !s.points?.length)) return <Surface title={props.title ?? "Multi-Line"} state={props.state}><NoData label="No time-series data" /></Surface>;
    return (
      <Surface title={props.title ?? "Multi-Line"} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Horizontal bar chart ranking items by value (top services by traffic, largest tables by size, most active users). " +
    "Each Item needs {id, label, value}. Up to 12 bars. " +
    "For proportional parts-of-a-whole use Donut. For time-series use LineChart.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Bar Rank"} state={props.state}><NoData label="No data to rank" /></Surface>;
    const items = props.items;
    const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
    return (
      <Surface title={props.title ?? "Bar Rank"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; events: z.infer<typeof EventSchema>[] }>) => {
    if (!props.events?.length) return <Surface title={props.title ?? "Timeline"} state={props.state}><NoData label="No events" /></Surface>;
    return (
      <Surface title={props.title ?? "Timeline"} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    events: z.array(EventSchema),
  }),
  description:
    "High-volume event feed / activity log (CI events, audit trail, live alerts). " +
    "Denser than Timeline — optimized for scanning many entries. " +
    "Use LogStream for raw system logs with severity levels.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; events: z.infer<typeof EventSchema>[] }>) => {
    if (!props.events?.length) return <Surface title={props.title ?? "Event Stream"} state={props.state}><NoData label="No events" /></Surface>;
    return (
      <Surface title={props.title ?? "Event Stream"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; entries: { timestamp: string; level: string; message: string; source?: string }[] }>) => {
    if (!props.entries?.length) return <Surface title={props.title ?? "Log Stream"} state={props.state}><NoData label="No log entries" /></Surface>;
    const colors: Record<string, string> = { error: "#ff5555", fatal: "#ff5555", warn: "#ffc266", info: "var(--cnv-series-1)", debug: "var(--cnv-muted)" };
    return (
      <Surface title={props.title ?? "Log Stream"} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  }),
  description:
    "Network topology / dependency graph (service connections, infrastructure topology). " +
    "Nodes need {id, label, x?, y?} (coordinates in a ~800×430 space). Edges need {source, target, label?, value?}. " +
    "For sequential pipeline/flow use Flow. For proportional flow use Sankey.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[]; edges: z.infer<typeof EdgeSchema>[] }>) => {
    if (!props.nodes?.length) return <Surface title={props.title ?? "Node Graph"} state={props.state}><NoData label="No graph data" /></Surface>;
    return (
      <Surface title={props.title ?? "Network"} subtitle={props.subtitle} state={props.state}>
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
      </Surface>
    );
  },
});

// ── 11. Sankey ────────────────────────────────────────────────

export const Sankey = defineComponent({
  name: "Sankey",
  props: z.object({
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[]; edges: z.infer<typeof EdgeSchema>[] }>) => {
    if (!props.nodes?.length) return <Surface title={props.title ?? "Flow"} state={props.state}><NoData label="No flow data" /></Surface>;
    return (
      <Surface title={props.title ?? "Flow"} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Board with columns grouped by item.group (CI stages, deployment statuses, task states). " +
    "Each Item needs {id, label, subtitle?, group}. Items are auto-grouped by their group field. " +
    "Use VisualTable for flat tabular data. Use RoomBoard for physical topology.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Board"} state={props.state}><NoData label="No items" /></Surface>;
    const groups = [...new Set(props.items.map((i) => i.group || "Active"))];
    return (
      <Surface title={props.title ?? "Board"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-board">
          {groups.map((g) => (
            <section key={g}>
              <h4>{g}</h4>
              {props.items.filter((i) => (i.group || "Active") === g).map((i) => (
                <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle}</small></article>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Tabular list of records (containers, devices, adapters, configs). " +
    "Each Item shows {label, subtitle, value, state}. Rows are read-only. " +
    "Use LogStream for raw logs. Use BarRank for ranked numeric comparison. " +
    "Use DetailPanel for a single entity's key-value details.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Table"} state={props.state}><NoData label="No rows" /></Surface>;
    return (
      <Surface title={props.title ?? "Table"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-table">
          {props.items.map((i) => (
            <article key={i.id}>
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
    "Use PlaybackSessions for currently-playing media with stream details.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[]; square?: boolean }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Gallery"} state={props.state}><NoData label="No items" /></Surface>;
    return (
      <Surface title={props.title ?? "Gallery"} subtitle={props.subtitle} state={props.state}>
        <div className={props.square ? "cnv-albums" : "cnv-posters"}>
          {props.items.slice(0, 18).map((i) => (
            <article key={i.id}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Active media streams / playback sessions (Emby/Jellyfin/Plex current plays). " +
    "Each Item: {id, label (title), subtitle (client), image? (thumbnail), progress? (0–1), meta: {mode: 'direct'|'transcode'}}. " +
    "Use ArtworkWall for a static library browse view.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Active Sessions"} state={props.state}><NoData label="No active sessions" /></Surface>;
    return (
      <Surface title={props.title ?? "Active Sessions"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; metrics: z.infer<typeof MetricSchema>[]; series?: z.infer<typeof SeriesSchema>[] }>) => {
    if (!props.metrics?.length) return <Surface title={props.title ?? "Capacity"} state={props.state}><NoData label="No capacity data" /></Surface>;
    const used = Number(props.metrics[0].value);
    if (!Number.isFinite(used)) return <Surface title={props.title ?? "Capacity"} state={props.state}><NoData label="No capacity data" /></Surface>;
    return (
      <Surface title={props.title ?? "Capacity"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[]; metrics?: z.infer<typeof MetricSchema>[] }>) => {
    if (!props.items?.length && !props.metrics?.length) return <Surface title={props.title ?? "Security"} state={props.state}><NoData label="No security data" /></Surface>;
    return (
      <Surface title={props.title ?? "Security Posture"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; markdown: string; items?: z.infer<typeof ItemSchema>[] }>) => {
    const md = props.markdown || "## No content\nNo markdown provided.";
    const lines = md.split("\n");
    return (
      <Surface title={props.title ?? "Document"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[]; edges: z.infer<typeof EdgeSchema>[] }>) => {
    if (!props.nodes?.length) return <Surface title={props.title ?? "Knowledge Graph"} state={props.state}><NoData label="No graph data" /></Surface>;
    return (
      <Surface title={props.title ?? "Knowledge Graph"} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "List of notes/documents that link to the current topic, with context. " +
    "Each Item: {id, label, subtitle? (context), meta: {evidence?: number}}. " +
    "Use KnowledgeGraph for a visual graph view.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Backlinks"} state={props.state}><NoData label="No backlinks" /></Surface>;
    return (
      <Surface title={props.title ?? "Backlinks"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; metrics: z.infer<typeof MetricSchema>[]; summary?: string }>) => {
    if (!props.metrics?.length && !props.summary) return <Surface title={props.title ?? "Details"} state={props.state}><NoData label="No detail data" /></Surface>;
    return (
      <Surface title={props.title ?? "Details"} subtitle={props.subtitle} state={props.state}>
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
    title: z.string().optional(),
    state: VisualStateSchema.optional(),
    summary: z.string(),
    metrics: z.array(MetricSchema).optional(),
  }),
  description:
    "Alert / attention callout for warnings, status summaries, or important notes. " +
    "summary is the main text. state colors the border (warning=amber, critical=red). " +
    "Use MarkdownReader for full documents. Use MetricStrip for data without narrative.",
  component: ({ props }: ComponentRenderProps<{ title?: string; state?: string; summary: string; metrics?: z.infer<typeof MetricSchema>[] }>) => {
    return (
      <Surface title={props.title ?? "Notice"} state={props.state}>
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
    title: z.string().optional(),
    state: VisualStateSchema.optional(),
    summary: z.string(),
  }),
  description:
    "Explicit empty / placeholder state with a message. " +
    "Use when a query returned no results or a feature is not configured. " +
    "Do NOT use to hide missing data — use it to communicate absence honestly.",
  component: ({ props }: ComponentRenderProps<{ title?: string; state?: string; summary: string }>) => {
    return (
      <Surface title={props.title ?? "Empty"} state={props.state ?? "empty"}>
        <div className="cnv-state"><strong>{props.summary}</strong></div>
      </Surface>
    );
  },
});

// ── 24. RoomBoard ─────────────────────────────────────────────

export const RoomBoard = defineComponent({
  name: "RoomBoard",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  description:
    "Physical topology / room-based layout (home automation devices by room, rack layout). " +
    "Items grouped by item.group (room name or rack position). " +
    "Use Kanban for workflow/task boards. Use NodeGraph for logical network topology.",
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; items: z.infer<typeof ItemSchema>[] }>) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Topology"} state={props.state}><NoData label="No topology data" /></Surface>;
    const groups = [...new Set(props.items.map((i) => i.group || "Default"))];
    return (
      <Surface title={props.title ?? "Topology"} subtitle={props.subtitle} state={props.state}>
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
  component: ({ props }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; nodes: z.infer<typeof NodeSchema>[] }>) => {
    if (!props.nodes?.length) return <Surface title={props.title ?? "Flow"} state={props.state}><NoData label="No flow data" /></Surface>;
    return (
      <Surface title={props.title ?? "Flow"} subtitle={props.subtitle} state={props.state}>
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

// ── 26. Surface (glass wrapper — Phase 5 Task 5.3) ────────────
//
// A container/wrapper that applies closed-enum visual styling to its
// children. Use to wrap any panel with translucency, blur, glow, etc.
// The model composes: root = Surface({...}, [children])

export const SurfaceComponent = defineComponent({
  name: "Surface",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    children: z.array(z.any()),
    ...SurfaceStyleSchema.shape,
  }),
  description:
    "Glass / visual-style container that wraps children with translucency, blur, background, elevation, and glow. " +
    "translucency: none|subtle|medium|heavy — how see-through the panel is. " +
    "blur: none|sm|md|lg — backdrop blur intensity (frosted glass). " +
    "background: flat|gradient|image|mesh — panel background style. " +
    "elevation: flat|raised|floating — shadow depth. " +
    "glow: none|state — when 'state', the panel glows with its health-state color (e.g. critical=red). " +
    "Use to give a panel a glass-panel look: Surface({translucency:\"medium\", blur:\"md\"}, [...]).",
  component: ({ props, renderNode }: ComponentRenderProps<{ title?: string; subtitle?: string; state?: string; children: unknown[] } & SurfaceStyle>) => {
    return (
      <Surface title={props.title ?? ""} subtitle={props.subtitle} state={props.state} {...props}>
        {Array.isArray(props.children) ? props.children.map((c, i) => <React.Fragment key={i}>{renderNode(c)}</React.Fragment>) : null}
      </Surface>
    );
  },
});

// ── 27. DashboardGrid (12-column layout — Phase 5 Task 5.4) ───
//
// CSS Grid with 12 columns. Children render as grid items; wrap each
// child in GridItem to control its span. Without GridItem, children
// default to full width (span 12).

export const DashboardGrid = defineComponent({
  name: "DashboardGrid",
  props: z.object({
    children: z.array(z.any()),
    gap: z.enum(["none", "sm", "md", "lg"]).optional(),
    columns: z.number().int().min(1).max(12).optional(),
  }),
  description:
    "12-column responsive grid for multi-column dashboards. " +
    "Wrap each child in GridItem to set its column span (how many of the 12 columns it occupies). " +
    "Children not wrapped in GridItem default to full width (12 columns). " +
    "gap: none|sm|md|lg. columns: override column count (default 12). " +
    "Collapses to a single column on narrow screens. " +
    "Example: root = DashboardGrid([GridItem(chart, 8), GridItem(stats, 4)]) makes chart span 2/3 and stats span 1/3.",
  component: ({ props, renderNode }: ComponentRenderProps<{ children: unknown[]; gap?: string; columns?: number }>) => {
    const gapMap: Record<string, string> = { none: "0", sm: "8px", md: "16px", lg: "24px" };
    const gap = gapMap[props.gap ?? "md"] ?? gapMap["md"];
    const cols = props.columns ?? 12;
    return (
      <div
        className="cnv-grid"
        style={{
          ["--gap" as string]: gap,
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
        }}
      >
        {Array.isArray(props.children) &&
          props.children.map((child, i) => (
            <div key={i} className="cnv-col-span-12">
              {renderNode(child)}
            </div>
          ))}
      </div>
    );
  },
});

// ── 28. GridItem (spanned grid cell — Phase 5 Task 5.4) ───────

export const GridItem = defineComponent({
  name: "GridItem",
  props: z.object({
    children: z.any(),
    span: z.number().int().min(1).max(12).optional(),
    rowSpan: z.number().int().min(1).max(6).optional(),
  }),
  description:
    "Wraps a single component in a grid cell with a column span (1–12) and optional rowSpan (1–6). " +
    "Use inside DashboardGrid: span=6 = half width, span=4 = third, span=3 = quarter, span=8 = two-thirds. " +
    "Default span is 12 (full width). Only meaningful as a child of DashboardGrid.",
  component: ({ props, renderNode }: ComponentRenderProps<{ children: unknown; span?: number; rowSpan?: number }>) => {
    const span = props.span ?? 12;
    const colClass = `cnv-col-span-${Math.min(12, Math.max(1, span))}`;
    const rowClass = props.rowSpan ? `cnv-row-span-${Math.min(6, Math.max(1, props.rowSpan))}` : "";
    return (
      <div className={`${colClass} ${rowClass}`.trim()}>
        {renderNode(props.children)}
      </div>
    );
  },
});

// ── Exports ───────────────────────────────────────────────────

const allComponents = [
  SurfaceComponent, DashboardGrid, GridItem,
  MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank,
  Timeline, EventStream, LogStream, NodeGraph, Sankey,
  Kanban, VisualTable, ArtworkWall, PlaybackSessions,
  Capacity, SecurityPosture, MarkdownReader, KnowledgeGraph,
  Backlinks, DetailPanel, Callout, EmptyState, RoomBoard, Flow,
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
    "",
    "Layout & visual styling:",
    "  DashboardGrid — 12-column CSS Grid. Wrap children in GridItem(span, rowSpan?) to control width.",
    "    Common spans: 6 = half width, 4 = one third, 3 = one quarter, 8 = two thirds. Default = 12 (full width).",
    "    Example: root = DashboardGrid([GridItem(diskPanel, 6), GridItem(healthPanel, 6)])",
    "  Stack — flex container for vertical stacking or simple rows (no explicit column width).",
    "  Surface — glass wrapper with closed-enum visual controls:",
    "    translucency: none|subtle|medium|heavy   blur: none|sm|md|lg",
    "    background: flat|gradient|image|mesh      elevation: flat|raised|floating",
    "    glow: none|state  (state ties glow to the panel's health color — critical=red)",
    "    Example: Surface({translucency:\"medium\", blur:\"md\", glow:\"state\"}, [chart1, chart2])",
  ],
};
