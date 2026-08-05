// Adapter aggregator — unified access to all adapter data sources.
// Provides fixture-backed results for offline/development use and
// routes to real adapters when available.

import type { VisualQueryResult, VisualStateValue } from "@/adapters/types";
import { getFixtureForState } from "@/adapters/fixtures";
import { getAdapter } from "@/lib/adapter-runtime";
import { classifyError } from "@/lib/adapter-http";
import { WORLDS, type WorldId } from "./workspace-config";

export interface AdapterEntry {
  name: string;
  world: WorldId;
  description: string;
  host: string;
}

// Build the full adapter inventory from the world config.
// Each adapter gets host info derived from known infrastructure.
const HOST_MAP: Record<string, string> = {
  emby: "gh-media",
  sonarr: "gh-media",
  radarr: "gh-media",
  sabnzbd: "gh-storage",
  romm: "gh-media",
  tdarr: "gh-media",
  "disc-ripper": "gh-media",
  omdb: "external (omdbapi.com)",
  omniroute: "gh-arm",
  litellm: "gh-arm",
  ollama: "gh-nvidia",
  comfyui: "gh-nvidia",
  "hermes-workspace": "gh-vps",
  "hermes-gateway": "gh-vps",
  "hermes-api-server": "gh-vps",
  "hermes-dashboard": "gh-vps",
  "hermes-mcp-bridge": "gh-vps",
  honcho: "gh-arm",
  openwebui: "gh-arm",
  "openwebui-api": "gh-arm",
  "openwebui-vector": "gh-arm",
  "agent-vault": "gh-vps",
  cognee: "gh-arm",
  langfuse: "gh-vps",
  opencode: "gh-vps",
  "home-assistant": "gh-media",
  mqtt: "gh-media",
  "node-red": "gh-media",
  wyoming: "gh-media",
  "stalwart-mail": "gh-vps",
  roundcube: "gh-vps",
  vikunja: "gh-vps",
  outline: "gh-vps",
  telegram: "gh-vps",
  prometheus: "gh-vps",
  loki: "gh-vps",
  alertmanager: "gh-vps",
  grafana: "gh-vps",
  alloy: "gh-vps",
  cadvisor: "gh-vps",
  blackbox: "gh-vps",
  "uptime-kuma": "gh-vps",
  ntfy: "gh-vps",
  docker: "fleet",
  systemd: "fleet",
  "watchtower-vps": "gh-vps",
  "watchtower-media": "gh-media",
  "watchtower-storage": "gh-storage",
  spoolman: "gh-media",
  "node-exporter": "fleet",
  gpu: "gh-nvidia",
  tailscale: "mesh",
  pihole: "LAN",
  unifi: "LAN",
  "cloudflare-dns": "cloud",
  "iot-vlan": "LAN",
  onepanel: "gh-vps",
  valkey: "gh-vps",
  searxng: "gh-vps",
  "garage-s3": "gh-vps",
  "synology-dsm": "gh-storage",
  "smb-nfs": "gh-storage",
  syncthing: "gh-storage",
  caddy: "gh-vps",
  "wazuh-manager": "gh-vps",
  "wazuh-indexer": "gh-vps",
  "wazuh-dashboard": "gh-vps",
  fail2ban: "gh-arm",
  "1password": "cloud",
  wiki: "local",
  obsidian: "local",
  "knowledge-graph": "local",
  spotify: "cloud",
  calendar: "cloud",
  "spoolman-personal": "gh-media",
  scenes: "gh-media",
};

export const ADAPTER_INVENTORY: AdapterEntry[] = WORLDS.flatMap((w) =>
  w.adapters.map((name) => ({
    name,
    world: w.id,
    description: `${name} adapter`,
    host: HOST_MAP[name] ?? "unknown",
  })),
);

// World-specific fixture generators that produce rich, realistic data
// for each adapter in each state.

function worldSpecificFixture(
  adapterName: string,
  world: WorldId,
  state: VisualStateValue,
): VisualQueryResult {
  const base = getFixtureForState(adapterName, state);

  // Enrich with world-specific data for healthy state
  if (state === "healthy") {
    return enrichFixture(adapterName, world, base);
  }
  return base;
}

