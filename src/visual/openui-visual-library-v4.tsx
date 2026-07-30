import React from "react";
import { z } from "zod";
import { defineComponent, createLibrary, type ComponentRenderProps } from "@openuidev/react-lang";
import manifest from "./visual-component-manifest-v4.json";
import "./cyber-noir-visual-components-v4.css";

export const VisualStateSchema = z.enum(["healthy", "warning", "critical", "offline", "stale", "loading", "empty", "denied"]);
export const MetricSchema = z.object({ label: z.string(), value: z.union([z.string(), z.number()]), unit: z.string().optional(), trend: z.number().optional(), state: VisualStateSchema.optional() });
export const ItemSchema = z.object({ id: z.string(), label: z.string(), subtitle: z.string().optional(), image: z.string().optional(), value: z.union([z.string(), z.number()]).optional(), progress: z.number().min(0).max(1).optional(), state: VisualStateSchema.optional(), group: z.string().optional(), meta: z.record(z.string(), z.any()).optional() });
export const SeriesSchema = z.object({ name: z.string(), unit: z.string().optional(), points: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })) });
export const NodeSchema = z.object({ id: z.string(), label: z.string(), x: z.number().optional(), y: z.number().optional(), state: VisualStateSchema.optional(), value: z.number().optional() });
export const EdgeSchema = z.object({ source: z.string(), target: z.string(), label: z.string().optional(), value: z.number().optional(), state: VisualStateSchema.optional() });
export const EventSchema = z.object({ id: z.string(), at: z.string(), title: z.string(), detail: z.string().optional(), image: z.string().optional(), state: VisualStateSchema.optional(), durationMs: z.number().optional() });
export const VisualDataSchema = z.object({ title: z.string().optional(), subtitle: z.string().optional(), state: VisualStateSchema.default("healthy"), density: z.enum(["compact", "comfortable", "immersive"]).default("comfortable"), metrics: z.array(MetricSchema).default([]), items: z.array(ItemSchema).default([]), series: z.array(SeriesSchema).default([]), nodes: z.array(NodeSchema).default([]), edges: z.array(EdgeSchema).default([]), events: z.array(EventSchema).default([]), summary: z.string().optional(), updatedAt: z.string().optional(), markdown: z.string().optional(), html: z.string().optional(), selectedId: z.string().optional(), query: z.string().optional() });
export type VisualData = z.infer<typeof VisualDataSchema>;

const familyNames = ["hero", "metric-strip", "story-card", "callout", "empty-state", "artwork-wall", "album-wall", "playback-sessions", "carousel", "cover-flow", "mosaic", "quality-overlay", "timeline", "thumbnail-timeline", "event-stream", "calendar", "calendar-heatmap", "gantt", "line-chart", "multi-line", "bar-rank", "stacked-bar", "scatter", "histogram", "small-multiples", "radar", "donut", "gauge", "sparkline", "treemap", "sunburst", "heatmap", "matrix-heatmap", "word-cloud", "distribution", "sankey", "chord", "funnel", "waterfall", "node-graph", "tree", "map", "floorplan", "kanban", "stepper", "visual-table", "matrix", "bubble", "waveform", "queue-river", "entity-gallery", "capacity", "pipeline", "security-posture", "room-board", "energy-flow", "log-stream", "detail-panel", "comparison", "markdown-reader", "document-tree", "document-outline", "knowledge-search", "backlinks", "related-notes", "knowledge-graph", "relationship-path", "provenance-graph", "temporal-knowledge", "semantic-clusters", "citation-trail", "graph-inspector", "graph-legend", "knowledge-health", "query-evidence", "document-diff", "graph-minimap", "relationship-matrix", "knowledge-workspace"] as const;
type Family = typeof familyNames[number];

