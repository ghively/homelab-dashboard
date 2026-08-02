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

const registry = new Map<string, DataAdapter>();
let initialized = false;

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
      "recent-movies": (a) => a.queryRecentlyAddedMovies(),
      "continue-watching": (a) => a.queryContinueWatching(),
      "sessions": (a) => a.queryPlaybackSessions(),
      "libraries": (a) => a.queryLibraryOverview(),
      "series": (a) => a.querySeries(),
      "albums": (a) => a.queryAlbums(),
    },
    defaultQuery: "libraries",
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

function registerRomm(): void {
  const cfg = getServiceConfig("romm");
  if (!cfg) return;

  const adapter = new RommAdapter({ baseUrl: cfg.url, apiKey: cfg.apiKey });

  registry.set(
    "romm",
    bridgeAdapter({
      name: "romm",
      description: "RomM game ROM library",
      category: "media",
      adapter,
      queryMap: {
        "platforms": (a) => a.queryPlatforms(),
        "status": (a) => a.querySystemStatus(),
        "scans": (a) => a.queryScanJobs(),
        "missing": (a) => a.queryMissingRoms(),
      },
      defaultQuery: "platforms",
    }),
  );
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
}

export function getAdapter(name: string): DataAdapter | undefined {
  if (!initialized) initAdapters();
  return registry.get(name);
}

export function isLive(name: string): boolean {
  if (!initialized) initAdapters();
  return registry.has(name);
}
