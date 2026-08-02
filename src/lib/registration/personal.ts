/**
 * Live-adapter registration for the `personal` world.
 *
 * One module per world so that wiring several worlds in parallel never
 * contends on a single file. Called from initAdapters() in adapter-runtime.
 *
 * The rule from adapter-runtime applies unchanged here: register an adapter
 * ONLY when its query() derives every displayed value from a real fetch, and
 * only when its env var is set. An unconfigured service must fall through to a
 * labelled fixture rather than probing a hardcoded default host and rendering
 * a misleading `offline`.
 *
 * GROUND TRUTH FOR THIS WORLD (probed 2026-08-02 from gh-ai)
 * ----------------------------------------------------------
 * Registered and reading live data:
 *   spoolman-personal SPOOLMAN_URL — gh-media:8090, Spoolman 0.23.1. Same
 *                                    service as the storage world's `spoolman`
 *                                    panel under a second name, framed around
 *                                    filament on hand rather than service
 *                                    health. Its database is currently empty,
 *                                    which the panel reports as `empty`.
 *
 * Registered but expected to render `denied` until a credential is supplied:
 *   scenes   HOME_ASSISTANT_URL — Home Assistant is up at gh-media:8123 and
 *                                 answers /api/ with 401. Scenes are an HA
 *                                 entity domain, so this needs the same
 *                                 HOME_ASSISTANT_TOKEN the home world needs.
 *   calendar CALDAV_URL         — Stalwart serves CalDAV at /dav/cal and
 *                                 answers PROPFIND with 401. Needs
 *                                 CALDAV_USERNAME and CALDAV_PASSWORD.
 *
 * NOT registered:
 *   spotify — nothing to connect to. Spotify is a cloud API behind OAuth, and
 *   there is no client id, client secret or refresh token anywhere on this
 *   host; no Spotify-related credential exists in the dashboard env or in the
 *   Hermes env. An adapter would have nothing to authenticate with, so its
 *   panel stays a labelled fixture. Either provision an OAuth app and a stored
 *   refresh token, or drop it from the world inventory — the current fixture,
 *   which reports "Premium • 3 devices • 42 playlists", is pure invention.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import spoolmanPersonal from "@/adapters/personal/spoolman-personal-adapter";
import scenes from "@/adapters/personal/scenes-adapter";
import calendar from "@/adapters/personal/calendar-adapter";

const PERSONAL_ADAPTERS: Array<[name: string, envVar: string, adapter: DataAdapter]> = [
  ["spoolman-personal", "SPOOLMAN_URL", spoolmanPersonal],
  ["scenes", "HOME_ASSISTANT_URL", scenes],
  ["calendar", "CALDAV_URL", calendar],
];

export function register(registry: Map<string, DataAdapter>): void {
  for (const [name, envVar, adapter] of PERSONAL_ADAPTERS) {
    if (process.env[envVar]) registry.set(name, adapter);
  }
}