function Surface({ title, subtitle, children, state = "healthy" }: { title: string; subtitle?: string; children: React.ReactNode; state?: string }) {
  return <section className={`cnv cnv-surface state-${state}`}><header className="cnv-head"><div><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}</div><span className="cnv-badge">{state}</span></header>{children}</section>;
}
function EmptyState({ state }: { state: string }) {
  if (state === "healthy" || state === "warning" || state === "critical") return null;
  return <div className="cnv-state"><strong>{state === "loading" ? "Loading visualization" : state === "empty" ? "No matching data" : state === "denied" ? "Permission required" : state === "stale" ? "Data is stale" : "Source unavailable"}</strong></div>;
}
function NoData({ label = "No data" }: { label?: string }) {
  return <div className="cnv-state-nodata"><strong>{label}</strong></div>;
}
function Metrics({ data }: { data: VisualData }) {
  return <div className="cnv-metrics">{data.metrics.slice(0, 6).map(m => <article key={m.label}><small>{m.label}</small><strong>{m.value}{m.unit}</strong>{m.trend != null && <span>{m.trend > 0 ? "↗" : "↘"} {Math.abs(m.trend)}%</span>}</article>)}</div>;
}
function Artwork({ data, square = false }: { data: VisualData; square?: boolean }) {
  return <div className={square ? "cnv-albums" : "cnv-posters"}>{data.items.slice(0, 18).map(i => <article key={i.id}><div className="cnv-art" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined}><b>{i.label}</b></div><strong>{i.label}</strong><small>{i.subtitle}</small>{i.progress != null && <i style={{ width: `${i.progress * 100}%` }} />}</article>)}</div>;
}
function Playback({ data }: { data: VisualData }) {
  return <div className="cnv-playback">{data.items.slice(0, 8).map(i => <article key={i.id}><div className="cnv-art" style={i.image ? { backgroundImage: `url(${i.image})` } : undefined} /><div><strong>{i.label}</strong><small>{i.subtitle}</small>{i.progress != null && <div className="cnv-progress"><i style={{ width: `${i.progress * 100}%` }} /></div>}</div><span>{String(i.meta?.mode ?? "direct")}</span></article>)}</div>;
}
function Timeline({ data }: { data: VisualData }) {
  return <div className="cnv-timeline">{data.events.map(e => <article key={e.id}><time>{e.at}</time><i /><div><strong>{e.title}</strong><small>{e.detail}</small></div></article>)}</div>;
}
function Chart({ data, multi = false }: { data: VisualData; multi?: boolean }) {
  if (!data.series.length) return <NoData label="No time-series data" />;
  const series = data.series;
  return <svg className="cnv-chart" viewBox="0 0 640 220" role="img">{series.slice(0, multi ? 4 : 1).map((s, si) => { const max = Math.max(...s.points.map(p => p.y), 1); const d = s.points.map((p, i) => `${i ? "L" : "M"} ${20 + i * (600 / Math.max(1, s.points.length - 1))} ${190 - (p.y / max) * 150}`).join(" "); return <path key={s.name} d={d} fill="none" stroke={`var(--cnv-series-${si + 1})`} strokeWidth="3" /> })}</svg>;
}
function Bars({ data }: { data: VisualData }) {
  if (!data.items.length) return <NoData label="No data to rank" />;
  const items = data.items;
  const max = Math.max(...items.map(i => Number(i.value) || 0), 1);
  return <div className="cnv-bars">{items.slice(0, 12).map(i => <article key={i.id}><label>{i.label}</label><div><i style={{ width: `${(Number(i.value) || 0) / max * 100}%` }} /></div><b>{i.value}</b></article>)}</div>;
}
function Network({ data }: { data: VisualData }) {
  return <svg className="cnv-network" viewBox="0 0 800 430" role="img">{data.edges.map((e, i) => { const a = data.nodes.find(n => n.id === e.source), b = data.nodes.find(n => n.id === e.target); return a && b ? <line key={i} x1={a.x || 0} y1={a.y || 0} x2={b.x || 0} y2={b.y || 0} /> : null })}{data.nodes.map(n => <g key={n.id} transform={`translate(${n.x || 0} ${n.y || 0})`}><circle r="34" /><text textAnchor="middle" y="5">{n.label}</text></g>)}</svg>;
}
function Board({ data }: { data: VisualData }) {
  const groups = [...new Set(data.items.map(i => i.group || "Active"))];
  return <div className="cnv-board">{groups.map(g => <section key={g}><h4>{g}</h4>{data.items.filter(i => (i.group || "Active") === g).map(i => <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle}</small></article>)}</section>)}</div>;
}
function Table({ data }: { data: VisualData }) {
  return <div className="cnv-table">{data.items.map(i => <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle}</small><span>{i.state || "healthy"}</span><b>{i.value}</b></article>)}</div>;
}
function Flow({ data }: { data: VisualData }) {
  return <div className="cnv-flow">{data.nodes.slice(0, 8).map((n, i) => <React.Fragment key={n.id}><article><strong>{n.label}</strong><small>{n.value}</small></article>{i < data.nodes.length - 1 && <i />}</React.Fragment>)}</div>;
}
function Matrix({ data }: { data: VisualData }) {
  return <div className="cnv-matrix">{data.items.map(i => <article key={i.id} data-state={i.state}><i /><strong>{i.label}</strong><small>{i.subtitle}</small></article>)}</div>;
}
function Capacity({ data }: { data: VisualData }) {
  if (!data.metrics.length) return <NoData label="No capacity data" />;
  const used = Number(data.metrics[0].value);
  if (!Number.isFinite(used)) return <NoData label="No capacity data" />;
  return <div className="cnv-capacity"><div style={{ background: `conic-gradient(var(--cnv-series-1) 0 ${used}%, #2b2f3a ${used}%)` }}><strong>{used}%</strong></div><section><Metrics data={data} /><Chart data={data} /></section></div>;
}
function Cloud({ data }: { data: VisualData }) {
  if (!data.items.length && !data.metrics.length) return <NoData label="No data for cloud" />;
  const words = (data.items.length ? data.items.map(i => i.label) : data.metrics.map(m => m.label)).slice(0, 30);
  return <div className="cnv-cloud">{words.map((w, i) => <span key={w} style={{ fontSize: `${12 + (i % 7) * 3}px` }}>{w}</span>)}</div>;
}
function Callout({ data }: { data: VisualData }) {
  return <div className="cnv-callout"><strong>{data.summary || data.title || "Attention needed"}</strong><p>{data.subtitle || "Review the supporting context and choose the next action."}</p><Metrics data={data} /></div>;
}
function Wave({ data }: { data: VisualData }) {
  const pts = data.series[0]?.points;
  if (!pts || !pts.length) return <NoData label="No waveform data" />;
  return <div className="cnv-wave">{pts.map((p, i) => <i key={i} style={{ height: `${Math.max(8, p.y)}%` }} />)}</div>;
}

