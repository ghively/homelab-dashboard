/**
 * Live-adapter registration for the `media` world.
 *
 * One module per world so that wiring several worlds in parallel never
 * contends on a single file. Called from initAdapters() in adapter-runtime.
 *
 * The rule from adapter-runtime applies unchanged here: register an adapter
 * ONLY when its query() derives every displayed value from a real fetch, and
 * only when its env var is set. An unconfigured service must fall through to a
 * labelled fixture rather than probing a hardcoded default host and rendering
 * a misleading `offline`.
 */

import type { DataAdapter } from "@/adapters/adapter-base";

/**
 * Media world live adapters.
 *
 * Nothing to register here. The six real media services (emby, sonarr, radarr,
 * sabnzbd, romm, tdarr) are already wired in adapter-runtime.
 *
 * Deliberately NOT registered:
 *   disc-ripper — no ripping service exists on the fleet (no listener on gh-media
 *                 for any ARM/ripper UI). It is a phantom inventory entry and
 *                 falls through to a labelled fixture; recommend removing it.
 */
export function register(registry: Map<string, DataAdapter>): void {
  void registry;
}