function enrichFixture(
  adapterName: string,
  world: WorldId,
  base: VisualQueryResult,
): VisualQueryResult {
  const enrichments: Partial<Record<WorldId, Record<string, Partial<VisualQueryResult>>>> = {
    media: {
      emby: {
        title: "Emby — Media Library",
        subtitle: "12,847 items • 8.2 TB • 4K ready",
        metrics: [
          { label: "Library Size", value: "8.2 TB" },
          { label: "Movies", value: 1842 },
          { label: "Episodes", value: 9823 },
          { label: "Active Streams", value: 3 },
          { label: "Transcodes", value: 1 },
        ],
        items: [
          { id: "m1", label: "Dune Part Two", subtitle: "4K HDR • 2024", state: "healthy", value: "★8.5" },
          { id: "m2", label: "The Bear S3", subtitle: "1080p • FX", state: "healthy", value: "14 ep" },
          { id: "m3", label: "Severance S2", subtitle: "4K • Apple TV+", state: "healthy", value: "10 ep" },
          { id: "m4", label: "Foundation S2", subtitle: "4K HDR • Apple TV+", state: "healthy" },
        ],
      },
      sonarr: {
        title: "Sonarr — TV Management",
        subtitle: "342 monitored • 12,847 episodes • 98% complete",
        metrics: [
          { label: "Monitored", value: 342 },
          { label: "Episodes", value: 12847 },
          { label: "Missing", value: 7, state: "warning" },
          { label: "Queue", value: 3 },
        ],
        items: [
          { id: "s1", label: "The Bear", subtitle: "Season 3 • Continuing", state: "healthy", progress: 0.93 },
          { id: "s2", label: "Severance", subtitle: "Season 2 • Complete", state: "healthy", progress: 1 },
          { id: "s3", label: "House of the Dragon", subtitle: "Season 2 • Continuing", state: "healthy", progress: 0.8 },
        ],
      },
      radarr: {
        title: "Radarr — Movie Management",
        subtitle: "1,842 movies • 23 wanted • 12 processing",
        metrics: [
          { label: "Total Movies", value: 1842 },
          { label: "Wanted", value: 23 },
          { label: "Available", value: 1789 },
          { label: "Processing", value: 12, state: "warning" },
        ],
      },
    },
    ai: {
      omniroute: {
        title: "OmniRoute — AI Routing",
        subtitle: "7 providers • 42 models • circuit breakers active",
        metrics: [
          { label: "Providers", value: 7 },
          { label: "Models", value: 42 },
          { label: "Requests/day", value: "12.4K" },
          { label: "Avg Latency", value: "340ms" },
          { label: "Circuit Breakers", value: 0, state: "healthy" },
        ],
      },
      ollama: {
        title: "Ollama — Local Models",
        subtitle: "8 models • 2 loaded • GPU active",
        metrics: [
          { label: "Models", value: 8 },
          { label: "Loaded", value: 2 },
          { label: "VRAM Used", value: "18.2 GB" },
          { label: "GPU", value: "RTX 4090" },
        ],
      },
      litellm: {
        title: "LiteLLM — Proxy & Routing",
        subtitle: "$847 spend • 5 cache pools • fallback chains active",
        metrics: [
          { label: "Spend (30d)", value: "$847" },
          { label: "Cache Hit Rate", value: "34%" },
          { label: "Models", value: 42 },
          { label: "Fallbacks", value: 5 },
        ],
      },
    },
    home: {
      "home-assistant": {
        title: "Home Assistant — Automation Hub",
        subtitle: "847 entities • 23 areas • 156 automations",
        metrics: [
          { label: "Entities", value: 847 },
          { label: "Areas", value: 23 },
          { label: "Automations", value: 156 },
          { label: "Unavailable", value: 3, state: "warning" },
        ],
        items: [
          { id: "h1", label: "Living Room", subtitle: "4 lights • 2 sensors", state: "healthy" },
          { id: "h2", label: "Kitchen", subtitle: "3 lights • 1 climate", state: "healthy" },
          { id: "h3", label: "Office", subtitle: "2 lights • 1 sensor", state: "healthy" },
          { id: "h4", label: "Garage", subtitle: "1 door • 1 light", state: "warning" },
        ],
      },
      mqtt: {
        title: "MQTT — Message Broker",
        subtitle: "342 topics • 12 clients • 8.2K msg/min",
        metrics: [
          { label: "Topics", value: 342 },
          { label: "Clients", value: 12 },
          { label: "Msg/min", value: "8.2K" },
          { label: "Retained", value: 89 },
        ],
      },
    },
    ops: {
      prometheus: {
        title: "Prometheus — Metrics",
        subtitle: "2.4M series • 89 scrape targets • 15s interval",
        metrics: [
          { label: "Series", value: "2.4M" },
          { label: "Targets", value: 89 },
          { label: "Scrape Interval", value: "15s" },
          { label: "Storage", value: "142 GB" },
        ],
      },
      loki: {
        title: "Loki — Log Aggregation",
        subtitle: "847GB logs • 23 sources • 30d retention",
        metrics: [
          { label: "Log Volume", value: "847 GB" },
          { label: "Sources", value: 23 },
          { label: "Ingest Rate", value: "12K/s" },
          { label: "Retention", value: "30d" },
        ],
      },
      docker: {
        title: "Docker — Container Fleet",
        subtitle: "127 containers • 8 hosts • 3 orchestration stacks",
        metrics: [
          { label: "Containers", value: 127 },
          { label: "Running", value: 119 },
          { label: "Stopped", value: 6, state: "warning" },
          { label: "Unhealthy", value: 2, state: "critical" },
        ],
        items: [
          { id: "c1", label: "searxng", subtitle: "gh-vps • running", state: "healthy" },
          { id: "c2", label: "valkey", subtitle: "gh-vps • running", state: "healthy" },
          { id: "c3", label: "caddy", subtitle: "gh-vps • running", state: "healthy" },
          { id: "c4", label: "watchtower", subtitle: "gh-vps • running", state: "healthy" },
        ],
      },
    },
    infrastructure: {
      "node-exporter": {
        title: "Host Fleet — System Metrics",
        subtitle: "5 hosts monitored • CPU/Mem/Disk/Net",
        metrics: [
          { label: "Hosts", value: 5 },
          { label: "Avg CPU", value: "23%" },
          { label: "Avg Memory", value: "47%" },
          { label: "Avg Disk", value: "62%" },
        ],
        items: [
          { id: "host1", label: "gh-vps", subtitle: "Contabo • 4 vCPU • 8GB", state: "healthy" },
          { id: "host2", label: "gh-media", subtitle: "LAN • 8 CPU • 32GB", state: "healthy" },
          { id: "host3", label: "gh-storage", subtitle: "DS1817+ • 16GB", state: "healthy" },
          { id: "host4", label: "gh-arm", subtitle: "ARM64 • 4GB", state: "warning" },
        ],
      },
      tailscale: {
        title: "Tailscale — Mesh Network",
        subtitle: "8 nodes • all connected • ACL enforced",
        metrics: [
          { label: "Nodes", value: 8 },
          { label: "Subnet Routes", value: 4 },
          { label: "Exit Nodes", value: 1 },
          { label: "ACL Rules", value: 12 },
        ],
        nodes: [
          { id: "ts1", label: "gh-vps", x: 200, y: 80, state: "healthy" },
          { id: "ts2", label: "gh-media", x: 100, y: 200, state: "healthy" },
          { id: "ts3", label: "gh-storage", x: 300, y: 200, state: "healthy" },
          { id: "ts4", label: "gh-arm", x: 200, y: 320, state: "warning" },
          { id: "ts5", label: "gh-git", x: 400, y: 120, state: "healthy" },
        ],
        edges: [
          { source: "ts1", target: "ts2" },
          { source: "ts1", target: "ts3" },
          { source: "ts1", target: "ts5" },
          { source: "ts2", target: "ts4" },
        ],
      },
      "synology-dsm": {
        title: "Synology DS1817+ — NAS",
        subtitle: "48.2 TB used / 72 TB total • 13 drives",
        metrics: [
          { label: "Total Capacity", value: "72 TB" },
          { label: "Used", value: "48.2 TB" },
          { label: "Drives", value: 13 },
          { label: "SMART Warnings", value: 0, state: "healthy" },
        ],
      },
    },
    security: {
      "wazuh-manager": {
        title: "Wazuh — Intrusion Detection",
        subtitle: "8 agents • Level 12 alerts • 24h monitoring",
        metrics: [
          { label: "Agents", value: 8 },
          { label: "Alerts (24h)", value: 142 },
          { label: "Critical", value: 0, state: "healthy" },
          { label: "High", value: 3, state: "warning" },
        ],
        events: [
          { id: "e1", at: "2026-07-29 10:15", title: "SSH brute-force blocked", detail: "fail2ban: 192.168.1.42 banned", state: "warning" },
          { id: "e2", at: "2026-07-29 09:42", title: "Root login detected", detail: "gh-vps from 100.92.162.32", state: "healthy" },
          { id: "e3", at: "6:20 AM", title: "File integrity check passed", detail: "All monitored files unchanged", state: "healthy" },
        ],
      },
      fail2ban: {
        title: "fail2ban — Brute Force Prevention",
        subtitle: "4 jails • 23 bans active • 890 total",
        metrics: [
          { label: "Active Jails", value: 4 },
          { label: "Bans (active)", value: 23 },
          { label: "Bans (total)", value: 890 },
          { label: "Find Time", value: "10m" },
        ],
      },
    },
    knowledge: {
      wiki: {
        title: "Knowledge World — Wiki Index",
        subtitle: "662 documents • FTS + embeddings • 32MB index",
        metrics: [
          { label: "Documents", value: 662 },
          { label: "Index Size", value: "32 MB" },
          { label: "FTS Terms", value: "48.2K" },
          { label: "Embeddings", value: 662 },
        ],
        items: [
          { id: "d1", label: "gh-vps", subtitle: "Infrastructure • updated 2h ago", state: "healthy" },
          { id: "d2", label: "gene", subtitle: "People • updated 5h ago", state: "healthy" },
          { id: "d3", label: "caddy", subtitle: "DevOps • updated 1d ago", state: "healthy" },
          { id: "d4", label: "gitlab", subtitle: "DevOps • updated 3d ago", state: "healthy" },
          { id: "d5", label: "searxng", subtitle: "DevOps • updated 1d ago", state: "healthy" },
        ],
      },
    },
    personal: {
      spotify: {
        title: "Spotify — Now Playing",
        subtitle: "Premium • 3 devices • 42 playlists",
        metrics: [
          { label: "Playlists", value: 42 },
          { label: "Saved Tracks", value: "1.2K" },
          { label: "Devices", value: 3 },
          { label: "Monthly Hours", value: 89 },
        ],
      },
    },
  };

  const worldData = enrichments[world]?.[adapterName];
  if (worldData) {
    return { ...base, ...worldData };
  }
  return base;
}

