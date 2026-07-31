import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";
import { buildDomainMapRules } from "@/visual/manifest-map";
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
    buildDomainMapRules(),
    "Use Stack for vertical composition; for multi-column layouts use DashboardGrid with span props on each child panel (span: 6 = half width, span: 4 = third, span: 3 = quarter). DashboardGrid uses a 12-column CSS Grid — set each child's span (1-12) to control its width and rowSpan (1-3) for height.",
    "Visual styling — every panel accepts an optional surfaceStyle object with closed-enum visual controls: {translucency: subtle|medium|strong, blur: sm|md|lg, background: gradient|accent, elevation: sm|md|lg, glow: state|accent}. For glass panels use translucency + blur together (e.g. surfaceStyle: {translucency: medium, blur: md}). glow: state colors the glow by the panel's state — use it for critical/warning panels. Never pass raw className or style.",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
    "Interactivity — filters: use FilterDropdown to let the user narrow results. Set name to a $variable (e.g. \"range\"), then pass {$range} in the Query() args of the panels it controls. Selecting an option re-fetches those queries automatically — no extra wiring.",
    "Interactivity — drill-down: rows in VisualTable, Kanban, items in ArtworkWall, and nodes in NodeGraph are clickable. Clicking sends a follow-up message (e.g. \"Show details for X\"); respond with a DetailPanel for that entity. Do not pre-render detail views the user hasn't requested.",
    "Interactivity — nesting: Section groups child panels under a title. Its children are a tight union of display components (MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall) — do not nest Section, Kanban, or Stack inside a Section. DetailPanel and Kanban accept a children of MetricStrip or DetailPanel respectively for inline KPI summaries.",
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
    `Example — AI model activity:

root = Stack([header, cards])
header = CardHeader("AI Model Activity", "Inference services")
cards = Stack([llmCard, ollamaCard, comfyCard], "row", "l", "stretch", "between", true)
llmCard = Card([llmTitle, MetricStrip(llmData)])
llmTitle = TextContent("LiteLLM", "small-heavy")
llmData = Query("litellm", {}, {state: "healthy", metrics: []}, 30)
ollamaCard = Card([ollamaTitle, MetricStrip(ollamaData)])
ollamaTitle = TextContent("Ollama", "small-heavy")
ollamaData = Query("ollama", {}, {state: "healthy", metrics: []}, 30)
comfyCard = Card([comfyTitle, EventStream(comfyData)])
comfyTitle = TextContent("ComfyUI", "small-heavy")
comfyData = Query("comfyui", {}, {state: "healthy", events: []}, 30)`,
    `Example — Dashboard with a reactive time-range filter:

root = Stack([header, rangeFilter, panels])
header = CardHeader("Media Activity", "Filtered by time range")
rangeFilter = FilterDropdown("range", "Time range", "7d", [{value: "24h", label: "Last 24 hours"}, {value: "7d", label: "Last 7 days"}, {value: "30d", label: "Last 30 days"}])
panels = Stack([sessions, recent], "row", "l", "stretch", "between", true)
sessions = PlaybackSessions(sessData)
sessData = Query("emby", {$range: "range"}, {state: "healthy", items: []}, 30)
recent = ArtworkWall(recentData)
recentData = Query("emby", {view: "recent-movies", $range: "range"}, {state: "healthy", items: []})`,
    `Example — Nested layout with a Section:

root = Stack([header, leftCol, rightCol], "row", "l", "stretch", "between", true)
header = CardHeader("Fleet Overview", "Grouped by host")
leftCol = Section("Storage", null, null, [diskGauge, poolTable])
diskGauge = Gauge(diskData)
diskData = Query("synology-dsm", {}, {title: "Disk Usage", value: 0, max: 100, thresholds: {warning: 75, critical: 90}}, 60)
poolTable = VisualTable(poolData)
poolData = Query("synology-dsm", {view: "pools"}, {state: "healthy", items: []}, 60)
rightCol = Section("Media", null, null, [mediaStrip])
mediaStrip = MetricStrip(mediaData)
mediaData = Query("emby", {}, {state: "healthy", metrics: []}, 60)`,
    `Example — Glass-panel dashboard with grid layout (disk spanning half width):

root = DashboardGrid([header, diskPanel, poolPanel, alertPanel])
header = CardHeader("Storage Health", "Glass dashboard overview")
diskPanel = Gauge(diskData, {translucency: medium, blur: md, glow: state}, 6)
diskData = Query("synology-dsm", {}, {title: "Disk Usage", value: 0, max: 100, thresholds: {warning: 75, critical: 90}, state: "healthy"}, 60)
poolPanel = VisualTable(poolData, {translucency: subtle, blur: sm}, 6)
poolData = Query("synology-dsm", {view: "pools"}, {state: "healthy", items: []}, 60)
alertPanel = EventStream(alertData, {translucency: medium, blur: md, elevation: lg}, 12)
alertData = Query("wazuh-manager", {}, {state: "healthy", events: []}, 30)`,
  ],
};
