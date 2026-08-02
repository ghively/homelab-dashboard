import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";
import { serviceGuideText } from "@/visual/manifest-map";
import { toolSpecs } from "@/lib/tools";

export const promptOptions: PromptOptions = {
  ...openuiPromptOptions,
  tools: toolSpecs,
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Always pass live data via Query() — never hardcode or mock values. Each service has an adapter that returns the data the panel needs. Literal numbers in your output are always wrong unless the user explicitly gave them.",
    "Pick by data shape, not by service name: Gauge for a single bounded % (disk, battery, CPU); Donut for shares of a whole (media by type, spend by model); BarRank for ranked comparison (top items by size/count); LineChart for one time-series; MultiLine for 2–4 series compared; Timeline for timestamped events; EventStream for a high-volume alert feed; NodeGraph for topology; Sankey for a left-to-right pipeline; Kanban for work items grouped into columns; VisualTable for a row list; ArtworkWall for image grids; PlaybackSessions for active streams; Capacity for storage pools; SecurityPosture for severity matrices.",
    "For numeric summaries (CPU, memory, counts, pass/fail) use MetricStrip — it renders compact KPI rows.",
    "Auto-refresh: for live status panels (active streams, queue depth, alerts, CPU/memory) pass a 30–60 second refreshInterval as the 4th Query() argument so the panel re-fetches. For historical or static data (library size over time, spend by month, past events) OMIT the interval — it should not poll.",
    serviceGuideText,
    "Interactivity — filters: use FilterDropdown to let the user narrow results. Set name to a $variable (e.g. \"range\"), then reference that $variable in the Query() args of the panels it controls. Selecting an option re-fetches those queries automatically — no extra wiring.",
    "Interactivity — drill-down: rows in VisualTable, cards in Kanban, items in ArtworkWall, and nodes in NodeGraph are clickable. Clicking sends a follow-up message (e.g. \"Show details for X\"); respond with a DetailPanel for that entity. Do not pre-render detail views the user hasn't requested.",
    "Interactivity — nesting: Section groups child panels under a title. Its children are a tight union of display components (MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall) — do not nest Section, Kanban, or Stack inside a Section.",
    "Layout: use DashboardGrid for multi-panel dashboards where widths matter — set each CHILD's span (1-12) for width and rowSpan (1-3) for height. span 6 is half width, 4 a third, 12 full. Use Stack for simple vertical stacking, and Section for a titled group of panels.",
    "Visual style: every panel accepts an optional surfaceStyle object with closed enums — translucency (none|subtle|medium|strong), blur (none|sm|md|lg, the frosted-glass effect), background (solid|gradient|accent), elevation (none|sm|md|lg), glow (none|state|accent). glow \"state\" ties the glow color to the panel's health, so a critical panel glows red. Use these sparingly for emphasis; a dashboard where every panel glows reads as noise. There is no raw CSS — these enums are the only styling available.",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
  ],
  toolExamples: [
    `Example — Ops health (monitoring overview):

root = Stack([header, summary, targets])
header = CardHeader("Ops Health", "Prometheus + container fleet")
summary = MetricStrip(opsData)
opsData = Query("prometheus", {}, {state: "healthy", metrics: []}, 30)
targets = VisualTable(fleetData)
fleetData = Query("docker", {view: "containers"}, {state: "healthy", items: []}, 30)`,
    `Example — Storage capacity:

root = Stack([header, disk, items])
header = CardHeader("Storage Usage", "Allocation across bays")
disk = Gauge(diskData)
diskData = Query("synology-dsm", {}, {title: "Disk Usage", value: 0, max: 100, thresholds: {warning: 75, critical: 90}}, 60)
items = VisualTable(bayData)
bayData = Query("synology-dsm", {view: "bays"}, {state: "healthy", items: []}, 60)`,
    `Example — Dashboard with a reactive time-range filter:

root = Stack([header, rangeFilter, panels])
header = CardHeader("Media Activity", "Filtered by time range")
$range = "7d"
rangeFilter = FilterDropdown("range", "Time range", $range, [{value: "24h", label: "Last 24 hours"}, {value: "7d", label: "Last 7 days"}, {value: "30d", label: "Last 30 days"}])
panels = Stack([sessions, recent], "row", "l", "stretch", "between", true)
sessions = PlaybackSessions(sessData)
sessData = Query("emby", {view: "sessions", range: $range}, {state: "healthy", items: []}, 30)
recent = ArtworkWall(recentData)
recentData = Query("emby", {view: "recent-movies", range: $range}, {state: "healthy", items: []})`,
    `Example — Nested layout with Sections:

root = Stack([header, cols])
header = CardHeader("Fleet Overview", "Grouped by concern")
cols = Stack([leftCol, rightCol], "row", "l", "stretch", "between", true)
leftCol = Section("Storage", null, null, [diskGauge, poolTable])
diskGauge = Gauge(diskData)
diskData = Query("synology-dsm", {}, {title: "Disk Usage", value: 0, max: 100, thresholds: {warning: 75, critical: 90}}, 60)
poolTable = VisualTable(poolData)
poolData = Query("synology-dsm", {view: "pools"}, {state: "healthy", items: []}, 60)
rightCol = Section("Media", null, null, [mediaStrip])
mediaStrip = MetricStrip(mediaData)
mediaData = Query("emby", {}, {state: "healthy", metrics: []}, 60)`,
    `Example — Glass dashboard on a 12-column grid:

root = DashboardGrid("Fleet", "Live status", null, null, null, null, [cpu, disk, events])
cpu = Gauge(cpuData)
cpuData = Query("prometheus", {}, {title: "CPU", value: 0, max: 100, thresholds: {warning: 70, critical: 90}}, 30)
disk = Gauge(diskData)
diskData = Query("synology-dsm", {}, {title: "Disk", value: 0, max: 100, thresholds: {warning: 75, critical: 90}}, 60)
events = EventStream(alertData)
alertData = Query("wazuh-manager", {}, {state: "healthy", events: []}, 30)

Set span on each child: cpu and disk at span 3 sit side by side, events at span 6 fills the rest.
Add surfaceStyle {blur: "md", translucency: "medium", glow: "state"} to a panel that should stand out.`,
    `Example — AI model activity:

root = Stack([header, cards])
header = CardHeader("AI Model Activity", "Inference services")
cards = Stack([llmCard, ollamaCard], "row", "l", "stretch", "between", true)
llmCard = Card([llmTitle, MetricStrip(llmData)])
llmTitle = TextContent("LiteLLM", "small-heavy")
llmData = Query("litellm", {}, {state: "healthy", metrics: []}, 30)
ollamaCard = Card([ollamaTitle, MetricStrip(ollamaData)])
ollamaTitle = TextContent("Ollama", "small-heavy")
ollamaData = Query("ollama", {}, {state: "healthy", metrics: []}, 30)`,
  ],
};
