/**
 * Adapter runtime — registers live adapters into a shared registry.
 *
 * Call initAdapters() once per process (idempotent — safe to call from
 * route handlers). Each entry point checks getServiceConfig() and only
 * registers the adapter when the service has a URL + API key set.
 *
 * queryAdapter() in adapter-aggregator consults getAdapter() to decide
 * whether to hit live data or fall back to fixtures.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import { bridgeAdapter } from "@/lib/adapter-bridge";
import { getServiceConfig } from "@/lib/adapter-config";
import { EmbyAdapter } from "@/lib/adapters/emby/adapter";
import { SonarrAdapter } from "@/lib/adapters/sonarr/adapter";
import { RadarrAdapter } from "@/lib/adapters/radarr/adapter";
import { SabnzbdAdapter } from "@/lib/adapters/sabnzbd/adapter";
import { TdarrAdapter } from "@/lib/adapters/tdarr/adapter";
import { RommAdapter } from "@/lib/adapters/romm/adapter";
import { PiHoleAdapter } from "@/adapters/pihole-adapter";
import { UnifiAdapter } from "@/adapters/unifi-adapter";
import watchtowerVps from "@/adapters/storage/watchtower-vps-adapter";
import watchtowerMedia from "@/adapters/storage/watchtower-media-adapter";
import watchtowerStorage from "@/adapters/storage/watchtower-storage-adapter";
import { SearXNGAdapter } from "@/adapters/searxng-adapter";
import { CloudflareDNSAdapter } from "@/adapters/cloudflare-dns-adapter";
import ollama from "@/adapters/ai/ollama";
import litellm from "@/adapters/ai/litellm";
import comfyui from "@/adapters/ai/comfyui";
import caddy from "@/adapters/storage/caddy-adapter";
import spoolman from "@/adapters/storage/spoolman-adapter";
import syncthing from "@/adapters/storage/syncthing-adapter";
import synologyDsm from "@/adapters/storage/synology-dsm-adapter";
import garageS3 from "@/adapters/garage-s3-adapter";
import fail2ban from "@/adapters/Fail2banAdapter";
import wazuhManager from "@/adapters/security/wazuh-manager-adapter";
import wazuhIndexer from "@/adapters/security/wazuh-indexer-adapter";
import wazuhDashboard from "@/adapters/security/wazuh-dashboard-adapter";
import hermesGateway from "@/adapters/hermes/hermes-gateway";
import hermesDashboard from "@/adapters/hermes/hermes-dashboard";
import hermesApiServer from "@/adapters/hermes/hermes-api-server";
import hermesMcpBridge from "@/adapters/hermes/hermes-mcp-bridge";
import hermesWorkspace from "@/adapters/hermes/hermes-workspace";
import prometheus from "@/adapters/ops/prometheus-adapter";
import loki from "@/adapters/ops/loki-adapter";
import grafana from "@/adapters/ops/grafana-adapter";
import ntfy from "@/adapters/ops/ntfy-adapter";
import cadvisor from "@/adapters/ops/cadvisor-adapter";
import blackbox from "@/adapters/ops/blackbox-adapter";
import uptimeKuma from "@/adapters/ops/uptime-kuma-adapter";
import nodeExporter from "@/adapters/infra/node-exporter-adapter";
import tailscale from "@/adapters/infra/tailscale-adapter";
import { registerWorldAdapters } from "@/lib/registration";
import openwebui from "@/adapters/ai/openwebui";
import langfuse from "@/adapters/ai/langfuse";

const registry = new Map<string, DataAdapter>();
let initialized = false;
// (adapter registry rev: romm heartbeat default + ops/infra adapters)

function registerEmby(): void {
  const cfg = getServiceConfig("emby");
  if (!cfg) return;

  const adapter = new EmbyAdapter({
    baseUrl: cfg.url,
    apiKey: cfg.apiKey,
    ...(cfg.userId ? { userId: cfg.userId } : {}),
  });

  const bridged = bridgeAdapter({
    name: "emby",
    description: "Emby media server",
    category: "media",
    adapter,
    queryMap: {
      "overview": (a) => a.queryOverview(),
      "recent-movies": (a) => a.queryRecentlyAddedMovies(),
      "continue-watching": (a) => a.queryContinueWatching(),
      "sessions": (a) => a.queryPlaybackSessions(),
      "libraries": (a) => a.queryLibraryOverview(),
      "series": (a) => a.querySeries(),
      "albums": (a) => a.queryAlbums(),
      // Content discovery: filters.genre / filters.search are the model's
      // Query() args, e.g. Query("emby", {view: "by-genre", genre: "Horror"}).
      "by-genre": (a, filters) => a.queryByGenre(typeof filters?.genre === "string" ? filters.genre : ""),
      "search": (a, filters) => a.querySearch(typeof filters?.search === "string" ? filters.search : ""),
    },
    // Overview = library-count KPIs + recent-movie posters, so the media page
    // shows Emby's cover art like Sonarr/Radarr. `libraries` is still available
    // by name for a counts-only view.
    defaultQuery: "overview",
  });

  registry.set("emby", bridged);
}

function registerSonarr(): void {
  const cfg = getServiceConfig("sonarr");
  if (!cfg) return;

  const adapter = new SonarrAdapter({ baseUrl: cfg.url, apiKey: cfg.apiKey });

  registry.set(
    "sonarr",
    bridgeAdapter({
      name: "sonarr",
      description: "Sonarr TV series manager",
      category: "media",
      adapter,
      queryMap: {
        "series": (a) => a.queryAllSeries(),
        "wanted": (a) => a.queryWantedMissing(),
        "queue": (a) => a.queryQueue(),
        "calendar": (a) => a.queryCalendar(),
        "disk": (a) => a.queryDiskSpace(),
      },
      defaultQuery: "series",
    }),
  );
}

function registerRadarr(): void {
  const cfg = getServiceConfig("radarr");
  if (!cfg) return;

  const adapter = new RadarrAdapter({ baseUrl: cfg.url, apiKey: cfg.apiKey });

  registry.set(
    "radarr",
    bridgeAdapter({
      name: "radarr",
      description: "Radarr movie manager",
      category: "media",
      adapter,
      queryMap: {
        "movies": (a) => a.queryAllMovies(),
        "wanted": (a) => a.queryWantedMissing(),
        "queue": (a) => a.queryQueue(),
        "calendar": (a) => a.queryCalendar(),
        "disk": (a) => a.queryDiskSpace(),
        // Content discovery: the "you could download this" half — see
        // emby's "by-genre" for the "available now" half.
        "wanted-by-genre": (a, filters) =>
          a.queryWantedByGenre(typeof filters?.genre === "string" ? filters.genre : ""),
      },
      defaultQuery: "movies",
    }),
  );
}

function registerSabnzbd(): void {
  const cfg = getServiceConfig("sabnzbd");
  if (!cfg) return;

  const adapter = new SabnzbdAdapter({ baseUrl: cfg.url, apiKey: cfg.apiKey });

  registry.set(
    "sabnzbd",
    bridgeAdapter({
      name: "sabnzbd",
      description: "SABnzbd usenet downloader",
      category: "media",
      adapter,
      queryMap: {
        "queue": (a) => a.queryQueue(),
        "history": (a) => a.queryHistory(),
        "servers": (a) => a.queryServerStatus(),
        "warnings": (a) => a.queryWarnings(),
        "speed": (a) => a.querySpeed(),
      },
      defaultQuery: "queue",
    }),
  );
}

function registerTdarr(): void {
  const cfg = getServiceConfig("tdarr");
  if (!cfg) return;

  const adapter = new TdarrAdapter({ baseUrl: cfg.url, apiKey: cfg.apiKey });

  registry.set(
    "tdarr",
    bridgeAdapter({
      name: "tdarr",
      description: "Tdarr media transcoding farm",
      category: "media",
      adapter,
      queryMap: {
        "status": (a) => a.querySystemStatus(),
        "jobs": (a) => a.queryJobs(),
        "libraries": (a) => a.queryLibraries(),
        "workers": (a) => a.queryWorkers(),
        "failed": (a) => a.queryFailedJobs(),
      },
      defaultQuery: "status",
    }),
  );
}

/**
 * RomM registers on ROMM_URL alone.
 *
 * Unlike the *arr services, RomM's API key is optional at construction — and
 * the deployed instance answers /api/heartbeat anonymously while returning 403
 * for /api/platforms. Requiring ROMM_API_KEY here meant a reachable, running
 * RomM rendered a healthy-looking fixture labelled SAMPLE DATA. Registering on
 * the URL lets the 403 surface as `denied`, which names the actual problem.
 */
