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

  return provider;
}
