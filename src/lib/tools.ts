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
 */
const inputSchema = {
  type: "object",
  properties: {
    view: {
      type: "string",
      description: "Optional query selector for multi-view adapters",
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
      const view =
        typeof args?.view === "string" ? `&view=${encodeURIComponent(args.view)}` : "";
      const res = await fetch(`/api/adapters?adapter=${encodeURIComponent(name)}${view}`);
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