// Query a single adapter by name in a given state.
// Routing rules (Phase 1b):
//   1. Live adapter registered + succeeds → return live result, source: "live".
//   2. No adapter registered (service unconfigured) → fixture, source: "fixture".
//   3. Live adapter THROWS → return a minimal offline result, source: "live".
//      NEVER silently fall back to a healthy fixture. A configured service that
//      cannot be reached must show offline — this is the entire point of Phase 0.
// `view` selects between the named queries an adapter exposes via the bridge
// (e.g. emby "sessions" vs "library"). Omitted means the adapter's defaultQuery.
// This must be threaded through: the model emits Query("emby", {view: "sessions"}),
// and dropping it here would silently return the default view instead — the
// wrong data, with no error.
export async function queryAdapter(
  adapterName: string,
  state: VisualStateValue | null = null,
  view?: string,
  filters?: Record<string, unknown>,
): Promise<VisualQueryResult | null> {
  const entry = ADAPTER_INVENTORY.find((a) => a.name === adapterName);
  if (!entry) return null;

  // An EXPLICIT state is a request for that fixture — it is how the state
  // exerciser asks "what does `critical` look like?". Preferring the live
  // adapter here answered the wrong question and, worse, turned a preview grid
  // into 32 real network calls (a Synology DSM login takes ~5s, so the landing
  // page hung for the better part of a minute). null means "prefer live".
  if (state !== null) {
    return { ...worldSpecificFixture(adapterName, entry.world, state), source: "fixture" };
  }

  const liveAdapter = getAdapter(adapterName);
  if (liveAdapter) {
    try {
      const params: { query?: string; filters?: Record<string, unknown> } = {};
      if (view) params.query = view;
      if (filters && Object.keys(filters).length) params.filters = filters;
      const result = await liveAdapter.query(params);
      return { ...result, source: "live" };
    } catch (err) {
      // Classify rather than blanket-`offline`. "Credentials rejected",
      // "nothing answered within the timeout" and "the service returned 500"
      // are three different problems with three different fixes, and a single
      // OFFLINE badge for all of them tells the reader nothing actionable.
      // The adapters that catch internally already do this via failureResult();
      // this is the safety net for the ones that throw (every bridged adapter
      // under src/lib/adapters/ does).
      const c = classifyError(err);
      return {
        title: adapterName,
        subtitle: c.message,
        state: c.state,
        source: "live",
        freshness: {
          adapter: adapterName,
          source: `live:${adapterName}`,
          queriedAt: new Date().toISOString(),
          stalenessSeconds: 0,
          cacheHit: false,
        },
        metrics: [
          { label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state },
        ],
        summary: `${adapterName}: ${c.message}`,
      };
    }
  }

  // No live adapter registered — service is unconfigured, fall back to fixture.
  // `state` is null on this path (an explicit state returned above), so show
  // the healthy sample.
  return {
    ...worldSpecificFixture(adapterName, entry.world, state ?? "healthy"),
    source: "fixture",
  };
}

