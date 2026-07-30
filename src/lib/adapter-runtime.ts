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

export function initAdapters(): void {
  if (initialized) return;
  initialized = true;
  registerEmby();
}

export function getAdapter(name: string): DataAdapter | undefined {
  if (!initialized) initAdapters();
  return registry.get(name);
}

export function isLive(name: string): boolean {
  if (!initialized) initAdapters();
  return registry.has(name);
}