function MarkdownReader({ data }: { data: VisualData }) {
  if (!data.markdown) return <NoData label="No document content" />;
  const md = data.markdown;
  const lines = md.split("\n");
  return <div className="cnv-knowledge-reader"><aside><strong>On this page</strong>{lines.filter(x => x.startsWith("##")).map(x => <a key={x}>{x.replace(/^#+\s*/, "")}</a>)}</aside><article>{lines.map((x, i) => x.startsWith("##") ? <h2 key={i}>{x.replace(/^#+\s*/, "")}</h2> : x.startsWith("```") ? null : <p key={i}>{x.replace(/\*\*/g, "")}</p>)}</article><aside><strong>Backlinks</strong>{data.items.slice(0, 5).map(i => <a key={i.id}>{i.label}</a>)}</aside></div>;
}
function DocumentTree({ data }: { data: VisualData }) {
  return <div className="cnv-doc-tree">{data.items.slice(0, 14).map((i, n) => <article key={i.id} className={n === 0 ? "active" : ""}><span>{i.meta?.folder ? "▾" : "◇"}</span><div><strong>{i.label}</strong><small>{i.subtitle}</small></div></article>)}</div>;
}
function KnowledgeGraph({ data, path = false }: { data: VisualData; path?: boolean }) {
  return <div className="cnv-knowledge-graph"><Network data={data} />{path && <div className="cnv-path-strip">{data.nodes.slice(0, 5).map((n, i) => <React.Fragment key={n.id}><span>{n.label}</span>{i < Math.min(4, data.nodes.length - 1) && <b>→</b>}</React.Fragment>)}</div>}</div>;
}
function Backlinks({ data }: { data: VisualData }) {
  return <div className="cnv-backlinks">{data.items.slice(0, 8).map(i => <article key={i.id}><strong>{i.label}</strong><small>{i.subtitle || "Links to this concept with supporting context."}</small><span>{Number(i.meta?.evidence ?? 1)} evidence</span></article>)}</div>;
}
function SearchResults({ data }: { data: VisualData }) {
  if (!data.items.length) return <NoData label="No search results" />;
  return <div className="cnv-search-results">{data.items.slice(0, 8).map((i, n) => <article key={i.id}><b>{n + 1}</b><div><strong>{i.label}</strong><small>{i.subtitle}</small></div><span>{i.value || ""}</span></article>)}</div>;
}
function KnowledgeHealthView({ data }: { data: VisualData }) {
  return <div className="cnv-health"><Metrics data={data} /><Matrix data={data} /></div>;
}
function QueryEvidence({ data }: { data: VisualData }) {
  return <div className="cnv-evidence-canvas"><section><small>GENERATED ANSWER</small><h3>{data.summary || "These systems connect through a documented, evidence-backed path."}</h3><p>{data.subtitle}</p></section><KnowledgeGraph data={data} path /><Backlinks data={data} /></div>;
}
function DocumentDiffView({ data }: { data: VisualData }) {
  return <div className="cnv-diff"><section><small>BEFORE</small>{data.items.slice(0, 5).map(i => <p key={i.id}>− {i.label}</p>)}</section><section><small>AFTER</small>{data.items.slice(0, 5).map(i => <p key={i.id}>+ {i.subtitle || i.label}</p>)}</section></div>;
}

function Renderer({ family, data }: { family: Family; data: VisualData }) {
  const title = data.title || family.replace(/-/g, " ");
  const stateView = <EmptyState state={data.state} />;
  if (stateView) return <Surface title={title} subtitle={data.subtitle} state={data.state}>{stateView}</Surface>;
  let body: React.ReactNode = null;
  switch (family) {
    case "hero": body = <><Metrics data={data} /><Artwork data={data} /></>; break;
    case "metric-strip": body = <Metrics data={data} />; break;
    case "callout": body = <Callout data={data} />; break;
    case "empty-state": body = <div className="cnv-state"><strong>{data.summary || "No matching data"}</strong></div>; break;
    case "artwork-wall": case "quality-overlay": body = <Artwork data={data} />; break;
    case "album-wall": body = <Artwork data={data} square />; break;
    case "playback-sessions": body = <Playback data={data} />; break;
    case "carousel": case "cover-flow": case "mosaic": body = <Artwork data={data} square={family === "mosaic"} />; break;
    case "timeline": case "thumbnail-timeline": case "event-stream": case "story-card": body = <Timeline data={data} />; break;
    case "calendar": body = <Board data={data} />; break;
    case "calendar-heatmap": body = <Matrix data={data} />; break;
    case "gantt": body = <Flow data={data} />; break;
    case "line-chart": case "sparkline": body = <><Chart data={data} /><Metrics data={data} /></>; break;
    case "multi-line": case "small-multiples": case "scatter": case "radar": body = <Chart data={data} multi />; break;
    case "bar-rank": case "stacked-bar": case "histogram": case "distribution": body = <Bars data={data} />; break;
    case "node-graph": case "tree": case "map": case "floorplan": case "chord": body = <Network data={data} />; break;
    case "sankey": case "funnel": case "waterfall": case "pipeline": case "stepper": case "energy-flow": body = <Flow data={data} />; break;
    case "kanban": case "room-board": body = <Board data={data} />; break;
    case "visual-table": case "log-stream": case "detail-panel": case "comparison": body = <Table data={data} />; break;
    case "markdown-reader": body = <MarkdownReader data={data} />; break;
    case "document-tree": case "document-outline": body = <DocumentTree data={data} />; break;
    case "knowledge-search": body = <SearchResults data={data} />; break;
    case "backlinks": case "related-notes": case "citation-trail": body = <Backlinks data={data} />; break;
    case "knowledge-graph": case "semantic-clusters": case "provenance-graph": case "temporal-knowledge": case "graph-minimap": body = <KnowledgeGraph data={data} />; break;
    case "relationship-path": body = <KnowledgeGraph data={data} path />; break;
    case "graph-inspector": case "graph-legend": body = <Table data={data} />; break;
    case "knowledge-health": case "relationship-matrix": body = <KnowledgeHealthView data={data} />; break;
    case "query-evidence": case "knowledge-workspace": body = <QueryEvidence data={data} />; break;
    case "document-diff": body = <DocumentDiffView data={data} />; break;
    case "matrix": case "heatmap": case "matrix-heatmap": case "security-posture": body = <Matrix data={data} />; break;
    case "capacity": case "treemap": case "sunburst": case "donut": case "gauge": body = <Capacity data={data} />; break;
    case "waveform": body = <Wave data={data} />; break;
    case "bubble": case "word-cloud": body = <Cloud data={data} />; break;
    case "entity-gallery": body = <Artwork data={data} square />; break;
    case "queue-river": body = <Table data={data} />; break;
  }
  return <Surface title={title} subtitle={data.subtitle} state={data.state}>{body}</Surface>;
}

const manifestComponents = manifest.components as Array<{ component: string; purpose: string; renderer_family: string }>;
const mapped = manifestComponents.map(spec => defineComponent({
  name: spec.component,
  description: `${spec.purpose} Renderer family: ${spec.renderer_family}.`,
  props: VisualDataSchema,
  component: ({ props }: ComponentRenderProps<VisualData>) => <Renderer family={spec.renderer_family as Family} data={props} />,
}));
export const visualLibrary = createLibrary({ components: mapped });
export { Renderer, familyNames };
