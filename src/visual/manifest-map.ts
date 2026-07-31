/**
 * Service → component mapping.
 *
 * Preserves the knowledge from the 905-component manifest as a condensed
 * lookup: given a service domain, which of the ~25 new components fits best.
 * This is used in prompt additionalRules to guide component selection.
 */

export const serviceComponentMap: Record<string, string> = {
  "3d-printing": "RoomBoard",
  "ai": "LineChart",
  "ai-image": "Timeline",
  "ai-routing": "Sankey",
  "automation": "Donut",
  "ci": "Flow",
  "communication": "SecurityPosture",
  "container-management": "VisualTable",
  "dashboard": "Gauge",
  "database": "MetricStrip",
  "development": "NodeGraph",
  "development-productivity": "Timeline",
  "download": "LogStream",
  "hardware": "Donut",
  "hermes": "MetricStrip",
  "home-automation": "RoomBoard",
  "host-management": "Gauge",
  "infrastructure": "Capacity",
  "iot": "Donut",
  "knowledge": "MarkdownReader",
  "layout": "MetricStrip",
  "mail": "Timeline",
  "mcp": "LineChart",
  "media": "PlaybackSessions",
  "media-automation": "Kanban",
  "media-library": "ArtworkWall",
  "messaging": "Donut",
  "monitoring": "MetricStrip",
  "network": "NodeGraph",
  "notification": "Timeline",
  "operations": "SecurityPosture",
  "private-app": "MetricStrip",
  "productivity": "Gauge",
  "search": "VisualTable",
  "security": "SecurityPosture",
  "security-observability": "SecurityPosture",
  "storage": "Capacity",
  "storage-protocol": "LogStream",
  "sync": "MetricStrip",
  "visual-primitives": "VisualTable",
  "voice": "MetricStrip",
};

/**
 * Condensed guidance text for the prompt — maps common homelab service
 * domains to recommended components. Kept short to respect the 30k token budget.
 */
export const serviceGuideText = `Service domain → recommended component:
  media (Emby/Sonarr/Radarr) → PlaybackSessions, ArtworkWall, or Timeline
  ci (GitLab CI) → Flow or MetricStrip
  ai (LiteLLM/Ollama/ComfyUI) → LineChart, MetricStrip, or Sankey
  storage (Synology/SABnzbd) → Capacity or LogStream
  network (Caddy/UniFi/Pi-hole) → NodeGraph or MetricStrip
  security (Wazuh) → SecurityPosture
  home-automation (HA) → RoomBoard or Timeline
  infrastructure → Capacity or Gauge
  monitoring → MetricStrip or LineChart
  database → MetricStrip or BarRank
  knowledge → MarkdownReader or KnowledgeGraph
When a service has a single bounded % (disk, CPU, memory), use Gauge.
When a service has multiple KPIs, use MetricStrip.
When showing a pipeline/sequence, use Flow.
When correlating two numeric variables (latency vs load), use Scatter.
When bucketing a value across two categorical axes (errors by service×hour), use Heatmap.`;
