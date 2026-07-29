import { openuiPromptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
import type { PromptOptions } from "@openuidev/react-lang";

export const promptOptions: PromptOptions = {
  ...openuiPromptOptions,
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Always pass live data via Query() — never hardcode or mock values. Each domain component has an adapter that returns the data it needs.",
    "For numeric summaries (CPU, memory, counts, pass/fail), prefer domain components whose renderer_family is \"metric-strip\" — they render compact KPI rows.",
    "Pick the component whose renderer_family matches the user's intent: donut for distributions, timeline for events, gauge for single metrics, pipeline for CI state, sankey for flows.",
    "Use Stack for vertical composition; for multi-column layouts use Stack with direction \"row\" and wrap set to true. There is no separate Grid component.",
    "When the user asks about a specific service or entity, use the domain component for that service (e.g. PipelineOverview for GitLab CI, DiskSpace for storage, LiteLLMHealth for AI routing).",
    "Every variable except root must be referenced by its parent's children/items array — unreferenced variables are silently dropped.",
  ],
  examples: [
    `Example — Pipeline health:

root = Stack([header, overview, jobs])
header = CardHeader("Pipeline Health", "GitLab CI overview")
overview = PipelineOverview(pipeData)
pipeData = Query("gitlab", {}, {state: "healthy", metrics: [], items: []}, 30)
jobs = PipelineJobTable(jobData)
jobData = Query("gitlab", {view: "jobs"}, {state: "healthy", items: []}, 30)`,
    `Example — Disk usage:

root = Stack([header, disk])
header = CardHeader("Disk Usage", "Storage allocation across bays")
disk = DiskSpace(diskData)
diskData = Query("sabnzbd", {}, {state: "healthy", items: [], metrics: []}, 60)`,
    `Example — AI model activity:

root = Stack([header, cards])
header = CardHeader("AI Model Activity", "Inference services")
cards = Stack([llmCard, ollamaCard, comfyCard], "row", "l", "stretch", "between", true)
llmCard = Card([llmTitle, LiteLLMHealth(llmData)])
llmTitle = TextContent("LiteLLM", "small-heavy")
llmData = Query("litellm", {}, {state: "healthy", metrics: [], items: []}, 30)
ollamaCard = Card([ollamaTitle, OllamaStatus(ollamaData)])
ollamaTitle = TextContent("Ollama", "small-heavy")
ollamaData = Query("ollama", {}, {state: "healthy", metrics: [], items: []}, 30)
comfyCard = Card([comfyTitle, ComfyQueue(comfyData)])
comfyTitle = TextContent("ComfyUI", "small-heavy")
comfyData = Query("comfyui", {}, {state: "healthy", items: []}, 30)`,
  ],
};
