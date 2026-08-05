// Workspace configuration — maps adapters to the 8 dashboard worlds.
// This is the composition layer that ties adapters, visual components,
// and navigation together.

export type WorldId =
  | "media"
  | "ai"
  | "home"
  | "ops"
  | "infrastructure"
  | "security"
  | "knowledge"
  | "personal";

export interface WorldConfig {
  id: WorldId;
  label: string;
  icon: string;
  tagline: string;
  /** Adapter names registered in the central registry */
  adapters: string[];
  /** Quick-tag filters shown on the landing page and sidebar */
  quickTags: string[];
  /** Default renderer family for the world overview */
  defaultRenderer: string;
  accent: string;
}

export const WORLDS: WorldConfig[] = [
  {
    id: "media",
    label: "Media",
    icon: "🎬",
    tagline: "Emby, Sonarr, Radarr, SABnzbd, RomM, Tdarr",
    adapters: [
      "emby",
      "sonarr",
      "radarr",
      "sabnzbd",
      "romm",
      "tdarr",
      "disc-ripper",
      "omdb",
    ],
    quickTags: ["library", "queue", "downloads", "transcode", "health"],
    defaultRenderer: "artwork-wall",
    accent: "#27d7f2",
  },
  {
    id: "ai",
    label: "AI",
    icon: "🧠",
    tagline: "OmniRoute, LiteLLM, Ollama, ComfyUI, Hermes, Honcho",
    adapters: [
      "omniroute",
      "litellm",
      "ollama",
      "comfyui",
      "hermes-workspace",
      "hermes-gateway",
      "hermes-api-server",
      "hermes-dashboard",
      "hermes-mcp-bridge",
      "honcho",
      "openwebui",
      "openwebui-api",
      "openwebui-vector",
      "agent-vault",
      "cognee",
      "langfuse",
      "opencode",
    ],
    quickTags: ["models", "routing", "spend", "queue", "agents", "embeddings"],
    defaultRenderer: "metric-strip",
    accent: "#a879ff",
  },
  {
    id: "home",
    label: "Home",
    icon: "🏠",
    tagline: "Home Assistant, MQTT, Node-RED, Wyoming, Mail, Vikunja",
    adapters: [
      "home-assistant",
      "mqtt",
      "node-red",
      "wyoming",
      "stalwart-mail",
      "roundcube",
      "vikunja",
      "outline",
      "telegram",
    ],
    quickTags: ["devices", "lights", "sensors", "automation", "mail", "tasks"],
    defaultRenderer: "room-board",
    accent: "#29e39b",
  },
  {
    id: "ops",
    label: "Ops",
    icon: "⚙️",
    tagline: "Prometheus, Loki, Grafana, Docker, systemd, Watchtower",
    adapters: [
      "prometheus",
      "loki",
      "alertmanager",
      "grafana",
      "alloy",
      "cadvisor",
      "blackbox",
      "uptime-kuma",
      "ntfy",
      "docker",
      "systemd",
      "watchtower-vps",
      "watchtower-media",
      "watchtower-storage",
      "spoolman",
    ],
    quickTags: ["metrics", "logs", "alerts", "containers", "services", "uptime"],
    defaultRenderer: "metric-strip",
    accent: "#ffc266",
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    icon: "🖥️",
    tagline: "Hosts, Network, Storage, NAS, Caddy, Syncthing",
    adapters: [
      "node-exporter",
      "gpu",
      "tailscale",
      "pihole",
      "unifi",
      "cloudflare-dns",
      "iot-vlan",
      "onepanel",
      "valkey",
      "searxng",
      "garage-s3",
      "synology-dsm",
      "smb-nfs",
      "syncthing",
      "caddy",
    ],
    quickTags: ["hosts", "network", "storage", "dns", "mesh", "capacity"],
    defaultRenderer: "node-graph",
    accent: "#27d7f2",
  },
  {
    id: "security",
    label: "Security",
    icon: "🔒",
    tagline: "Wazuh, fail2ban, 1Password, TLS, posture",
    adapters: [
      "wazuh-manager",
      "wazuh-indexer",
      "wazuh-dashboard",
      "fail2ban",
      "1password",
    ],
    quickTags: ["alerts", "agents", "intrusion", "bans", "secrets", "posture"],
    defaultRenderer: "security-posture",
    accent: "#ff6b6b",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: "📚",
    tagline: "Wiki, Obsidian, relationships, citations, embeddings",
    adapters: ["wiki", "obsidian", "knowledge-graph"],
    quickTags: ["search", "documents", "graph", "backlinks", "citations", "FTS"],
    defaultRenderer: "knowledge-workspace",
    accent: "#a879ff",
  },
  {
    id: "personal",
    label: "Personal",
    icon: "👤",
    tagline: "Spotify, calendar, tasks, 3D printing, smart home scenes",
    adapters: ["spotify", "calendar", "spoolman-personal", "scenes"],
    quickTags: ["music", "schedule", "tasks", "filament", "scenes"],
    defaultRenderer: "story-card",
    accent: "#29e39b",
  },
];

export const WORLD_MAP: Record<WorldId, WorldConfig> = Object.fromEntries(
  WORLDS.map((w) => [w.id, w]),
) as Record<WorldId, WorldConfig>;

export function getWorld(id: string): WorldConfig | undefined {
  return WORLD_MAP[id as WorldId];
}

export function getAdaptersForWorld(id: WorldId): string[] {
  return WORLD_MAP[id]?.adapters ?? [];
}

/** Total adapter count across all worlds (with dedup) */
export const TOTAL_ADAPTERS = new Set(WORLDS.flatMap((w) => w.adapters)).size;