/**
 * Run a write action against a live adapter. Unlike queryAdapter(), this
 * NEVER falls back to a fixture — a fixture "succeeding" a mutation would be
 * a fabricated result for a real-world action, which is a different order of
 * dishonesty than a fixture standing in for a read. No live adapter
 * registered, or an adapter that doesn't support mutations, is a hard
 * failure with a message naming why, not a silent no-op success.
 */
export async function mutateAdapter(
  adapterName: string,
  action: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; message: string }> {
  const entry = ADAPTER_INVENTORY.find((a) => a.name === adapterName);
  if (!entry) return { success: false, message: `Unknown adapter "${adapterName}".` };

  const liveAdapter = getAdapter(adapterName);
  if (!liveAdapter) {
    return { success: false, message: `${adapterName} is not configured — nothing to act on.` };
  }
  if (!liveAdapter.mutate) {
    return { success: false, message: `${adapterName} does not support write actions.` };
  }

  try {
    return await liveAdapter.mutate(action, args);
  } catch (err) {
    const c = classifyError(err);
    return { success: false, message: c.message };
  }
}

// Query all adapters for a world.
export async function queryWorld(
  world: WorldId,
  state: VisualStateValue | null = null,
): Promise<{ adapter: string; result: VisualQueryResult }[]> {
  const worldConfig = WORLDS.find((w) => w.id === world);
  if (!worldConfig) return [];
  const results = await Promise.all(
    worldConfig.adapters.map(async (name) => {
      const result = await queryAdapter(name, state);
      return { adapter: name, result: result! };
    }),
  );
  return results.filter((r) => r.result);
}

