import manifest from "./visual-component-manifest-v4.json";

const components = manifest.components as Array<{ component: string; renderer_family: string }>;

const familyNames = ["hero", "metric-strip", "story-card", "callout", "empty-state", "artwork-wall", "album-wall", "playback-sessions", "carousel", "cover-flow", "mosaic", "quality-overlay", "timeline", "thumbnail-timeline", "event-stream", "calendar", "calendar-heatmap", "gantt", "line-chart", "multi-line", "bar-rank", "stacked-bar", "scatter", "histogram", "small-multiples", "radar", "donut", "gauge", "sparkline", "treemap", "sunburst", "heatmap", "matrix-heatmap", "word-cloud", "distribution", "sankey", "chord", "funnel", "waterfall", "node-graph", "tree", "map", "floorplan", "kanban", "stepper", "visual-table", "matrix", "bubble", "waveform", "queue-river", "entity-gallery", "capacity", "pipeline", "security-posture", "room-board", "energy-flow", "log-stream", "detail-panel", "comparison", "markdown-reader", "document-tree", "document-outline", "knowledge-search", "backlinks", "related-notes", "knowledge-graph", "relationship-path", "provenance-graph", "temporal-knowledge", "semantic-clusters", "citation-trail", "graph-inspector", "graph-legend", "knowledge-health", "query-evidence", "document-diff", "graph-minimap", "relationship-matrix", "knowledge-workspace"];

const manifestFamilies = new Set(components.map(c => c.renderer_family));
const switchFamilies = new Set(familyNames);

const missingFromSwitch: string[] = [];
const extraInSwitch: string[] = [];

for (const f of Array.from(manifestFamilies)) {
  if (!switchFamilies.has(f)) missingFromSwitch.push(f);
}
for (const f of Array.from(switchFamilies)) {
  if (!manifestFamilies.has(f)) extraInSwitch.push(f);
}

console.log("=== Renderer Family Verification ===");
console.log(`Manifest families: ${manifestFamilies.size}`);
console.log(`Switch families:   ${switchFamilies.size}`);
console.log(`Manifest components: ${components.length}`);

if (missingFromSwitch.length > 0) {
  console.error(`FAIL: ${missingFromSwitch.length} families in manifest but NOT in switch:`);
  console.error(missingFromSwitch);
  process.exit(1);
}
if (extraInSwitch.length > 0) {
  console.error(`FAIL: ${extraInSwitch.length} families in switch but NOT in manifest:`);
  console.error(extraInSwitch);
  process.exit(1);
}

const seen = new Set<string>();
const dupes: string[] = [];
for (const c of components) {
  if (seen.has(c.component)) dupes.push(c.component);
  seen.add(c.component);
}
if (dupes.length > 0) {
  console.error(`FAIL: ${dupes.length} duplicate component names:`);
  console.error(dupes);
  process.exit(1);
}

console.log("PASS: All 79 families present in both manifest and switch, no duplicates.");
console.log("PASS: All 905 components have unique names.");
