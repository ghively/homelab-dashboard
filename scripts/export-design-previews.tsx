/**
 * Render every homelab visual component to a standalone preview HTML file for
 * the Claude Design project.
 *
 * Each file carries a `@dsCard` marker on line 1, which is what the Design
 * System pane indexes — no explicit asset registration is needed.
 *
 * Run via the CJS wrapper, which installs the stubs this needs:
 *   node --import tsx scripts/export-design-previews.cjs
 *   (or: npm run export:design)
 *
 * Output goes to .design-export/ (gitignored) and is uploaded by DesignSync.
 *
 * Why the wrapper: components/index.tsx imports a .css file and OpenUI's chart
 * helpers touch `document`, neither of which exists under plain node. The
 * wrapper also stubs useTriggerAction/useStateField — four components call them
 * and they are only legal inside a live <Renderer>, so rendering here would
 * otherwise throw.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { homelabComponents } from "@/visual/components";

const OUT = ".design-export";

/* ── Sample data ───────────────────────────────────────────────
   Real values from the live fleet wherever possible, so the cards show the
   dashboard as it actually looks rather than lorem. */

const metrics = [
  { label: "Shows", value: 260, state: "healthy" },
  { label: "Continuing", value: 68, state: "healthy" },
  { label: "Ended", value: 192, state: "healthy" },
  { label: "Disk Used", value: 71, unit: "%", state: "warning" },
];

const items = [
  { id: "1", label: "Severance", subtitle: "Apple TV+ · continuing", image: "/media-demo/severance.svg", progress: 0.62, state: "healthy", meta: { year: 2025, quality: "4K HDR" } },
  { id: "2", label: "The Bear", subtitle: "FX · continuing", image: "/media-demo/bear.svg", progress: 0.42, state: "healthy", meta: { year: 2025, quality: "4K" } },
  { id: "3", label: "Dune", subtitle: "Max · continuing", image: "/media-demo/dune.svg", progress: 0.78, state: "stale", meta: { year: 2024, quality: "4K HDR" } },
  { id: "4", label: "Foundation", subtitle: "Apple TV+ · continuing", image: "/media-demo/foundation.svg", progress: 0.31, state: "healthy", meta: { year: 2025, quality: "4K HDR" } },
];

const series = [
  {
    name: "Volume fill",
    unit: "%",
    points: Array.from({ length: 24 }, (_, i) => ({
      x: `${i}:00`,
      y: 58 + Math.round(Math.sin(i / 3) * 9 + i * 0.5),
    })),
  },
];

const events = [
  { id: "e1", at: "09:12", title: "volume_2 reached 100%", detail: "DSM flagged attention", state: "warning" },
  { id: "e2", at: "08:40", title: "Sonarr imported 3 episodes", detail: "gh-storage", state: "healthy" },
  { id: "e3", at: "07:55", title: "LiteLLM endpoint unhealthy", detail: "6 of 22 models", state: "critical" },
];

const nodes = [
  { id: "gh-ai", label: "gh-ai", x: 0.1, y: 0.5, state: "healthy" },
  { id: "caddy", label: "caddy", x: 0.45, y: 0.5, state: "healthy" },
  { id: "emby", label: "emby", x: 0.8, y: 0.25, state: "healthy" },
  { id: "syn", label: "synology", x: 0.8, y: 0.75, state: "warning" },
];

const edges = [
  { source: "gh-ai", target: "caddy", value: 4 },
  { source: "caddy", target: "emby", value: 3 },
  { source: "caddy", target: "syn", value: 2 },
];

const base = { title: "Sonarr", subtitle: "260 shows tracked", state: "healthy" as const };

/** Props per component. Anything absent renders its own no-data state, which is
 *  itself worth seeing on a card. */
