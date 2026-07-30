import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";
import { serviceGuideText } from "@/visual/manifest-map";

export const promptOptions: PromptOptions = {
  ...openuiPromptOptions,
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Always pass live data via Query() — never hardcode or mock values. Each service has an adapter that returns the data it needs.",
    "Pick the component that matches the data shape: MetricStrip for KPI rows, Gauge for a single bounded %, LineChart for one time-series, MultiLine for multiple, BarRank for ranked comparison, Donut for proportions, Timeline for events, Flow for pipelines, NodeGraph for topology, SecurityPosture for status grids, Capacity for storage fill.",
    serviceGuideText,
    "Use Stack for vertical composition; for multi-column layouts use Stack with direction \"row\" and wrap set to true. There is no separate Grid component.",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
  ],
  toolExamples: [
    `Example — CI pipeline health:

root = Stack([header, pipeline, jobs])
header = CardHeader("Pipeline Health", "GitLab CI overview")
pipeline = Flow(flowData)
flowData = Query("gitlab", {}, {title: "Pipeline", state: "healthy", nodes: [{id: "build", label: "Build", value: "5m"}, {id: "test", label: "Test", value: "3m"}, {id: "deploy", label: "Deploy", value: "1m"}]}, 30)
jobs = VisualTable(jobData)
jobData = Query("gitlab", {view: "jobs"}, {title: "Recent Jobs", state: "healthy", items: [{id: "j1", label: "build-api", subtitle: "passed", state: "healthy", value: "5m"}, {id: "j2", label: "lint", subtitle: "passed", state: "healthy", value: "1m"}]}, 30)`,
    `Example — Storage capacity:

root = Stack([header, disk])
header = CardHeader("Storage", "Disk allocation across bays")
disk = Capacity(diskData)
diskData = Query("synology", {}, {title: "Storage", state: "healthy", metrics: [{label: "Used", value: 72, unit: "%"}, {label: "Total", value: "48TB"}, {label: "Free", value: "13TB"}]}, 60)`,
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
