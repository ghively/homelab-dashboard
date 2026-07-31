"use client";

/* eslint-disable react-hooks/rules-of-hooks --
   Every `component` value in this file is a React.FC passed to defineComponent().
   The linter cannot trace through the config-object indirection to see that these
   are component functions, so it false-positives on hook calls. The OpenUI library
   itself (Button, Callout, CheckBoxGroup, …) uses the same defineComponent + hooks
   pattern. */

import React from "react";
import {
  defineComponent,
  reactive,
  useStateField,
  useTriggerAction,
} from "@openuidev/react-lang";
import { z } from "zod";
import { Surface, StateView, NoData, MetricsView } from "./views";
import {
  VisualStateSchema,
  MetricSchema,
  ItemSchema,
  SeriesSchema,
  NodeSchema,
  EdgeSchema,
  EventSchema,
} from "./schemas";

// ── MetricStrip — compact KPI row (formerly metric-strip, hero, sparkline) ────
export const MetricStrip = defineComponent({
  name: "MetricStrip",
  description:
    "Horizontal row of 1–6 key metrics (label + value + unit + optional trend %). " +
    "Use for numeric summaries: CPU %, memory, counts, pass/fail, health totals. " +
    "For a single bounded value with a known max (disk %, battery), use Gauge instead.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema),
  }),
  component: ({ props }) => {
    if (props.state && props.state !== "healthy" && props.state !== "warning" && props.state !== "critical") {
      return <Surface title={props.title ?? "Metrics"} subtitle={props.subtitle} state={props.state}><StateView state={props.state} /></Surface>;
    }
    if (!props.metrics?.length) return <Surface title={props.title ?? "Metrics"} subtitle={props.subtitle} state={props.state ?? "healthy"}><NoData label="No metrics" /></Surface>;
    return <Surface title={props.title ?? "Metrics"} subtitle={props.subtitle} state={props.state}><MetricsView metrics={props.metrics} /></Surface>;
  },
});

// ── Gauge — single bounded metric with threshold coloring ───────────────────
export const Gauge = defineComponent({
  name: "Gauge",
  description:
    "Single-value radial gauge for ONE bounded metric (disk %, CPU %, memory %, battery). " +
    "value must be 0–max. thresholds.color: at/above warning = amber, at/above critical = red. " +
    "For unbounded counts or multiple metrics use MetricStrip. For a filled ring without a needle use Donut.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    value: z.number(),
    max: z.number().optional(),
    unit: z.string().optional(),
    thresholds: z.object({ warning: z.number(), critical: z.number() }).optional(),
    state: VisualStateSchema.optional(),
  }),
  component: ({ props }) => {
    if (Number.isNaN(props.value)) return <Surface title={props.title ?? "Gauge"} state="healthy"><NoData label="No value" /></Surface>;
    const max = props.max ?? 100;
    const pct = Math.max(0, Math.min(100, (props.value / max) * 100));
    const colorVar = props.thresholds && props.value >= props.thresholds.critical
      ? "var(--cnv-critical, #ff6b6b)"
      : props.thresholds && props.value >= props.thresholds.warning
        ? "var(--cnv-warning, #ffc266)"
        : "var(--cnv-series-1, #27d7f2)";
    return (
      <Surface title={props.title ?? "Gauge"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div style={{ background: `conic-gradient(${colorVar} 0 ${pct}%, #2b2f3a ${pct}%)` }}>
            <strong>{props.value}{props.unit ?? "%"}</strong>
          </div>
        </div>
      </Surface>
    );
  },
});

