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
        {/* The traffic-light dots that used to lead this header are gone at
            Gene's request. They were borrowed from the design system's Window
            Header, but a panel is not a window: the dots implied close/minimise
            controls that never existed, and their red/amber/green read as a
            status indicator while being purely decorative — actively misleading
            beside the real state badge on the right. */}
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
              // Direction is stated, never judged: a rising number is good on
              // throughput and bad on latency, and this component cannot know
              // which it is holding. Up reads as the accent, down as muted.
              <span className={m.trend > 0 ? "cnv-trend cnv-trend-up" : "cnv-trend cnv-trend-down"}>
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

function NoData({ label = "No data", hint }: { label?: string; hint?: string }) {
  return (
    <div className="cnv-state-nodata" role="status">
      <span className="cnv-state-glyph" aria-hidden="true">
        ◌
      </span>
      <strong>{label}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

/**
 * Shapes a skeleton can take. Deliberately a closed set: a loading panel should
 * pre-draw the layout it is about to become, not a generic grey block.
 */
type SkeletonShape = "tiles" | "rows" | "chart" | "bars" | "ring";

function Skeleton({ shape = "rows" }: { shape?: SkeletonShape }) {
  // aria-busy + a visually-hidden label: a screen reader hears "Loading", a
  // sighted reader sees the shape of the thing that is coming.
  return (
    <div className={`cnv-skeleton cnv-skeleton-${shape}`} aria-busy="true" aria-live="polite">
      <span className="cnv-sr">Loading</span>
      {shape === "ring" ? (
        <i className="cnv-sk-ring" />
      ) : shape === "chart" ? (
        <i className="cnv-sk-chart" />
      ) : (
        Array.from({ length: shape === "tiles" ? 4 : shape === "bars" ? 5 : 4 }, (_, i) => (
          <i key={i} />
        ))
      )}
    </div>
  );
}

/**
 * The one place a panel with nothing to show is rendered.
 *
 * Every component used to inline its own `<Surface …><NoData/></Surface>`, which
 * meant an empty panel inherited `state` verbatim — usually undefined, so
 * Surface defaulted it to "healthy" and a panel with no data wore a green edge
 * and a HEALTHY badge. Absence is not health. Empty falls back to "empty", and
 * a panel whose state IS "loading" gets a skeleton in the shape of the content
 * it is waiting for rather than the same dashed box.
 */
function EmptyPanel({
  props,
  title,
  label,
  hint,
  shape,
}: {
  props: { title?: string; subtitle?: string; state?: string } & SurfaceExtras;
  title: string;
  label: string;
  hint?: string;
  shape?: SkeletonShape;
}) {
  return (
    <Surface
      surfaceStyle={props.surfaceStyle}
      gridSpan={{ span: props.span, rowSpan: props.rowSpan }}
      title={props.title ?? title}
      subtitle={props.subtitle}
      state={props.state ?? "empty"}
    >
      {props.state === "loading" ? <Skeleton shape={shape} /> : <NoData label={label} hint={hint} />}
    </Surface>
  );
}

/**
 * Props that make a non-button element behave like one.
 *
 * VisualTable rows, Kanban cards and ArtworkWall tiles all carried a bare
 * `onClick` on a `<div>`/`<article>`: no tab stop, no keyboard activation, no
 * focus ring, and nothing announcing them as interactive. A dashboard whose
 * only drill-down path requires a mouse is a dashboard half its users cannot
 * drill into.
 */
function clickable(onActivate: () => void, label: string) {
  return {
    className: "cnv-clickable",
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

// ── Artwork ───────────────────────────────────────────────────

/**
 * Turn an adapter-supplied artwork URL into a background-image value that
 * cannot break the panel.
 *
 * Two separate failures were live here:
 *
 *  1. `style={{ backgroundImage: `url(${i.image})` }}` overrides the whole
 *     background-image layer, so the dark gradient `.cnv-art` paints as its
 *     fallback was DISCARDED the moment an item carried an image — and if that
 *     URL then 404s (Radarr hands out relative `/MediaCover/…` paths, Emby
 *     hands out `http://<tailnet-ip>:8096/…`, and neither resolves from every
 *     browser that opens this dashboard) the tile painted nothing at all.
 *     Layering the gradient BEHIND the url means a failed fetch degrades to the
 *     placeholder instead of to a hole.
 *
 *  2. An unescaped URL is a CSS injection: a bare `)` or `"` in a query string
 *     terminates the declaration and can open the next one. Anything that is
 *     not a plain http(s)/protocol-relative/site-relative/data: image is
 *     dropped, and the survivors are quoted and escaped.
 */
const ART_FALLBACK =
  "linear-gradient(145deg, rgba(128,0,255,0.20), rgba(0,243,255,0.12)), " +
  "linear-gradient(#1b1b21, #141418)";

export function artBackground(image?: string): string | undefined {
  if (!image) return undefined;
  const url = image.trim();
  if (!url) return undefined;
  // Closed list of accepted shapes. Everything else — javascript:, file:,
  // arbitrary schemes, anything with a newline — never reaches the stylesheet.
  const allowed =
    /^https?:\/\//i.test(url) ||
    /^\/\//.test(url) ||
    /^\/[^/]/.test(url) ||
    /^data:image\//i.test(url);
  if (!allowed) return undefined;
  if (/[\s"'()\\<>]/.test(url)) {
    // Escaping is possible but a URL containing these is far more likely to be
    // malformed adapter output than a real asset. Fall through to the tile.
    return undefined;
  }
  return `url("${url}"), ${ART_FALLBACK}`;
}

/** Style + data attribute for one artwork tile. */
function artProps(image?: string): {
  style?: React.CSSProperties;
  "data-art": "image" | "none";
} {
  const bg = artBackground(image);
  return bg ? { style: { backgroundImage: bg }, "data-art": "image" } : { "data-art": "none" };
}

// ── Chart primitives ──────────────────────────────────────────
//
// One geometry for every SVG chart in the file, so a LineChart, a MultiLine and
// a Capacity sparkline share a baseline, a gutter and a type size instead of
// each inventing their own. All of it is pure arithmetic on a fixed viewBox —
// no measurement, no layout effect, nothing that differs between server and
// client render.

const CHART_W = 640;
const CHART_H = 220;
/** Gutters: left for value labels, bottom for the x axis. */
const PAD = { l: 48, r: 16, t: 14, b: 30 };
const PLOT_W = CHART_W - PAD.l - PAD.r;
const PLOT_H = CHART_H - PAD.t - PAD.b;
const BASE_Y = PAD.t + PLOT_H;

/** Round an axis maximum up to 1/2/2.5/5/10 × 10ⁿ so gridlines land on readable numbers. */
function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * base;
}

/** Axis and endpoint labels: 12400 reads as 12.4k, not as five digits in a 48px gutter. */
function compact(v: number): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "G";
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(a < 1 ? 2 : 1);
}

type Point = { x: string | number; y: number };

const xAt = (i: number, n: number) => PAD.l + (n <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
const yAt = (v: number, max: number) =>
  BASE_Y - (Math.max(0, Math.min(Number(v) || 0, max)) / max) * PLOT_H;

function linePath(points: Point[], max: number): string {
  return points.map((p, i) => `${i ? "L" : "M"} ${xAt(i, points.length)} ${yAt(p.y, max)}`).join(" ");
}

/** The line, closed down to the baseline — the area wash under a series. */
function areaPath(points: Point[], max: number): string {
  if (!points.length) return "";
  const n = points.length;
  return `${linePath(points, max)} L ${xAt(n - 1, n)} ${BASE_Y} L ${xAt(0, n)} ${BASE_Y} Z`;
}

/**
 * Gridlines, value axis and x labels.
 *
 * Only three x labels are ever drawn — first, middle, last — anchored start,
 * middle and end respectively. That is the cheapest collision-proof axis there
 * is: 60 timestamps in a 578px plot cannot be drawn without overlapping, and a
 * dashboard that overlaps its axis labels reads as broken rather than as dense.
 */
function ChartFrame({ max, points }: { max: number; points?: Point[] }) {
  const rows = [0, 0.25, 0.5, 0.75, 1];
  const label = (p: Point | undefined) =>
    p == null ? "" : String(p.x).length > 12 ? String(p.x).slice(0, 11) + "…" : String(p.x);
  const n = points?.length ?? 0;
  const ticks: Array<[number, string, "start" | "middle" | "end"]> = [];
  if (n) {
    ticks.push([xAt(0, n), label(points![0]), "start"]);
    if (n > 2) ticks.push([xAt((n - 1) >> 1, n), label(points![(n - 1) >> 1]), "middle"]);
    if (n > 1) ticks.push([xAt(n - 1, n), label(points![n - 1]), "end"]);
  }
  return (
    <g aria-hidden="true">
      {rows.map((r) => (
        <line
          key={r}
          className={r === 0 ? "cnv-chart-base" : "cnv-chart-grid"}
          x1={PAD.l}
          x2={PAD.l + PLOT_W}
          y1={BASE_Y - r * PLOT_H}
          y2={BASE_Y - r * PLOT_H}
        />
      ))}
      {/* Four gridlines, three labels. Labelling every line put a number
          against 12.5 and 37.5 on a 50-unit axis — noise in a 48px gutter. */}
      {[0, 0.5, 1].map((r) => (
        <text key={`t${r}`} className="cnv-chart-axis" x={PAD.l - 8} y={BASE_Y - r * PLOT_H + 4} textAnchor="end">
          {compact(max * r)}
        </text>
      ))}
      {ticks.map(([x, t, anchor]) => (
        <text key={`x${x}`} className="cnv-chart-axis" x={x} y={CHART_H - 10} textAnchor={anchor}>
          {t}
        </text>
      ))}
    </g>
  );
}

/** The last reading, called out — on a time series that is the number people came for. */
function Endpoint({ points, max, color, unit }: { points: Point[]; max: number; color: string; unit?: string }) {
  if (!points.length) return null;
  const i = points.length - 1;
  const x = xAt(i, points.length);
  const y = yAt(points[i].y, max);
  const text = compact(points[i].y) + (unit ?? "");
  // Flip the label inside the plot when the endpoint is near the right edge.
  const flip = x > PAD.l + PLOT_W - 60;
  return (
    <g>
      <circle className="cnv-chart-halo" cx={x} cy={y} r="7" fill={color} />
      <circle cx={x} cy={y} r="3.5" fill={color} />
      <text
        className="cnv-chart-endpoint"
        x={flip ? x - 8 : x + 8}
        y={y - 8}
        textAnchor={flip ? "end" : "start"}
        fill={color}
      >
        {text}
      </text>
    </g>
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
    if (!props.metrics?.length) return <EmptyPanel props={props} title="Metrics" label="No metrics" shape="tiles" />;
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
    if (!Number.isFinite(v)) return <EmptyPanel props={props} title="Gauge" label="No gauge value" shape="ring" />;
    const max = props.max ?? 100;
    const pct = Math.min(100, Math.max(0, (v / max) * 100));
    const th = props.thresholds;
    let color = "var(--cnv-series-1)";
    if (th) {
      if (pct >= th.critical) color = "var(--cnv-critical)";
      else if (pct >= th.warning) color = "var(--cnv-warning)";
    }
    const unit = props.unit ?? (max === 100 ? "%" : "");
    // Threshold ticks are painted as a layer ON TOP of the fill, so the ring
    // shows not just where the value is but where it is allowed to go. Earlier
    // layers win in CSS, so the ticks are listed first.
    const tick = (at: number, c: string) =>
      `conic-gradient(transparent 0 ${at}%, ${c} ${at}% ${Math.min(100, at + 0.8)}%, transparent ${Math.min(100, at + 0.8)}%)`;
    const fill = `conic-gradient(${color} 0 ${pct}%, var(--cnv-track) ${pct}%)`;
    const background = th
      ? `${tick(th.critical, "var(--cnv-critical)")}, ${tick(th.warning, "var(--cnv-warning)")}, ${fill}`
      : fill;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Gauge"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div
            className="cnv-ring"
            style={{ background }}
            role="img"
            aria-label={`${v}${unit} of ${max}${unit}`}
          >
            <strong>
              {compact(v)}
              {unit}
              <small>of {compact(max)}{unit}</small>
            </strong>
          </div>
          <ul className="cnv-legend cnv-legend-block">
            <li>
              <i style={{ background: color }} aria-hidden="true" />
              <span>Current</span>
              <b>{compact(v)}{unit}</b>
              <em>{Math.round(pct)}%</em>
            </li>
            {th && (
              <li>
                <i style={{ background: "var(--cnv-warning)" }} aria-hidden="true" />
                <span>Warning at</span>
                <b>{th.warning}%</b>
              </li>
            )}
            {th && (
              <li>
                <i style={{ background: "var(--cnv-critical)" }} aria-hidden="true" />
                <span>Critical at</span>
                <b>{th.critical}%</b>
              </li>
            )}
          </ul>
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
    if (!props.segments?.length) return <EmptyPanel props={props} title="Distribution" label="No distribution data" shape="ring" />;
    const total = props.segments.reduce((s, x) => s + Number(x.value) || 0, 0);
    if (total === 0) return <EmptyPanel props={props} title="Distribution" label="Total is zero" shape="ring" />;
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
          <div
            className="cnv-ring"
            style={{ background: `conic-gradient(${grad})` }}
            role="img"
            aria-label={stops.map((s) => `${s.label} ${Math.round(s.pct)}%`).join(", ")}
          >
            <strong>
              {compact(total)}
              <small>total</small>
            </strong>
          </div>
          <ul className="cnv-legend cnv-legend-block">
            {stops.map((s, i) => (
              <li key={i}>
                <i style={{ background: s.color }} aria-hidden="true" />
                <span title={s.label}>{s.label}</span>
                <b>{typeof s.value === "number" ? compact(s.value) : s.value}</b>
                <em>{Math.round(s.pct)}%</em>
              </li>
            ))}
          </ul>
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
    if (!props.series?.length || !props.series[0]?.points?.length) return <EmptyPanel props={props} title="Line Chart" label="No time-series data" shape="chart" />;
    const s = props.series[0];
    const max = niceMax(Math.max(...s.points.map((p) => Number(p.y) || 0), 0));
    const color = "var(--cnv-series-1)";
    const last = s.points[s.points.length - 1];
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? s.name} subtitle={props.subtitle ?? (s.unit ? `${s.name} (${s.unit})` : undefined)} state={props.state}>
        <svg
          className="cnv-chart"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          role="img"
          aria-label={`${s.name}: ${s.points.length} points, latest ${compact(last.y)}${s.unit ?? ""}`}
        >
          <ChartFrame max={max} points={s.points} />
          <path className="cnv-chart-area" d={areaPath(s.points, max)} fill={color} />
          <path className="cnv-chart-line" d={linePath(s.points, max)} fill="none" stroke={color} />
          <Endpoint points={s.points} max={max} color={color} unit={s.unit} />
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
    if (!props.series?.length || props.series.every((s) => !s.points?.length)) return <EmptyPanel props={props} title="Multi-Line" label="No time-series data" shape="chart" />;
    const shown = props.series.slice(0, 4);
    const max = niceMax(
      Math.max(...shown.flatMap((s) => (s.points ?? []).map((p) => Number(p.y) || 0)), 0),
    );
    // Axis ticks come from whichever series has the most readings, so a short
    // series cannot truncate the shared time axis.
    const longest = shown.reduce((a, b) => ((b.points?.length ?? 0) > (a.points?.length ?? 0) ? b : a));
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Multi-Line"} subtitle={props.subtitle} state={props.state}>
        <svg
          className="cnv-chart"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          role="img"
          aria-label={`Comparison of ${shown.map((s) => s.name).join(", ")}`}
        >
          {/* One shared scale. Per-series maxima made two lines with a 100×
              difference in magnitude sit on top of each other, which is a chart
              that actively lies about the comparison it exists to show. */}
          <ChartFrame max={max} points={longest.points} />
          {shown.map((s, si) =>
            s.points?.length ? (
              <path key={`a${s.name}`} className="cnv-chart-area cnv-chart-area-multi" d={areaPath(s.points, max)} fill={`var(--cnv-series-${si + 1})`} />
            ) : null,
          )}
          {shown.map((s, si) =>
            s.points?.length ? (
              <path key={s.name} className="cnv-chart-line" d={linePath(s.points, max)} fill="none" stroke={`var(--cnv-series-${si + 1})`} />
            ) : null,
          )}
          {shown.map((s, si) =>
            s.points?.length ? (
              <Endpoint key={`e${s.name}`} points={s.points} max={max} color={`var(--cnv-series-${si + 1})`} unit={s.unit} />
            ) : null,
          )}
        </svg>
        <ul className="cnv-legend">
          {shown.map((s, i) => {
            const last = s.points?.length ? s.points[s.points.length - 1] : undefined;
            return (
              <li key={i}>
                <i style={{ background: `var(--cnv-series-${i + 1})` }} aria-hidden="true" />
                <span>{s.name}</span>
                <b>{last ? compact(last.y) + (s.unit ?? "") : "–"}</b>
              </li>
            );
          })}
        </ul>
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Bar Rank" label="No data to rank" shape="bars" />;
    // A "rank" that arrives unsorted is not a ranking. Sorting here means the
    // longest bar is always the top row, which is the whole point of the chart.
    const items = [...props.items]
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
      .slice(0, 12);
    const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Bar Rank"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-bars">
          {items.map((i) => {
            const v = Number(i.value) || 0;
            return (
              <article key={i.id} className={`state-${i.state ?? "healthy"}`}>
                <label title={i.label}>{i.label}</label>
                <div role="img" aria-label={`${Math.round((v / max) * 100)} percent of the largest value`}>
                  <i style={{ width: `${(v / max) * 100}%` }} />
                </div>
                <b>{typeof i.value === "number" ? compact(i.value) : i.value}</b>
              </article>
            );
          })}
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
    if (!props.events?.length) return <EmptyPanel props={props} title="Timeline" label="No events" shape="rows" />;
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
    if (!props.events?.length) return <EmptyPanel props={props} title="Event Stream" label="No events" shape="rows" />;
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
    if (!props.entries?.length) return <EmptyPanel props={props} title="Log Stream" label="No log entries" shape="rows" />;
    const colors: Record<string, string> = {
      error: "var(--cnv-critical)",
      fatal: "var(--cnv-critical)",
      warn: "var(--cnv-warning)",
      info: "var(--cnv-series-1)",
      debug: "var(--cnv-muted)",
    };
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
    if (!props.nodes?.length) return <EmptyPanel props={props} title="Node Graph" label="No graph data" shape="chart" />;
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
              {...clickable(() => triggerAction(`Show details for ${n.label}`), `Show details for ${n.label}`)}
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
    if (!props.nodes?.length) return <EmptyPanel props={props} title="Flow" label="No flow data" shape="tiles" />;
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Board" label="No items" shape="tiles" />;
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
                  {...clickable(() => triggerAction(`Show details for ${i.label}`), `Show details for ${i.label}`)}
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Table" label="No rows" shape="rows" />;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Table"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-table">
          {props.items.map((i) => (
            <article
              key={i.id}
              {...clickable(() => triggerAction(`Show details for ${i.label}`), `Show details for ${i.label}`)}
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Gallery" label="No items" shape="tiles" />;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Gallery"} subtitle={props.subtitle} state={props.state}>
        <div className={props.square ? "cnv-albums" : "cnv-posters"}>
          {props.items.slice(0, 18).map((i) => (
            <article
              key={i.id}
              {...clickable(() => triggerAction(`Show details for ${i.label}`), `Show details for ${i.label}`)}
            >
              <div className="cnv-art" {...artProps(i.image)}>
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Active Sessions" label="No active sessions" shape="rows" />;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Active Sessions"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-playback">
          {props.items.slice(0, 8).map((i) => (
            <article key={i.id}>
              <div className="cnv-art" {...artProps(i.image)} />
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
    if (!props.metrics?.length) return <EmptyPanel props={props} title="Capacity" label="No capacity data" shape="ring" />;
    const used = Number(props.metrics[0].value);
    if (!Number.isFinite(used)) return <EmptyPanel props={props} title="Capacity" label="No capacity data" shape="ring" />;
    // A pool over 100% used is nonsense the ring should not try to draw, and a
    // near-full pool is the one thing this panel exists to shout about.
    const clamped = Math.max(0, Math.min(100, used));
    const fillColor =
      clamped >= 90 ? "var(--cnv-critical)" : clamped >= 75 ? "var(--cnv-warning)" : "var(--cnv-series-1)";
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Capacity"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div
            className="cnv-ring"
            style={{ background: `conic-gradient(${fillColor} 0 ${clamped}%, var(--cnv-track) ${clamped}%)` }}
            role="img"
            aria-label={`${clamped} percent used`}
          >
            <strong>
              {Math.round(clamped)}%
              <small>{props.metrics[0].label}</small>
            </strong>
          </div>
          <section>
            <Metrics metrics={props.metrics} />
            {props.series && props.series.length > 0 && props.series[0].points?.length > 0 && (
              (() => {
                const s = props.series![0];
                const max = niceMax(Math.max(...s.points.map((p) => Number(p.y) || 0), 0));
                return (
                  <svg
                    className="cnv-chart cnv-chart-inset"
                    viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                    role="img"
                    aria-label={`${s.name} trend`}
                  >
                    <ChartFrame max={max} points={s.points} />
                    <path className="cnv-chart-area" d={areaPath(s.points, max)} fill="var(--cnv-series-1)" />
                    <path className="cnv-chart-line" d={linePath(s.points, max)} fill="none" stroke="var(--cnv-series-1)" />
                    <Endpoint points={s.points} max={max} color="var(--cnv-series-1)" unit={s.unit} />
                  </svg>
                );
              })()
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
    if (!props.items?.length && !props.metrics?.length) return <EmptyPanel props={props} title="Security" label="No security data" shape="tiles" />;
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
    if (!props.markdown?.trim()) return <EmptyPanel props={props} title="Document" label="No document content" shape="rows" />;
    const lines = props.markdown.split("\n");
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
    if (!props.nodes?.length) return <EmptyPanel props={props} title="Knowledge Graph" label="No graph data" shape="chart" />;
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Backlinks" label="No backlinks" shape="rows" />;
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
    if (!props.metrics?.length && !props.summary) return <EmptyPanel props={props} title="Details" label="No detail data" shape="tiles" />;
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
    if (!props.summary?.trim() && !props.metrics?.length) return <EmptyPanel props={props} title="Notice" label="Nothing to report" shape="rows" />;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Notice"} state={props.state}>
        <div className={`cnv-callout state-${props.state ?? "warning"}`}>
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
    if (!props.items?.length) return <EmptyPanel props={props} title="Topology" label="No topology data" shape="tiles" />;
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
    if (!props.nodes?.length) return <EmptyPanel props={props} title="Flow" label="No flow data" shape="tiles" />;
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
  component: ({ props, renderNode }) => {
    // A Section whose children were dropped (an unreferenced variable, a query
    // that returned nothing) used to render as a titled empty box. Say so.
    if (!props.children?.length) return <EmptyPanel props={props} title="Section" label="No panels in this section" shape="tiles" />;
    return (
      <Surface surfaceStyle={props.surfaceStyle} gridSpan={{ span: props.span, rowSpan: props.rowSpan }} title={props.title ?? "Section"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-section">{renderNode(props.children)}</div>
      </Surface>
    );
  },
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
    if (!props.children?.length) return <EmptyPanel props={props} title="Dashboard" label="No panels to show" shape="tiles" />;
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
