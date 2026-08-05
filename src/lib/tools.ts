/**
 * Tool definitions for OpenUI's Query() / Mutation() workflow.
 *
 * Two halves that must agree on tool names:
 *
 *  - `toolSpecs` (server-safe): injected into the system prompt via
 *    prompt-options `tools`. Describes each adapter the model may call.
 *    Generated from WORLDS so the tool list and the adapter inventory
 *    can never drift.
 *
 *  - `createToolProvider()` (client): builds the function-map ToolProvider
 *    the Renderer calls at runtime. Each handler POSTs to /api/adapters
 *    and returns the result body. A null/throwing adapter yields an
 *    offline result (handled server-side by queryAdapter) — the panel
 *    transitions to the offline state instead of showing stale numbers.
 */

import type { ToolSpec } from "@openuidev/lang-core";
import { WORLDS } from "@/lib/workspace-config";

/**
 * Compact input schema shared by every adapter tool.
 * The model passes a `view` to select between queries an adapter exposes
 * (e.g. emby "recent-movies" vs "sessions"); omitting it uses the default.
 * Any other property is forwarded verbatim to the adapter as a filter (e.g.
 * `genre` for emby's "by-genre" view or romm's "roms" view) — see
 * serviceGuideText in prompt-options.ts for which view accepts which filter.
 */
const inputSchema = {
  type: "object",
  properties: {
    view: {
      type: "string",
      description: "Optional query selector for multi-view adapters",
    },
    genre: {
      type: "string",
      description: "Optional genre filter, for views that support it (e.g. emby \"by-genre\", romm \"roms\")",
    },
    search: {
      type: "string",
      description: "Optional free-text search term, for views that support it (e.g. emby \"search\", romm \"roms\")",
    },
    mediaType: {
      type: "string",
      enum: ["movie", "series"],
      description: "Optional content-type narrowing for emby's \"by-genre\" view — omit to search both movies and TV series",
    },
    unwatched: {
      type: "boolean",
      description: "For emby's \"by-genre\" view: only titles not yet watched. Degrades to unfiltered (with an honest note) if Emby's user can't be resolved.",
    },
    itemId: {
      type: "string",
      description: "For emby's \"similar\" view: the item id to find similar titles for (from a prior Query's items[N].id, or from drill-down entity data)",
    },
    year: {
      type: "string",
      description: "For omdb's \"ratings\" view: a bare 4-digit release year (e.g. \"2017\"), to disambiguate a same-titled match — not a combined field like Emby's item subtitle, which may include the media type too",
    },
  },
} as const;

/**
 * Output schema — intentionally loose. VisualQueryResult is a union of
 * optional fields (metrics, items, series, nodes, edges, events, ...).
 * Keeping it as a permissive object lets the prompt generator emit a
 * minimal default without enumerating every field.
 */
const outputSchema = {
  type: "object",
  additionalProperties: true,
} as const;

/**
 * All adapter names across the 8 worlds, de-duplicated and sorted.
 * Tool names are the bare adapter names the model uses in Query().
 */
const adapterNames: string[] = [
  ...new Set(WORLDS.flatMap((w) => w.adapters)),
].sort();

export const toolSpecs: ToolSpec[] = adapterNames.map((name) => ({
  name,
  description: `Query the ${name} adapter for live status data.`,
  inputSchema,
  outputSchema,
  annotations: { readOnlyHint: true },
}));

/**
 * Output schema for a mutation — always {success, message}, never the rich
 * VisualQueryResult shape queries return. A mutation answers "did it work",
 * not "here is the current state" (the model re-Queries if it wants that).
 */
const mutationOutputSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
  },
  required: ["success", "message"],
} as const;

/**
 * Write-action tools. Deliberately separate from `toolSpecs` (the read-only
 * adapter list) rather than appended to it — `toolSpecs` also seeds the
 * `ADAPTER NAMES` closed list in prompt-options.ts (the first argument to
 * Query()), and a mutation tool name is never valid there. Combine both
 * arrays only at the `tools:` field the model actually sees.
 *
 * `destructiveHint: true` marks anything that removes/deletes rather than
 * pauses or re-searches — it does not gate execution (the OpenUI runtime
 * enforces no such gate itself; see prompt-options.ts's MUTATIONS rule,
 * which is the actual confirm-before-firing mechanism).
 */