// ── Donut — proportional breakdown of parts to a whole ──────────────────────
export const Donut = defineComponent({
  name: "Donut",
  description:
    "Conic-gradient donut showing proportional shares of a total (media by type, spend by model, storage by bay). " +
    "Pass items where each value is a count/size. For a single percentage use Gauge. For a ranked bar comparison use BarRank.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    const numeric = (props.items ?? []).filter((i) => typeof i.value === "number" && !Number.isNaN(i.value));
    if (!numeric.length) return <Surface title={props.title ?? "Donut"} state={props.state ?? "healthy"}><NoData label="No shares" /></Surface>;
    const total = numeric.reduce((s, i) => s + Number(i.value), 0) || 1;
    let acc = 0;
    const segs = numeric.slice(0, 8).map((i, idx) => {
      const start = (acc / total) * 100; acc += Number(i.value);
      const end = (acc / total) * 100;
      return { label: i.label, start, end, color: `var(--cnv-series-${(idx % 6) + 1})` };
    });
    const grad = segs.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
    return (
      <Surface title={props.title ?? "Donut"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-donut">
          <div style={{ background: `conic-gradient(${grad})` }}><strong>{total}</strong></div>
          <ul>{segs.map((s) => <li key={s.label}><i style={{ background: s.color }} />{s.label}</li>)}</ul>
        </div>
      </Surface>
    );
  },
});

// ── LineChart — single-series trend over time ───────────────────────────────
export const LineChart = defineComponent({
  name: "LineChart",
  description:
    "Single-series line chart for a trend over time (CPU over 24h, requests/sec, temperature). " +
    "Pass one Series with points {x,y}. For comparing 2–4 series on the same axis use MultiLine. " +
    "For categorical comparison use BarRank.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    series: z.array(SeriesSchema),
  }),
  component: ({ props }) => {
    const s = props.series?.[0];
    if (!s || !s.points?.length) return <Surface title={props.title ?? "Chart"} state={props.state ?? "healthy"}><NoData label="No series data" /></Surface>;
    const max = Math.max(...s.points.map((p) => p.y), 1);
    const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
    return (
      <Surface title={props.title ?? "Chart"} subtitle={props.subtitle} state={props.state}>
        <svg className="cnv-chart" viewBox="0 0 640 220" role="img"><path d={d} fill="none" stroke="var(--cnv-series-1)" strokeWidth="3" /></svg>
      </Surface>
    );
  },
});

// ── MultiLine — 2–4 series compared on one axis ─────────────────────────────
export const MultiLine = defineComponent({
  name: "MultiLine",
  description:
    "Multi-series line chart: compare 2–4 trends on the same axis (latency by model, bandwidth up/down). " +
    "For a single trend use LineChart. Each series is drawn in a distinct color.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    series: z.array(SeriesSchema),
  }),
  component: ({ props }) => {
    if (!props.series?.length || !props.series.some((s) => s.points?.length)) return <Surface title={props.title ?? "Chart"} state={props.state ?? "healthy"}><NoData label="No series data" /></Surface>;
    const series = props.series.filter((s) => s.points?.length).slice(0, 4);
    return (
      <Surface title={props.title ?? "Chart"} subtitle={props.subtitle} state={props.state}>
        <svg className="cnv-chart" viewBox="0 0 640 220" role="img">
          {series.map((s, si) => {
            const max = Math.max(...s.points.map((p) => p.y), 1);
            const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
            return <path key={s.name} d={d} fill="none" stroke={`var(--cnv-series-${si + 1})`} strokeWidth="3" />;
          })}
        </svg>
      </Surface>
    );
  },
});

