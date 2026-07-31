/**
 * Tool specs + tool provider for OpenUI's Query()/Mutation() system.
 *
 * Built dynamically from ADAPTER_INVENTORY so the tool list stays in sync
 * with the adapter registry. Each tool fetches live data via the
 * /api/adapters endpoint, which routes through queryAdapter() — live
 * adapters return real data; unconfigured adapters fall back to labelled
 * fixtures; failed live adapters render offline (never fake).
 *
 * The toolProvider is a plain function map (Record<string, (args) => Promise>),
 * which is one of the two ToolProvider shapes OpenUI's Renderer accepts.
 * No MCP server required.
 */

import type { ToolSpec } from "@openuidev/react-lang";
import { ADAPTER_INVENTORY } from "@/lib/adapter-aggregator";

// ── Tool specs (for the system prompt) ───────────────────────

// Keep descriptions short — tool specs are injected into the prompt and
// the 30k token gate still applies. One line each.
const TOOL_DESCRIPTIONS: Record<string, string> = {
  emby: "Emby media server: library counts, active streams, recent items.",
  sonarr: "Sonarr TV management: monitored series, queue, missing episodes.",
  radarr: "Radarr movie management: library size, wanted, processing.",
  sabnzbd: "SABnzbd downloader: queue depth, speed, history.",
  romm: "RomM game library: collection size, platforms.",
  tdarr: "Tdarr transcode pipeline: queue, health checks.",
  litellm: "LiteLLM proxy: requests/min, active keys, model list.",
  ollama: "Ollama local LLM: models loaded, VRAM usage, pull queue.",
  comfyui: "ComfyUI image generation: queue, GPU util, recent outputs.",
  omniroute: "OmniRoute AI router: provider health, model routing.",
  "synology-dsm": "Synology NAS: storage capacity, drive health, SMART.",
  tailscale: "Tailscale mesh: nodes, subnet routes, exit nodes.",
  "wazuh-manager": "Wazuh SIEM: agents, alerts, threat level.",
  fail2ban: "fail2ban: active jails, ban counts.",
  caddy: "Caddy reverse proxy: upstream health, request rates.",
  docker: "Docker fleet: containers running/stopped/unhealthy.",
  prometheus: "Prometheus: series count, scrape targets, storage.",
  grafana: "Grafana: dashboards, data sources, alert rules.",
  "node-exporter": "Host fleet: CPU, memory, disk, network per host.",
  valkey: "Valkey/Redis: memory usage, connected clients, hit rate.",
  pihole: "Pi-hole DNS: queries blocked, top domains, cache hit rate.",
  unifi: "UniFi network: devices, clients, WLAN health.",
  "home-assistant": "Home Assistant: entities, automations, sensor states.",
  mqtt: "MQTT broker: connections, messages/sec, topics.",
  vikunja: "Vikunja tasks: projects, task counts, overdue.",
  "uptime-kuma": "Uptime Kuma: monitor status, response times.",
  ntfy: "ntfy notifications: topics, message rate.",
  searxng: "SearXNG search: query rate, engine health.",
  syncthing: "Syncthing: folder sync status, connected devices.",
  "smb-nfs": "SMB/NFS shares: connections, throughput.",
  "garage-s3": "Garage S3: buckets, object count, storage used.",
  spoolman: "Spoolman 3D filament: spool inventory, usage tracking.",
};

function buildToolSpecs(): ToolSpec[] {
  return ADAPTER_INVENTORY.map((entry) => {
    const desc = TOOL_DESCRIPTIONS[entry.name] ?? `${entry.name} adapter — ${entry.description}`;
    return {
      name: entry.name,
      description: desc,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional sub-query (e.g. 'libraries', 'sessions', 'queue'). Defaults to the adapter's primary view.",
          },
        },
      },
      outputSchema: {
        type: "object",
        description: "VisualQueryResult — contains title, state, metrics[], items[], series[], nodes[], edges[], events[] as applicable.",
      },
      annotations: { readOnlyHint: true },
    };
  });
}

export const toolSpecs: ToolSpec[] = buildToolSpecs();

// ── Tool provider (runtime — for Renderer's toolProvider prop) ──

/**
 * Fetches live data from the /api/adapters endpoint for a given tool/adapter.
 * Returns the VisualQueryResult object that the generated dashboard renders.
 *
 * This is defined once at module scope (not inline in JSX) so the Renderer's
 * query manager gets a stable reference — a new object every render thrashes it.
 */
async function fetchAdapter(
  adapterName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const params = new URLSearchParams({ adapter: adapterName });
  const query = typeof args.query === "string" ? args.query : undefined;
  if (query) params.set("query", query);

  const res = await fetch(`/api/adapters?${params.toString()}`);
  if (!res.ok) {
    // Surface as offline rather than throwing — a failed tool should show
    // an empty/offline state, never a crash in the renderer.
    return {
      title: adapterName,
      state: "offline",
      source: "live",
      metrics: [{ label: "Status", value: "OFFLINE", state: "offline" }],
      summary: `Tool fetch failed: HTTP ${res.status}`,
    };
  }
  const json = await res.json();
  // The API returns { adapter, result } — extract the result.
  return json.result ?? json;
}

/**
 * The toolProvider map passed to <Renderer toolProvider={...} />.
 *
 * Keys are adapter/tool names matching the Query() calls in generated code.
 * Each value is an async function receiving the Query() args and returning
 * the data object.
 */
export const toolProvider: Record<string, (args: Record<string, unknown>) => Promise<unknown>> =
  Object.fromEntries(
    ADAPTER_INVENTORY.map((entry) => [
      entry.name,
      (args: Record<string, unknown>) => fetchAdapter(entry.name, args),
    ]),
  );