const PROPS: Record<string, Record<string, unknown>> = {
  MetricStrip: { ...base, metrics },
  Gauge: { title: "Volume 2", subtitle: "gh-storage", value: 100, max: 100, unit: "%", state: "critical", thresholds: { warning: 75, critical: 90 } },
  Donut: { ...base, title: "Library split", segments: [{ label: "TV", value: 26392 }, { label: "Movies", value: 523 }, { label: "Collections", value: 61 }] },
  LineChart: { ...base, title: "NAS capacity", series },
  MultiLine: { ...base, title: "Fleet load", series: [series[0], { name: "CPU", unit: "%", points: series[0].points.map((p) => ({ x: p.x, y: p.y * 0.6 })) }] },
  BarRank: { ...base, title: "Largest libraries", items },
  Timeline: { ...base, title: "Recent activity", events },
  EventStream: { ...base, title: "Live events", events },
  LogStream: { ...base, title: "Adapter log", events },
  NodeGraph: { ...base, title: "Tailnet topology", nodes, edges },
  Sankey: { ...base, title: "Query routing", nodes, edges },
  Kanban: { ...base, title: "Download queue", items },
  VisualTable: { ...base, title: "Series library", items },
  ArtworkWall: { ...base, title: "Recently added", items },
  PlaybackSessions: { ...base, title: "Now playing", items: items.slice(0, 2) },
  Capacity: { ...base, title: "Storage", state: "warning", metrics: [{ label: "Used", value: 71, unit: "%" }], series },
  SecurityPosture: { ...base, title: "Wazuh", items: items.slice(0, 3), metrics: metrics.slice(0, 3) },
  MarkdownReader: { ...base, title: "Runbook", markdown: "## Synology\n\n`volume_2` is full. DSM reports **attention**.\n\n- Free space or expand the pool\n- Re-check SMART on the Seagate drives" },
  KnowledgeGraph: { ...base, title: "Adapter map", nodes, edges },
  Backlinks: { ...base, title: "Referenced by", items: items.slice(0, 3) },
  DetailPanel: { ...base, title: "volume_2", metrics: metrics.slice(0, 3), summary: "15.3 TB of 15.3 TB used. DSM status: attention." },
  Callout: { title: "Disk full", state: "critical", summary: "volume_2 has no free space. DSM has flagged it for attention.", metrics: metrics.slice(0, 2) },
  EmptyState: { title: "RomM", state: "empty", summary: "Service not configured — showing sample data." },
  RoomBoard: { ...base, title: "Home", items: items.slice(0, 3) },
  Flow: { ...base, title: "Query pipeline", nodes },
  FilterDropdown: { name: "status", label: "Series status", value: "continuing", options: [{ value: "all", label: "All series" }, { value: "continuing", label: "Continuing" }, { value: "ended", label: "Ended" }] },
  Section: { ...base, title: "Media", children: [] },
  DashboardGrid: { title: "Fleet", subtitle: "8 worlds", state: "healthy", children: [] },
};

/* ── Emit ──────────────────────────────────────────────────── */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "components"), { recursive: true });

const tokens = readFileSync("src/app/design-tokens.css", "utf8");
const componentCss = readFileSync("src/visual/cyber-noir-visual-components-v4.css", "utf8");

/* The token file's @import must lead the stylesheet, so hoist it. */
const fontImport = "@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');";
const sharedCss = [fontImport, tokens.replace(fontImport, ""), componentCss].join("\n");

writeFileSync(join(OUT, "components", "_shared.css"), sharedCss);

function page(name: string, subtitle: string, body: string): string {
  // The @dsCard marker must be the FIRST line — that is what the Design System
  // pane indexes when building its card list.
  return `<!-- @dsCard group="Dashboard Components" name="${name}" subtitle="${subtitle}" viewport="620x360" -->
<!doctype html>
<html><head><meta charset="utf-8"><title>${name}</title>
<link rel="stylesheet" href="./_shared.css">
<style>
  html,body{margin:0;background:var(--bg-dark);font-family:var(--font-mono);}
  .frame{padding:22px;background:
    linear-gradient(rgba(11,11,14,.34), rgba(11,11,14,.60)),
    radial-gradient(60ch 40ch at 15% 10%, rgba(128,0,255,.30), transparent 60%),
    radial-gradient(60ch 40ch at 85% 70%, rgba(0,243,255,.24), transparent 60%),
    var(--bg-dark);}
</style></head>
<body><div class="frame">${body}</div></body></html>
`;
}

let ok = 0;
const failed: string[] = [];

for (const c of homelabComponents as unknown as Array<{
  name: string;
  description?: string;
  component: (a: { props: unknown; renderNode?: unknown }) => React.ReactElement;
}>) {
  const props = PROPS[c.name] ?? { ...base };
  try {
    const html = renderToStaticMarkup(
      React.createElement(() => c.component({ props, renderNode: () => null })),
    );
    const subtitle = (c.description ?? "").split(".")[0].slice(0, 110).replace(/"/g, "'");
    writeFileSync(join(OUT, "components", `${c.name}.html`), page(c.name, subtitle, html));
    ok++;
  } catch (err) {
    failed.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`  rendered ${ok}/${(homelabComponents as unknown[]).length} components -> ${OUT}/components/`);
if (failed.length) {
  console.log("  FAILED:");
  for (const f of failed) console.log(`    ${f}`);
}