// ── BarRank — categorical comparison via horizontal bars ────────────────────
export const BarRank = defineComponent({
  name: "BarRank",
  description:
    "Horizontal bar chart ranking items by a numeric value (top movies by size, queues by depth, hosts by load). " +
    "Pass items with a numeric value. For shares of a whole use Donut. For a single metric use Gauge.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
    metrics: z.array(MetricSchema).optional(),
  }),
  component: ({ props }) => {
    const src = (props.items?.length ? props.items : (props.metrics ?? []).map((m, i) => ({ id: String(i), label: m.label, value: m.value })));
    const numeric = src.filter((i) => typeof i.value === "number" && !Number.isNaN(i.value));
    if (!numeric.length) return <Surface title={props.title ?? "Bars"} state={props.state ?? "healthy"}><NoData label="No comparable values" /></Surface>;
    const max = Math.max(...numeric.map((i) => Number(i.value)), 1);
    return (
      <Surface title={props.title ?? "Bars"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-bars">
          {numeric.slice(0, 12).map((i) => (
            <article key={i.id}><label>{i.label}</label><div><i style={{ width: `${(Number(i.value) || 0) / max * 100}%` }} /></div><b>{i.value}</b></article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── Timeline — chronological events ─────────────────────────────────────────
export const Timeline = defineComponent({
  name: "Timeline",
  description:
    "Vertical timeline of timestamped events (recent activity, deployments, alerts over time). " +
    "Pass events with at, title, detail, state. For a raw log feed use LogStream. " +
    "For a time-series of numbers use LineChart.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    events: z.array(EventSchema),
  }),
  component: ({ props }) => {
    if (!props.events?.length) return <Surface title={props.title ?? "Timeline"} state={props.state ?? "healthy"}><NoData label="No events" /></Surface>;
    return (
      <Surface title={props.title ?? "Timeline"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-timeline">
          {props.events.map((e) => (
            <article key={e.id}><time>{e.at}</time><i /><div><strong>{e.title}</strong><small>{e.detail}</small></div></article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── EventStream — live event feed (alerts, logs, notifications) ─────────────
export const EventStream = defineComponent({
  name: "EventStream",
  description:
    "Scrollable feed of recent events with severity coloring (Wazuh alerts, fail2ban bans, container events). " +
    "Similar to Timeline but optimized for high-volume live feeds. Pass events with state for severity badges.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    events: z.array(EventSchema),
  }),
  component: ({ props }) => {
    if (!props.events?.length) return <Surface title={props.title ?? "Event Stream"} state={props.state ?? "healthy"}><NoData label="No events" /></Surface>;
    return (
      <Surface title={props.title ?? "Event Stream"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-timeline cnv-stream">
          {props.events.slice(0, 30).map((e) => (
            <article key={e.id} className={`evt-${e.state ?? "healthy"}`}><time>{e.at}</time><div><strong>{e.title}</strong><small>{e.detail}</small></div></article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── LogStream — raw text log lines ──────────────────────────────────────────
export const LogStream = defineComponent({
  name: "LogStream",
  description:
    "Monospace log viewer for raw text lines (Loki, journalctl, container logs). Pass items where label = log line. " +
    "For structured timestamped events use EventStream.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Logs"} state={props.state ?? "healthy"}><NoData label="No log lines" /></Surface>;
    return (
      <Surface title={props.title ?? "Logs"} subtitle={props.subtitle} state={props.state}>
        <pre className="cnv-logs">{props.items.slice(0, 50).map((i) => i.label).join("\n")}</pre>
      </Surface>
    );
  },
});

// ── NodeGraph — network/relationship topology ───────────────────────────────
export const NodeGraph = defineComponent({
  name: "NodeGraph",
  description:
    "SVG node-and-edge graph for topology and relationships (network mesh, service dependencies, dependency trees). " +
    "Pass nodes {id,label,x,y,state} and edges {source,target}. For a left-to-right pipeline use Sankey.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
  }),
  component: ({ props }) => {
    const triggerAction = useTriggerAction();
    if (!props.nodes?.length) return <Surface title={props.title ?? "Graph"} state={props.state ?? "healthy"}><NoData label="No nodes" /></Surface>;
    return (
      <Surface title={props.title ?? "Graph"} subtitle={props.subtitle} state={props.state}>
        <svg className="cnv-network" viewBox="0 0 800 430" role="img">
          {props.edges.map((e, i) => {
            const a = props.nodes.find((n) => n.id === e.source), b = props.nodes.find((n) => n.id === e.target);
            return a && b ? <line key={i} x1={a.x || 0} y1={a.y || 0} x2={b.x || 0} y2={b.y || 0} /> : null;
          })}
          {props.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x || 0} ${n.y || 0})`} className="cnv-node-clickable" style={{ cursor: "pointer" }} onClick={() => triggerAction(`Show details for ${n.label}`)}>
              <circle r="34" /><text textAnchor="middle" y="5">{n.label}</text>
            </g>
          ))}
        </svg>
      </Surface>
    );
  },
});

// ── Sankey — left-to-right flow/pipeline ────────────────────────────────────
export const Sankey = defineComponent({
  name: "Sankey",
  description:
    "Left-to-right flow diagram for pipelines and processes (CI/CD stages, data pipeline, request flow). " +
    "Pass nodes as ordered stages {id,label,value}. For a mesh/network topology use NodeGraph. " +
    "For a work-item board use Kanban.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
  }),
  component: ({ props }) => {
    if (!props.nodes?.length) return <Surface title={props.title ?? "Flow"} state={props.state ?? "healthy"}><NoData label="No stages" /></Surface>;
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

// ── DetailPanel — key/value detail card for a single entity ─────────────────
export const DetailPanel = defineComponent({
  name: "DetailPanel",
  description:
    "Key/value detail card for a single entity (host info, adapter config, device details). " +
    "Pass items as rows (label + value). Optionally nest a MetricStrip or Gauge in children. " +
    "For a multi-item comparison table use VisualTable.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
    children: z.array(MetricStrip.ref).optional(),
  }),
  component: ({ props, renderNode }) => {
    if (!props.items?.length && !props.children?.length) return <Surface title={props.title ?? "Details"} state={props.state ?? "healthy"}><NoData label="No details" /></Surface>;
    return (
      <Surface title={props.title ?? "Details"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-table">
          {(props.items ?? []).map((i) => (
            <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle}</small><span>{i.state || "healthy"}</span><b>{i.value}</b></article>
          ))}
        </div>
        {props.children?.length ? renderNode(props.children) : null}
      </Surface>
    );
  },
});

// ── Kanban — work-item board grouped by status ──────────────────────────────
export const Kanban = defineComponent({
  name: "Kanban",
  description:
    "Multi-column board grouping items by their group field (Vikunja tasks, CI jobs by stage, containers by status). " +
    "Pass items with a group field (the column). Items are clickable — clicking drills down to detail. " +
    "For a ranked list use VisualTable. For a pipeline flow use Sankey.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
    children: z.array(DetailPanel.ref).optional(),
  }),
  component: ({ props, renderNode }) => {
    const triggerAction = useTriggerAction();
    if (!props.items?.length && !props.children?.length) return <Surface title={props.title ?? "Board"} state={props.state ?? "healthy"}><NoData label="No items" /></Surface>;
    const groups = [...new Set((props.items ?? []).map((i) => i.group || "Active"))];
    return (
      <Surface title={props.title ?? "Board"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-board">
          {groups.map((g) => (
            <section key={g}>
              <h4>{g}</h4>
              {(props.items ?? []).filter((i) => (i.group || "Active") === g).map((i) => (
                <article key={i.id} className="cnv-row-clickable" onClick={() => triggerAction(`Show details for ${i.label}${i.subtitle ? ` (${i.subtitle})` : ""}`)}>
                  <strong>{i.label}</strong><small>{i.subtitle}</small>
                </article>
              ))}
            </section>
          ))}
        </div>
        {props.children?.length ? renderNode(props.children) : null}
      </Surface>
    );
  },
});

// ── VisualTable — row-based list/grid of items ──────────────────────────────
export const VisualTable = defineComponent({
  name: "VisualTable",
  description:
    "Row-based table/list of items with label, subtitle, state, and value (inventory, fleet, config rows). " +
    "Pass items. For work-items grouped into columns use Kanban. For a ranked bar comparison use BarRank.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    const triggerAction = useTriggerAction();
    if (!props.items?.length) return <Surface title={props.title ?? "Table"} state={props.state ?? "healthy"}><NoData label="No rows" /></Surface>;
    return (
      <Surface title={props.title ?? "Table"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-table">
          {props.items.map((i) => (
            <article key={i.id} className="cnv-row-clickable" onClick={() => triggerAction(`Show details for ${i.label}${i.subtitle ? ` (${i.subtitle})` : ""}`)}>
              <strong>{i.label}</strong><small>{i.subtitle}</small><span>{i.state || "healthy"}</span><b>{i.value}</b>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── ArtworkWall — image poster/artwork grid ─────────────────────────────────
export const ArtworkWall = defineComponent({
  name: "ArtworkWall",
  description:
    "Grid of poster/artwork thumbnails for media libraries (Emby, Sonarr, Radarr, RomM). " +
    "Pass items with image, label, subtitle, progress. For currently-playing sessions use PlaybackSessions.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    const triggerAction = useTriggerAction();
    if (!props.items?.length) return <Surface title={props.title ?? "Artwork"} state={props.state ?? "healthy"}><NoData label="No items" /></Surface>;
    return (
      <Surface title={props.title ?? "Artwork"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-posters">
          {props.items.slice(0, 18).map((i) => (
            <article key={i.id} className="cnv-row-clickable" onClick={() => triggerAction(`Show details for ${i.label}${i.subtitle ? ` (${i.subtitle})` : ""}`)}>
              <div className="cnv-art" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined}><b>{i.label}</b></div>
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

// ── PlaybackSessions — active media streams with progress ───────────────────
export const PlaybackSessions = defineComponent({
  name: "PlaybackSessions",
  description:
    "Active playback/transcode sessions with progress bars and stream details (Emby/Jellyfin active streams). " +
    "Pass items with image, label, subtitle, progress, meta.mode. For a static poster grid use ArtworkWall.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Sessions"} state={props.state ?? "healthy"}><NoData label="No active sessions" /></Surface>;
    return (
      <Surface title={props.title ?? "Sessions"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-playback">
          {props.items.slice(0, 8).map((i) => (
            <article key={i.id}>
              <div className="cnv-art" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined} />
              <div>
                <strong>{i.label}</strong>
                <small>{i.subtitle}</small>
                {i.progress != null && <div className="cnv-progress"><i style={{ width: `${i.progress * 100}%` }} /></div>}
              </div>
              <span>{String(i.meta?.mode ?? "direct")}</span>
            </article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── Capacity — gauge + supporting metrics + trend ───────────────────────────
export const Capacity = defineComponent({
  name: "Capacity",
  description:
    "Composite storage/capacity view: a percentage donut plus a metrics row and a mini trend chart. " +
    "Use for storage pools, volume groups, NAS bays. metrics[0].value is the used percentage. " +
    "For a simple single percentage without extras use Gauge.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema),
    series: z.array(SeriesSchema).optional(),
  }),
  component: ({ props }) => {
    const usedRaw = Number(props.metrics?.[0]?.value);
    const used = !props.metrics?.length || Number.isNaN(usedRaw) ? null : usedRaw;
    if (used === null) return <Surface title={props.title ?? "Capacity"} state={props.state ?? "healthy"}><NoData label="No capacity metric" /></Surface>;
    return (
      <Surface title={props.title ?? "Capacity"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-capacity">
          <div style={{ background: `conic-gradient(var(--cnv-series-1) 0 ${used}%, #2b2f3a ${used}%)` }}><strong>{used}%</strong></div>
          <section>
            <MetricsView metrics={props.metrics} />
            {props.series?.[0]?.points?.length ? (
              <svg className="cnv-chart" viewBox="0 0 640 220" role="img">
                {(() => {
                  const s = props.series![0]; const max = Math.max(...s.points.map((p) => p.y), 1);
                  const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" ");
                  return <path d={d} fill="none" stroke="var(--cnv-series-1)" strokeWidth="3" />;
                })()}
              </svg>
            ) : null}
          </section>
        </div>
      </Surface>
    );
  },
});

// ── SecurityPosture — severity matrix + summary ─────────────────────────────
export const SecurityPosture = defineComponent({
  name: "SecurityPosture",
  description:
    "Security overview: a metrics summary row plus a state-colored item grid (Wazuh alerts by severity, fail2ban, posture). " +
    "Pass metrics for counts and items for the grid (each item colored by state). For a feed of alerts use EventStream.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    if (!props.metrics?.length && !props.items?.length) return <Surface title={props.title ?? "Security"} state={props.state ?? "healthy"}><NoData label="No security data" /></Surface>;
    return (
      <Surface title={props.title ?? "Security"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-health">
          {props.metrics?.length ? <MetricsView metrics={props.metrics} /> : null}
          {props.items?.length ? (
            <div className="cnv-matrix">
              {props.items.map((i) => (
                <article key={i.id} data-state={i.state}><i /><strong>{i.label}</strong><small>{i.subtitle}</small></article>
              ))}
            </div>
          ) : null}
        </div>
      </Surface>
    );
  },
});

// ── Heatmap — calendar/grid density matrix ──────────────────────────────────
export const Heatmap = defineComponent({
  name: "Heatmap",
  description:
    "Grid/matrix of state-colored cells for density or posture overviews (activity by day, coverage map). " +
    "Pass items mapped to cells, colored by state. For proportional shares use Donut. For numeric trends use LineChart.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Heatmap"} state={props.state ?? "healthy"}><NoData label="No cells" /></Surface>;
    return (
      <Surface title={props.title ?? "Heatmap"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-matrix">
          {props.items.map((i) => (
            <article key={i.id} data-state={i.state}><i /><strong>{i.label}</strong><small>{i.subtitle}</small></article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── MarkdownReader — rendered markdown with ToC and backlinks ───────────────
export const MarkdownReader = defineComponent({
  name: "MarkdownReader",
  description:
    "Rendered markdown document with a table-of-contents sidebar and a backlinks sidebar (wiki notes, runbooks, docs). " +
    "Pass markdown text plus items for backlinks. For a list of documents use VisualTable.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    markdown: z.string(),
    items: z.array(ItemSchema).optional(),
  }),
  component: ({ props }) => {
    const md = props.markdown || "";
    const lines = md.split("\n");
    return (
      <Surface title={props.title ?? "Document"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-knowledge-reader">
          <aside>
            <strong>On this page</strong>
            {lines.filter((x) => x.startsWith("##")).map((x) => <a key={x}>{x.replace(/^#+\s*/, "")}</a>)}
          </aside>
          <article>
            {lines.map((x, i) => x.startsWith("##") ? <h2 key={i}>{x.replace(/^#+\s*/, "")}</h2> : x.startsWith("```") ? null : <p key={i}>{x.replace(/\*\*/g, "")}</p>)}
          </article>
          <aside>
            <strong>Backlinks</strong>
            {(props.items ?? []).slice(0, 5).map((i) => <a key={i.id}>{i.label}</a>)}
          </aside>
        </div>
      </Surface>
    );
  },
});

// ── KnowledgeGraph — concept graph with optional path strip ─────────────────
export const KnowledgeGraph = defineComponent({
  name: "KnowledgeGraph",
  description:
    "Concept/relationship graph for knowledge bases — nodes as concepts, edges as relationships, with an optional path strip. " +
    "Pass nodes and edges. Pass path=true to show the first 5 nodes as a relationship chain. " +
    "For service topology use NodeGraph.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    path: z.boolean().optional(),
  }),
  component: ({ props }) => {
    if (!props.nodes?.length) return <Surface title={props.title ?? "Knowledge Graph"} state={props.state ?? "healthy"}><NoData label="No concepts" /></Surface>;
    return (
      <Surface title={props.title ?? "Knowledge Graph"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-knowledge-graph">
          <svg className="cnv-network" viewBox="0 0 800 430" role="img">
            {props.edges.map((e, i) => {
              const a = props.nodes.find((n) => n.id === e.source), b = props.nodes.find((n) => n.id === e.target);
              return a && b ? <line key={i} x1={a.x || 0} y1={a.y || 0} x2={b.x || 0} y2={b.y || 0} /> : null;
            })}
            {props.nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x || 0} ${n.y || 0})`}><circle r="34" /><text textAnchor="middle" y="5">{n.label}</text></g>
            ))}
          </svg>
          {props.path && (
            <div className="cnv-path-strip">
              {props.nodes.slice(0, 5).map((n, i) => (
                <React.Fragment key={n.id}><span>{n.label}</span>{i < Math.min(4, props.nodes.length - 1) && <b>→</b>}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      </Surface>
    );
  },
});

// ── Backlinks — documents referencing a concept ─────────────────────────────
export const Backlinks = defineComponent({
  name: "Backlinks",
  description:
    "List of documents/notes that reference a concept, with an evidence count. " +
    "Pass items where meta.evidence is the count. For the document itself use MarkdownReader.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    state: VisualStateSchema.optional(),
    items: z.array(ItemSchema),
  }),
  component: ({ props }) => {
    if (!props.items?.length) return <Surface title={props.title ?? "Backlinks"} state={props.state ?? "healthy"}><NoData label="No backlinks" /></Surface>;
    return (
      <Surface title={props.title ?? "Backlinks"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-backlinks">
          {props.items.slice(0, 8).map((i) => (
            <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle || "Links to this concept with supporting context."}</small><span>{Number(i.meta?.evidence ?? 1)} evidence</span></article>
          ))}
        </div>
      </Surface>
    );
  },
});

// ── Callout — highlighted summary / alert banner ────────────────────────────
export const Callout = defineComponent({
  name: "Callout",
  description:
    "Highlighted alert or summary banner with a headline, supporting text, and optional metrics row. " +
    "Use for warnings, status summaries, or single-point attention. For an interactive feed use EventStream.",
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    summary: z.string().optional(),
    state: VisualStateSchema.optional(),
    metrics: z.array(MetricSchema).optional(),
  }),
  component: ({ props }) => {
    return (
      <Surface title={props.title ?? "Attention"} subtitle={props.subtitle} state={props.state ?? "warning"}>
        <div className="cnv-callout">
          <strong>{props.summary || props.title || "Attention needed"}</strong>
          <p>{props.subtitle || "Review the supporting context and choose the next action."}</p>
          {props.metrics?.length ? <MetricsView metrics={props.metrics} /> : null}
        </div>
      </Surface>
    );
  },
});

// ── EmptyState — explicit placeholder when nothing applies ───────────────────
export const EmptyState = defineComponent({
  name: "EmptyState",
  description:
    "Explicit placeholder panel shown when no data is available or no component matches the request. " +
    "Use sparingly — prefer a real component with its own no-data state. state drives the message.",
  props: z.object({
    title: z.string().optional(),
    state: VisualStateSchema.optional(),
    summary: z.string().optional(),
  }),
  component: ({ props }) => {
    return (
      <Surface title={props.title ?? "Empty"} state={props.state ?? "empty"}>
        <div className="cnv-state"><strong>{props.summary || "No matching data"}</strong></div>
      </Surface>
    );
  },
});

// ── FilterDropdown — reactive filter that re-runs queries (Phase 4.1) ────────
export const FilterDropdown = defineComponent({
  name: "FilterDropdown",
  description:
    "Interactive dropdown filter. name is the $variable to bind — reference it as $<name> in a Query()'s args. " +
    "When the user selects an option, every Query() referencing that $variable re-fetches automatically. " +
    "value is the initial selection (optional). Each option: {value, label}. " +
    "Place inside a Stack at the top of a dashboard to control the panels below.",
  props: z.object({
    name: z.string(),
    label: z.string().optional(),
    value: reactive(z.string().optional()),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
  component: ({ props }) => {
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

// ── Section — grouping container for nested layouts (Phase 4.3) ─────────────
// Tight children union: only leaf/display components may nest inside a Section.
// Containers (Kanban, DetailPanel, Section itself) are intentionally excluded
// so the model cannot nest a dashboard inside a dashboard.
export const Section = defineComponent({
  name: "Section",
  description:
    "Grouping container that renders a title and a vertical stack of child panels. " +
    "Use to organize a dashboard into named regions. children accepts a tight set of display components: " +
    "MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall. " +
    "Do NOT nest Section, Kanban, or Stack inside a Section.",
  props: z.object({
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
  component: ({ props, renderNode }) => {
    return (
      <Surface title={props.title ?? "Section"} subtitle={props.subtitle} state={props.state}>
        <div className="cnv-section">{renderNode(props.children)}</div>
      </Surface>
    );
  },
});