export const mutationToolSpecs: ToolSpec[] = [
  {
    name: "radarr_search_movie",
    description: "Trigger Radarr to search its indexers again for one movie (by id). Idempotent — does not grab or download anything on its own.",
    inputSchema: { type: "object", properties: { movieId: { type: "number" } }, required: ["movieId"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "radarr_remove_queue_item",
    description: "Remove a stuck item from Radarr's download queue (by queue id). The movie stays monitored and searchable again.",
    inputSchema: { type: "object", properties: { queueId: { type: "number" } }, required: ["queueId"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "sonarr_search_episode",
    description: "Trigger Sonarr to search its indexers again for one episode (by id). Idempotent — does not grab or download anything on its own.",
    inputSchema: { type: "object", properties: { episodeId: { type: "number" } }, required: ["episodeId"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "sonarr_remove_queue_item",
    description: "Remove a stuck item from Sonarr's download queue (by queue id). The episode stays monitored and searchable again.",
    inputSchema: { type: "object", properties: { queueId: { type: "number" } }, required: ["queueId"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "sabnzbd_set_queue_paused",
    description: "Pause or resume SABnzbd's entire download queue. Fully reversible either direction, no data loss.",
    inputSchema: { type: "object", properties: { paused: { type: "boolean" } }, required: ["paused"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "sabnzbd_set_item_paused",
    description: "Pause or resume ONE item in SABnzbd's queue, by nzo_id (from a prior queue Query's items). Fully reversible.",
    inputSchema: { type: "object", properties: { nzoId: { type: "string" }, paused: { type: "boolean" } }, required: ["nzoId", "paused"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "sabnzbd_delete_item",
    description: "Remove one item from SABnzbd's queue entirely, by nzo_id. NOT reversible — the download is gone, not paused.",
    inputSchema: { type: "object", properties: { nzoId: { type: "string" } }, required: ["nzoId"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "emby_set_watched",
    description: "Mark an Emby item watched or unwatched, by item id. Fully reversible either direction.",
    inputSchema: { type: "object", properties: { itemId: { type: "string" }, watched: { type: "boolean" } }, required: ["itemId", "watched"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "radarr_add_movie",
    description: "Add a movie Radarr does not track yet and start searching for it — the real 'download this' action, for a title not already in the library. Get tmdbId/title/year from a prior Query(\"radarr\", {view:\"lookup\", search:\"<title>\"}) result first — never guess a tmdbId.",
    inputSchema: { type: "object", properties: { tmdbId: { type: "number" }, title: { type: "string" }, year: { type: "number" } }, required: ["tmdbId", "title", "year"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "sonarr_add_series",
    description: "Add a TV series Sonarr does not track yet and start searching for missing episodes — the real 'download this' action, for a show not already in the library. Get tvdbId/title/year from a prior Query(\"sonarr\", {view:\"lookup\", search:\"<title>\"}) result first — never guess a tvdbId.",
    inputSchema: { type: "object", properties: { tvdbId: { type: "number" }, title: { type: "string" }, year: { type: "number" } }, required: ["tvdbId", "title", "year"] },
    outputSchema: mutationOutputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

const mutationTools: Record<string, { adapter: string; action: string }> = {
  radarr_search_movie: { adapter: "radarr", action: "search-movie" },
  radarr_remove_queue_item: { adapter: "radarr", action: "remove-queue-item" },
  sonarr_search_episode: { adapter: "sonarr", action: "search-episode" },
  sonarr_remove_queue_item: { adapter: "sonarr", action: "remove-queue-item" },
  sabnzbd_set_queue_paused: { adapter: "sabnzbd", action: "set-queue-paused" },
  sabnzbd_set_item_paused: { adapter: "sabnzbd", action: "set-item-paused" },
  sabnzbd_delete_item: { adapter: "sabnzbd", action: "delete-item" },
  emby_set_watched: { adapter: "emby", action: "set-watched" },
  radarr_add_movie: { adapter: "radarr", action: "add-movie" },
  sonarr_add_series: { adapter: "sonarr", action: "add-series" },
};

/**
 * Client-side ToolProvider — a function map keyed by adapter name.
 *
 * Each handler calls the /api/adapters endpoint, which routes to the live
 * adapter (source: "live") or a fixture (source: "fixture"), and returns
 * an offline result if the live adapter throws. The result body is the
 * VisualQueryResult the component renders.
 *
 * Defined once at module scope (not per-render) so the Renderer's query
 * manager sees a stable provider identity.
 */
export function createToolProvider(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  const provider: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > = {};

  for (const name of adapterNames) {
    provider[name] = async (args) => {
      // Forward every arg the model passed — not just `view` — so a filter
      // like `genre` reaches the API route generically. /api/adapters treats
      // `view` as the query selector and everything else as a filter.
      const params = new URLSearchParams({ adapter: name });
      for (const [key, value] of Object.entries(args ?? {})) {
        if (value == null) continue;
        params.set(key, String(value));
      }
      const res = await fetch(`/api/adapters?${params}`);
      if (!res.ok) {
        // Surface the failure as an offline-shaped result rather than throwing,
        // so the panel shows the offline state instead of a render error.
        return {
          title: name,
          state: "offline",
          source: "live",
          metrics: [{ label: "Status", value: "OFFLINE", state: "offline" }],
        };
      }
      const body = await res.json();
      return body?.result ?? body;
    };
  }

  for (const [toolName, { adapter, action }] of Object.entries(mutationTools)) {
    provider[toolName] = async (args) => {
      const res = await fetch("/api/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapter, action, args }),
      });
      // /api/mutate always returns JSON (200 on success, 502 on a classified
      // failure, 400 on a malformed request) — never throw here, so a failed
      // mutation resolves to {success:false, message} the model can render,
      // not a promise rejection the Renderer has to catch separately.
      return res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));
    };
  }

  return provider;
}