// Get a world-level summary (aggregate health).
export function worldSummary(
  world: WorldId,
  results: { adapter: string; result: VisualQueryResult }[],
): { state: VisualStateValue; healthy: number; total: number; title: string; subtitle: string } {
  const total = results.length;

  // Rollup severity for a WORLD tile, which is not the same as a panel's state.
  //
  // `empty` and `loading` describe a panel with nothing to draw; they say
  // nothing bad about the service. Ranking them above `healthy` meant one idle
  // panel dragged a whole world down: SABnzbd with an empty download queue —
  // the desirable state — made the entire Media world read `empty` on the
  // landing page while Emby, Sonarr, Radarr and Tdarr were all healthy.
  //
  // They now rank alongside `healthy`, so only a real problem (stale, warning,
  // denied, critical, offline) can degrade a world.
  const stateRank: Record<VisualStateValue, number> = {
    healthy: 0,
    loading: 0,
    empty: 0,
    stale: 2,
    warning: 3,
    denied: 4,
    critical: 5,
    offline: 6,
  };
  let worstState: VisualStateValue = "healthy";
  for (const r of results) {
    if (stateRank[r.result.state] > stateRank[worstState]) {
      worstState = r.result.state;
    }
  }
  const healthy = results.filter((r) => r.result.state === "healthy").length;
  const worldConfig = WORLDS.find((w) => w.id === world);
  return {
    state: worstState,
    healthy,
    total,
    title: worldConfig?.label ?? world,
    subtitle: `${healthy}/${total} healthy • ${worldConfig?.tagline ?? ""}`,
  };
}

// Re-exported for existing server-side callers. Client components must import
// from "@/lib/visual-states" directly — importing it from here pulls the whole
// adapter tree (and Node built-ins) into the browser bundle.
export { ALL_STATES } from "@/lib/visual-states";
