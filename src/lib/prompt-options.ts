import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";
import { serviceGuideText } from "@/visual/manifest-map";
import { toolSpecs } from "@/lib/tools";
import { WORLDS } from "@/lib/workspace-config";

/**
 * The authoritative adapter inventory, derived from the registry rather than
 * written out by hand so it cannot drift as adapters come and go.
 *
 * Measured problem this solves: asked for a fleet overview, the model returned
 * a dashboard for worlds called "Arrakis", "Pandora" and "Coruscant", querying
 * adapters that do not exist — so every panel rendered empty. The names WERE
 * already in the prompt, but only scattered through prose and examples, while
 * the syntax section shows `Query("tool_name", ...)`. Faced with a placeholder
 * and no closed list, the model invented plausible-sounding names.
 *
 * ~75 names costs a few hundred tokens against a 30k budget. Cheap, next to
 * generating a dashboard that queries nothing real.
 */
const ADAPTER_NAMES = toolSpecs
  .map((t) => t.name)
  .sort()
  .join(", ");

const WORLD_NAMES = WORLDS.map((w) => w.label).join(", ");

export const promptOptions: PromptOptions = {
  ...openuiPromptOptions,
  tools: toolSpecs,
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "YOUR JOB — you are a chat assistant that answers with real, live visual components, not a dashboard generator that always produces a multi-panel overview. Read what the user actually asked. A narrow, conversational question (\"what horror movies do I have\", \"is Emby up\", \"how's the disk looking\") gets the smallest layout that answers exactly that — one or two panels, real data, done. Reserve DashboardGrid and multi-Section layouts for when the user asks for an overview, a dashboard, or explicitly names several services to compare. Defaulting every reply to a full dashboard is the wrong behavior even though it is the safer-looking one.",
    `ADAPTER NAMES — the first argument to Query() must be one of these exact names, and nothing else. An unrecognised name returns no data and renders an empty panel, so an invented name is always a broken dashboard:\n${ADAPTER_NAMES}`,
    "CONTENT DISCOVERY — for \"what/recommend/find me some X\" questions about media or games, do not answer from your own trained knowledge (that produces a plain text list with no posters and nothing that is actually in this homelab). Use the filterable views below, which return real, poster-bearing items:\n" +
      '  Query("emby", {view: "by-genre", genre: "Horror"}) — movies in that genre already in the Emby library (posters via items).\n' +
      '  Query("emby", {view: "search", search: "some title"}) — free-text title search across movies/TV already in the library.\n' +
      '  Query("radarr", {view: "wanted-by-genre", genre: "Horror"}) — movies Radarr is tracking in that genre but has not downloaded yet: the "you could grab this" half. It does not discover titles Radarr has never heard of.\n' +
      '  Query("romm", {view: "roms", genre: "Platformer"}) or Query("romm", {view: "roms", search: "mario"}) — ROMs with cover art, genre- or title-filtered.\n' +
      "A genre/discovery answer should show BOTH halves where relevant — what's available now (Emby, ArtworkWall) and what's missing but trackable (Radarr, ArtworkWall) — as two clearly labeled panels in one Stack/Section with matching surfaceStyle, not two disconnected dashboards. If a panel comes back with zero items, say so in its subtitle rather than hiding the panel — an empty genre is real information.",
    `WORLDS — this homelab is organised into exactly these worlds: ${WORLD_NAMES}. Use these names when grouping or summarising by world. Never invent a world name.`,
    "Always pass live data via Query() — never hardcode or mock values. Each service has an adapter that returns the data the panel needs. Literal numbers in your output are always wrong unless the user explicitly gave them.",
    "Pick by data shape, not by service name: Gauge for a single bounded % (disk, battery, CPU); Donut for shares of a whole (media by type, spend by model); BarRank for ranked comparison (top items by size/count); LineChart for one time-series; MultiLine for 2–4 series compared; Timeline for timestamped events; EventStream for a high-volume alert feed; NodeGraph for topology; Sankey for a left-to-right pipeline; Kanban for work items grouped into columns; VisualTable for a row list; ArtworkWall for image grids; PlaybackSessions for active streams; Capacity for storage pools; SecurityPosture for severity matrices.",
    "For numeric summaries (CPU, memory, counts, pass/fail) use MetricStrip — it renders compact KPI rows.",
    "Media visual hierarchy — when Query() returns image-bearing media items, prefer ArtworkWall over VisualTable. You may set layout explicitly (\"feature\" for one dominant recent collection, \"rail\" for resumable/sequential browsing, \"grid\" for balanced library scanning), but if you OMIT layout, ArtworkWall auto-selects a sensible one from the item count — so the short form ArtworkWall(data) already renders well. Pair active streams with PlaybackSessions and keep operational counts in MetricStrip. Charts must render returned series only; never synthesize points.",
    "Auto-refresh: for live status panels (active streams, queue depth, alerts, CPU/memory) pass a 30–60 second refreshInterval as the 4th Query() argument so the panel re-fetches. For historical or static data (library size over time, spend by month, past events) OMIT the interval — it should not poll.",
    serviceGuideText,
    "Interactivity — filters: use FilterDropdown to let the user narrow results. Set name to a $variable (e.g. \"range\"), then reference that $variable in the Query() args of the panels it controls. Selecting an option re-fetches those queries automatically — no extra wiring.",
    "Interactivity — drill-down: rows in VisualTable, cards in Kanban, items in ArtworkWall, and nodes in NodeGraph are clickable. Clicking sends a follow-up message (e.g. \"Show details for X\"); respond with a DetailPanel for that entity. Do not pre-render detail views the user hasn't requested.",
    "Interactivity — nesting: Section groups child panels under a title. Its children are a tight union of display components (MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, VisualTable, DetailPanel, Capacity, ArtworkWall) — do not nest Section, Kanban, or Stack inside a Section.",
    "Layout: use DashboardGrid for multi-panel dashboards where widths matter — set each CHILD's span (1-12) for width and rowSpan (1-3) for height. span 6 is half width, 4 a third, 12 full. Use Stack for simple vertical stacking, and Section for a titled group of panels.",
    "Visual style: every panel accepts an optional surfaceStyle object with closed enums — translucency (none|subtle|medium|strong), blur (none|sm|md|lg, the frosted-glass effect), background (solid|gradient|accent), elevation (none|sm|md|lg), glow (none|state|accent). glow \"state\" ties the glow color to the panel's health, so a critical panel glows red. Use these sparingly for emphasis; a dashboard where every panel glows reads as noise. There is no raw CSS — these enums are the only styling available.",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
    "CRITICAL — arguments are POSITIONAL, never by name, and NEVER pass a whole Query result as a single argument. Every data component's first three positional args are surfaceStyle, span, rowSpan (pass null for defaults), THEN title, subtitle, state, then its data field. So a Query result `d` must be passed field-by-field: MetricStrip(null, null, null, d.title, d.subtitle, d.state, d.metrics) — NOT MetricStrip(d), which binds the whole object to surfaceStyle and renders an empty panel. Signatures: MetricStrip/…/(null, span, null, d.title, d.subtitle, d.state, d.metrics) for metrics; VisualTable/BarRank/ArtworkWall/PlaybackSessions(null, span, null, d.title, d.subtitle, d.state, d.items) for items; LineChart/MultiLine(null, span, null, d.title, d.subtitle, d.state, d.series) for series; Timeline/EventStream(null, span, null, d.title, d.subtitle, d.state, d.events) for events. Prefer MetricStrip for adapters that return a metrics array; use Gauge only when you pass an explicit scalar value.",
  ],
  toolExamples: [
    `Example — Content discovery ("recommend some horror movies"): a narrow conversational ask gets a small, direct answer — real posters from what's actually in the library, not a text list from training knowledge, and not a full dashboard:

root = Stack([header, cols])
header = CardHeader("Horror", "In your library, and what you could grab")
cols = Stack([available, downloadable], "row", "l", "stretch", "between", true)
availableData = Query("emby", {view: "by-genre", genre: "Horror"}, {state: "healthy", items: []})
available = ArtworkWall(null, 6, null, availableData.title, availableData.subtitle, availableData.state, availableData.items, false, "grid")
downloadableData = Query("radarr", {view: "wanted-by-genre", genre: "Horror"}, {state: "healthy", items: []})
downloadable = ArtworkWall(null, 6, null, downloadableData.title, downloadableData.subtitle, downloadableData.state, downloadableData.items, false, "grid")

Both panels share span 6 (side by side) and the same layout ("grid") so they read as one matched pair, not two unrelated widgets. If the user asks for games instead of movies, use Query("romm", {view: "roms", genre: "..."}) the same way — one ArtworkWall, no Radarr half (RomM has no separate "wanted" concept).`,
    `Example — Ops health (monitoring overview):

root = Stack([header, summary, targets])
header = CardHeader("Ops Health", "Prometheus + container fleet")
opsData = Query("prometheus", {}, {state: "healthy", metrics: []}, 30)
summary = MetricStrip(null, null, null, opsData.title, opsData.subtitle, opsData.state, opsData.metrics)
fleetData = Query("docker", {view: "containers"}, {state: "healthy", items: []}, 30)
targets = VisualTable(null, null, null, fleetData.title, fleetData.subtitle, fleetData.state, fleetData.items)`,
    `Example — Storage capacity (MetricStrip, not Gauge, because the adapter returns a metrics array):

root = Stack([header, usage, items])
header = CardHeader("Storage Usage", "Allocation across bays")
diskData = Query("synology-dsm", {}, {state: "healthy", metrics: []}, 60)
usage = MetricStrip(null, null, null, diskData.title, diskData.subtitle, diskData.state, diskData.metrics)
bayData = Query("synology-dsm", {view: "bays"}, {state: "healthy", items: []}, 60)
items = VisualTable(null, null, null, bayData.title, bayData.subtitle, bayData.state, bayData.items)`,
    `Example — Dashboard with a reactive time-range filter:

root = Stack([header, rangeFilter, panels])
header = CardHeader("Media Activity", "Filtered by time range")
$range = "7d"
rangeFilter = FilterDropdown("range", "Time range", $range, [{value: "24h", label: "Last 24 hours"}, {value: "7d", label: "Last 7 days"}, {value: "30d", label: "Last 30 days"}])
panels = Stack([sessions, recent], "row", "l", "stretch", "between", true)
sessData = Query("emby", {view: "sessions", range: $range}, {state: "healthy", items: []}, 30)
sessions = PlaybackSessions(null, null, null, sessData.title, sessData.subtitle, sessData.state, sessData.items)
recentData = Query("emby", {view: "recent-movies", range: $range}, {state: "healthy", items: []})
recent = ArtworkWall(null, null, null, recentData.title, recentData.subtitle, recentData.state, recentData.items)`,
    `Example — Cinematic media dashboard:

root = DashboardGrid("Media", "Live library and playback", null, null, null, null, [nowPlaying, recent, continueWatching])
sessionData = Query("emby", {view: "sessions"}, {state: "healthy", items: []}, 30)
nowPlaying = PlaybackSessions(null, 12, null, sessionData.title, sessionData.subtitle, sessionData.state, sessionData.items)
recentData = Query("emby", {view: "recent-movies"}, {state: "healthy", items: []})
recent = ArtworkWall(null, 12, null, recentData.title, recentData.subtitle, recentData.state, recentData.items, false, "feature")
resumeData = Query("emby", {view: "continue-watching"}, {state: "healthy", items: []})
continueWatching = ArtworkWall(null, 12, null, resumeData.title, resumeData.subtitle, resumeData.state, resumeData.items, false, "rail")`,
    `Example — Nested layout with Sections:

root = Stack([header, cols])
header = CardHeader("Fleet Overview", "Grouped by concern")
cols = Stack([leftCol, rightCol], "row", "l", "stretch", "between", true)
leftCol = Section("Storage", null, null, [diskStrip, poolTable])
diskData = Query("synology-dsm", {}, {state: "healthy", metrics: []}, 60)
diskStrip = MetricStrip(null, null, null, diskData.title, diskData.subtitle, diskData.state, diskData.metrics)
poolData = Query("synology-dsm", {view: "pools"}, {state: "healthy", items: []}, 60)
poolTable = VisualTable(null, null, null, poolData.title, poolData.subtitle, poolData.state, poolData.items)
rightCol = Section("Media", null, null, [mediaStrip])
mediaData = Query("emby", {}, {state: "healthy", metrics: []}, 60)
mediaStrip = MetricStrip(null, null, null, mediaData.title, mediaData.subtitle, mediaData.state, mediaData.metrics)`,
    `Example — Glass dashboard on a 12-column grid:

root = DashboardGrid("Fleet", "Live status", null, null, null, null, [cpu, storage, events])
cpuData = Query("prometheus", {}, {state: "healthy", metrics: []}, 30)
cpu = MetricStrip(null, 3, null, cpuData.title, cpuData.subtitle, cpuData.state, cpuData.metrics)
storageData = Query("synology-dsm", {}, {state: "healthy", metrics: []}, 60)
storage = MetricStrip(null, 3, null, storageData.title, storageData.subtitle, storageData.state, storageData.metrics)
alertData = Query("wazuh-manager", {}, {state: "healthy", events: []}, 30)
events = EventStream(null, 6, null, alertData.title, alertData.subtitle, alertData.state, alertData.events)

Each child sets span as its second arg: cpu and storage at span 3 sit side by side, events at span 6 fills the rest.
Add surfaceStyle {blur: "md", translucency: "medium", glow: "state"} to a panel that should stand out.`,
    `Example — AI model activity:

root = Stack([header, cards])
header = CardHeader("AI Model Activity", "Inference services")
cards = Stack([llmCard, ollamaCard], "row", "l", "stretch", "between", true)
llmCard = Card([llmTitle, llmStrip])
llmTitle = TextContent("LiteLLM", "small-heavy")
llmData = Query("litellm", {}, {state: "healthy", metrics: []}, 30)
llmStrip = MetricStrip(null, null, null, llmData.title, llmData.subtitle, llmData.state, llmData.metrics)
ollamaCard = Card([ollamaTitle, ollamaStrip])
ollamaTitle = TextContent("Ollama", "small-heavy")
ollamaData = Query("ollama", {}, {state: "healthy", metrics: []}, 30)
ollamaStrip = MetricStrip(null, null, null, ollamaData.title, ollamaData.subtitle, ollamaData.state, ollamaData.metrics)`,
  ],
};
