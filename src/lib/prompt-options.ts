import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";
import { buildDomainMapRules } from "@/visual/manifest-map";

export const promptOptions: PromptOptions = {
  ...openuiPromptOptions,
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Always pass live data via Query() — never hardcode or mock values. Each service has an adapter that returns the data the panel needs. Literal numbers in your output are always wrong unless the user explicitly gave them.",
    "Pick by data shape, not by service name: Gauge for a single bounded % (disk, battery, CPU); Donut for shares of a whole (media by type, spend by model); BarRank for ranked comparison (top items by size/count); LineChart for one time-series; MultiLine for 2–4 series compared; Timeline for timestamped events; EventStream for a high-volume alert feed; NodeGraph for topology; Sankey for a left-to-right pipeline; Kanban for work items grouped into columns; VisualTable for a row list; ArtworkWall for image grids; PlaybackSessions for active streams; Capacity for storage pools; SecurityPosture for severity matrices.",
    "For numeric summaries (CPU, memory, counts, pass/fail) use MetricStrip — it renders compact KPI rows.",
    buildDomainMapRules(),
    "Use Stack for vertical composition; for multi-column layouts use Stack with direction \"row\" and wrap set to true. There is no separate Grid component.",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
  ],
  examples: [
    `Example — Pipeline health (CI overview):

root = Stack([header, summary, jobs])
header = CardHeader("Pipeline Health", "GitLab CI overview")
summary = MetricStrip(pipeData)
pipeData = Query("gitlab", {}, {state: "healthy", metrics: []}, 30)
jobs = Sankey(jobData)
jobData = Query("gitlab", {view: "jobs"}, {state: "healthy", nodes: []}, 30)`,
    `Example — Storage capacity:

root = Stack([header, disk, items])
header = CardHeader("Storage Usage", "Allocation across bays")
disk = Gauge(diskData)
diskData = Query("synology", {}, {title: "Disk Usage", value: 0, max: 100, thresholds: {warning: 75, critical: 90}}, 60)
items = VisualTable(bayData)
bayData = Query("synology", {view: "bays"}, {state: "healthy", items: []}, 60)`,
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
  ],
};
