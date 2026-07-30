import manifest from "./visual-component-manifest-v4.json";

const manifestComponents = manifest.components as Array<{
  component: string;
  domain: string;
  renderer_family: string;
  purpose: string;
}>;

/**
 * Maps the old 79 renderer families (from the 905-name manifest) to the new
 * ~24 narrow components. This preserves the domain knowledge embedded in the
 * manifest without re-registering 905 component names in the prompt.
 */
const FAMILY_TO_COMPONENT: Record<string, string> = {
  "metric-strip": "MetricStrip",
  hero: "MetricStrip",
  sparkline: "LineChart",
  "line-chart": "LineChart",
  "multi-line": "MultiLine",
  scatter: "LineChart",
  radar: "LineChart",
  "small-multiples": "MultiLine",
  donut: "Donut",
  gauge: "Gauge",
  capacity: "Capacity",
  treemap: "Donut",
  sunburst: "Donut",
  "bar-rank": "BarRank",
  "stacked-bar": "BarRank",
  histogram: "BarRank",
  distribution: "BarRank",
  heatmap: "Heatmap",
  "matrix-heatmap": "Heatmap",
  "word-cloud": "Heatmap",
  timeline: "Timeline",
  "thumbnail-timeline": "Timeline",
  "event-stream": "EventStream",
  "log-stream": "LogStream",
  "node-graph": "NodeGraph",
  tree: "NodeGraph",
  map: "NodeGraph",
  floorplan: "NodeGraph",
  chord: "NodeGraph",
  sankey: "Sankey",
  funnel: "Sankey",
  waterfall: "Sankey",
  pipeline: "Sankey",
  stepper: "Sankey",
  "energy-flow": "Sankey",
  kanban: "Kanban",
  "room-board": "Kanban",
  "visual-table": "VisualTable",
  "detail-panel": "DetailPanel",
  comparison: "VisualTable",
  "queue-river": "VisualTable",
  "artwork-wall": "ArtworkWall",
  "album-wall": "ArtworkWall",
  carousel: "ArtworkWall",
  "cover-flow": "ArtworkWall",
  mosaic: "ArtworkWall",
  "quality-overlay": "ArtworkWall",
  "entity-gallery": "ArtworkWall",
  "playback-sessions": "PlaybackSessions",
  "security-posture": "SecurityPosture",
  callout: "Callout",
  "empty-state": "EmptyState",
  "markdown-reader": "MarkdownReader",
  "knowledge-graph": "KnowledgeGraph",
  "semantic-clusters": "KnowledgeGraph",
  "provenance-graph": "KnowledgeGraph",
  "temporal-knowledge": "KnowledgeGraph",
  "graph-minimap": "KnowledgeGraph",
  "relationship-path": "KnowledgeGraph",
  backlinks: "Backlinks",
  "related-notes": "Backlinks",
  "citation-trail": "Backlinks",
  "knowledge-search": "VisualTable",
  "document-tree": "VisualTable",
  "document-outline": "VisualTable",
  "graph-inspector": "VisualTable",
  "graph-legend": "VisualTable",
  "knowledge-health": "SecurityPosture",
  "relationship-matrix": "Heatmap",
  "query-evidence": "KnowledgeGraph",
  "knowledge-workspace": "MarkdownReader",
  "document-diff": "VisualTable",
  story: "Callout",
  calendar: "Kanban",
  gantt: "Sankey",
  bubble: "BarRank",
  waveform: "LineChart",
};

/** Map a manifest component name → its recommended new component. */
export function componentForName(name: string): string | undefined {
  const entry = manifestComponents.find((c) => c.component === name);
  if (!entry) return undefined;
  return FAMILY_TO_COMPONENT[entry.renderer_family];
}

/** Map a domain/service keyword → recommended components. */
export function componentsForDomain(domain: string): string[] {
  const d = domain.toLowerCase();
  const families = new Set<string>();
  for (const c of manifestComponents) {
    if (c.domain.toLowerCase().includes(d)) {
      const comp = FAMILY_TO_COMPONENT[c.renderer_family];
      if (comp) families.add(comp);
    }
  }
  return [...families];
}

/**
 * A condensed prompt string grouping the 905 manifest domains by the component
 * they map to. Injected into additionalRules so the model knows which component
 * to reach for per service, without seeing 905 component names.
 */
export function buildDomainMapRules(): string {
  const byComp = new Map<string, string[]>();
  for (const c of manifestComponents) {
    const comp = FAMILY_TO_COMPONENT[c.renderer_family];
    if (!comp) continue;
    const dom = c.domain;
    const arr = byComp.get(comp) ?? [];
    if (!arr.includes(dom)) arr.push(dom);
    byComp.set(comp, arr);
  }
  const lines: string[] = ["Service→component map (905 services collapsed to 24 components):"];
  for (const [comp, domains] of byComp) {
    const sample = domains.slice(0, 4).join(", ");
    const extra = domains.length > 4 ? `, +${domains.length - 4} more` : "";
    lines.push(`  ${comp}: ${sample}${extra}`);
  }
  return lines.join("\n");
}