function registerRomm(): void {
  const url = process.env.ROMM_URL;
  if (!url) return;
  const apiKey = process.env.ROMM_API_KEY ?? "";

  const adapter = new RommAdapter({ baseUrl: url, apiKey });

  registry.set(
    "romm",
    bridgeAdapter({
      name: "romm",
      description: "RomM game ROM library",
      category: "media",
      adapter,
      queryMap: {
        // Default is heartbeat: the only endpoint a keyless RomM answers. The
        // rest need ROMM_API_KEY and will render `denied` (naming the fix)
        // rather than a misleading offline when no key is set.
        "heartbeat": (a) => a.queryHeartbeat(),
        "platforms": (a) => a.queryPlatforms(),
        "stats": (a) => a.queryStats(),
        "tasks": (a) => a.queryTasks(),
        // Real ROM browsing with cover art. filters.genre/search/missing are
        // the model's Query() args, e.g. Query("romm", {view: "roms", genre: "Platformer"}).
        "roms": (a, filters) =>
          a.queryRoms({
            genre: typeof filters?.genre === "string" ? filters.genre : undefined,
            search: typeof filters?.search === "string" ? filters.search : undefined,
          }),
        "missing": (a) => a.queryRoms({ missing: true }),
      },
      defaultQuery: "heartbeat",
    }),
  );
}

