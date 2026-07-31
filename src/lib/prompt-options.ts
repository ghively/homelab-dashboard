import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";
import { serviceGuideText } from "@/visual/manifest-map";
import { toolSpecs } from "@/lib/tools";

export const promptOptions: PromptOptions = {
  ...openuiPromptOptions,
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Always pass live data via Query() — never hardcode or mock values. Each service has an adapter that returns the data it needs.",
    "Pick the component that matches the data shape: MetricStrip for KPI rows, Gauge for a single bounded %, LineChart for one time-series, MultiLine for multiple, BarRank for ranked comparison, Donut for proportions, Timeline for events, Flow for pipelines, NodeGraph for topology, SecurityPosture for status grids, Capacity for storage fill.",
    serviceGuideText,
    "Use Stack for vertical composition; for multi-column layouts use DashboardGrid with GridItem to set column spans (e.g. span=6 for half width, span=4 for a third).",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
    "Auto-refresh: for live status panels (health, queue depth, active sessions) pass a 30–60 second interval as Query()'s fourth arg, e.g. health = Query(\"emby\", {}, {...}, 30). For historical data or one-time lookups, omit the interval.",
    "Use FilterDropdown to let the user narrow data — give it a unique name, a default value, and an options list. Bind it to a Query by referencing $<filterName> in the Query args so changing the dropdown re-fetches automatically.",
  ],
  tools: toolSpecs,
  toolExamples: [
    `Example — Docker fleet health:

root = Stack([header, pipeline, jobs])
header = CardHeader("Fleet Health", "Container overview")
pipeline = Flow(flowData)
flowData = Query("docker", {}, {title: "Containers", state: "healthy", nodes: [{id: "running", label: "Running", value: 119}, {id: "stopped", label: "Stopped", value: 6}, {id: "unhealthy", label: "Unhealthy", value: 2}]}, 30)
jobs = VisualTable(jobData)
jobData = Query("docker", {}, {title: "Containers", state: "healthy", items: [{id: "c1", label: "searxng", subtitle: "gh-vps", state: "healthy", value: "running"}, {id: "c2", label: "valkey", subtitle: "gh-vps", state: "healthy", value: "running"}]}, 30)`,
    `Example — Storage capacity:

root = Stack([header, disk])
header = CardHeader("Storage", "Disk allocation across bays")
disk = Capacity(diskData)
diskData = Query("synology-dsm", {}, {title: "Storage", state: "healthy", metrics: [{label: "Used", value: 72, unit: "%"}, {label: "Total", value: "48TB"}, {label: "Free", value: "13TB"}]}, 60)`,
    `Example — AI model activity:

root = Stack([header, cards])
header = CardHeader("AI Model Activity", "Inference services")
cards = Stack([llmCard, ollamaCard], "row", "l", "stretch", "between", true)
llmCard = Card([llmTitle, MetricStrip(llmData)])
llmTitle = TextContent("LiteLLM", "small-heavy")
llmData = Query("litellm", {}, {title: "LiteLLM", state: "healthy", metrics: [{label: "Requests/min", value: 142}, {label: "Active keys", value: 8}, {label: "Avg latency", value: "340ms"}]}, 30)
ollamaCard = Card([ollamaTitle, MetricStrip(ollamaData)])
ollamaTitle = TextContent("Ollama", "small-heavy")
ollamaData = Query("ollama", {}, {title: "Ollama", state: "healthy", metrics: [{label: "Models", value: 12}, {label: "VRAM", value: "18GB"}, {label: "Load", value: "67%"}]}, 30)`,
  ],
};