/**
 * Adapters under src/adapters/ implement DataAdapter directly, so they need no
 * bridge — they go straight into the registry.
 *
 * They read their own env vars rather than going through getServiceConfig(),
 * and each has a hardcoded default host baked into the module. That default is
 * why registration is gated on the env var being explicitly set: without the
 * gate an unconfigured service would hit someone else's LAN address and render
 * `offline`, when the plan requires it to render a labelled fixture instead.
 *
 * Only adapters whose query() derives every displayed value from a real fetch
 * are registered here. See the audit note in the Phase 6 PR — most modules
 * under src/adapters/ return hardcoded data and must NOT be registered.
 */
function registerPihole(): void {
  if (!process.env.PIHOLE_BASE_URL || !process.env.PIHOLE_API_KEY) return;
  registry.set("pihole", new PiHoleAdapter());
}

function registerUnifi(): void {
  if (!process.env.UNIFI_BASE_URL || !process.env.UNIFI_PASSWORD) return;
  registry.set("unifi", new UnifiAdapter());
}

function registerWatchtowers(): void {
  if (process.env.WATCHTOWER_VPS_URL) registry.set("watchtower-vps", watchtowerVps);
  if (process.env.WATCHTOWER_MEDIA_URL) registry.set("watchtower-media", watchtowerMedia);
  if (process.env.WATCHTOWER_STORAGE_URL) registry.set("watchtower-storage", watchtowerStorage);
}

/**
 * SearXNG takes its name as a constructor argument — it is written to support
 * several instances. Only the "searxng" name exists in WORLDS, so that is the
 * one registered here.
 */
function registerSearxng(): void {
  const url = process.env.SEARXNG_URL;
  if (!url) return;
  registry.set("searxng", new SearXNGAdapter("searxng", url));
}

/**
 * Env-gated registration for the remaining DataAdapter modules.
 *
 * Each entry names the env var that must be set for the service to count as
 * configured. Without it the adapter stays out of the registry and
 * queryAdapter() serves a labelled fixture, which is what the plan requires for
 * an unconfigured service.
 */
const ENV_GATED: Array<[name: string, envVar: string, adapter: DataAdapter]> = [
  ["ollama", "OLLAMA_URL", ollama],
  ["litellm", "LITELLM_URL", litellm],
  ["comfyui", "COMFYUI_URL", comfyui],
  ["caddy", "CADDY_ADMIN_URL", caddy],
  ["spoolman", "SPOOLMAN_URL", spoolman],
  ["syncthing", "SYNCTHING_URL", syncthing],
  ["synology-dsm", "SYNOLOGY_URL", synologyDsm],
  ["garage-s3", "GARAGE_ADMIN_URL", garageS3],
  ["fail2ban", "FAIL2BAN_API_URL", fail2ban],
  ["wazuh-manager", "WAZUH_MANAGER_URL", wazuhManager],
  ["wazuh-indexer", "WAZUH_INDEXER_URL", wazuhIndexer],
  ["wazuh-dashboard", "WAZUH_DASHBOARD_URL", wazuhDashboard],
  ["hermes-gateway", "HERMES_GATEWAY_URL", hermesGateway],
  ["hermes-dashboard", "HERMES_DASHBOARD_URL", hermesDashboard],
  ["hermes-api-server", "HERMES_API_SERVER_URL", hermesApiServer],
  ["hermes-mcp-bridge", "HERMES_MCP_BRIDGE_URL", hermesMcpBridge],
  ["hermes-workspace", "HERMES_WORKSPACE_URL", hermesWorkspace],
  ["prometheus", "PROMETHEUS_URL", prometheus],
  ["loki", "LOKI_URL", loki],
  ["grafana", "GRAFANA_URL", grafana],
  ["ntfy", "NTFY_URL", ntfy],
  ["cadvisor", "CADVISOR_URL", cadvisor],
  ["blackbox", "BLACKBOX_URL", blackbox],
  ["uptime-kuma", "UPTIME_KUMA_URL", uptimeKuma],
  ["node-exporter", "NODE_EXPORTER_URLS", nodeExporter],
  ["tailscale", "TAILSCALE_SOCKET", tailscale],
  ["openwebui", "OPENWEBUI_URL", openwebui],
  ["langfuse", "LANGFUSE_URL", langfuse],
];

function registerEnvGated(): void {
  for (const [name, envVar, adapter] of ENV_GATED) {
    if (process.env[envVar]) registry.set(name, adapter);
  }
}

/** Cloudflare needs both a token and a zone id before it can query anything. */
function registerCloudflare(): void {
  if (!process.env.CLOUDFLARE_DNS_API_KEY || !process.env.CLOUDFLARE_DNS_ZONE_ID) return;
  registry.set("cloudflare-dns", new CloudflareDNSAdapter());
}

export function initAdapters(): void {
  if (initialized) return;
  initialized = true;
  registerEmby();
  registerSonarr();
  registerRadarr();
  registerSabnzbd();
  registerTdarr();
  registerRomm();
  registerPihole();
  registerUnifi();
  registerWatchtowers();
  registerSearxng();
  registerEnvGated();
  registerCloudflare();
  // Per-world modules under src/lib/registration/. Runs last so a world
  // module can override an earlier registration for the same adapter name.
  registerWorldAdapters(registry);
}

export function getAdapter(name: string): DataAdapter | undefined {
  if (!initialized) initAdapters();
  return registry.get(name);
}

export function isLive(name: string): boolean {
  if (!initialized) initAdapters();
  return registry.has(name);
}
