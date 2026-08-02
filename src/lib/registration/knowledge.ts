/**
 * Live-adapter registration for the `knowledge` world.
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
 * This world has no services in it. There is no wiki server, no Obsidian sync
 * endpoint and no graph database anywhere on the fleet. What does exist is a
 * real markdown corpus on local disk — the Hermes wiki — and both registered
 * adapters read it directly with fs, which is why they are gated on a path
 * rather than a URL.
 *
 * Registered and reading real data:
 *   wiki            WIKI_PATH            — document, section, byte and recency
 *                                          counts walked from the directory
 *   knowledge-graph KNOWLEDGE_GRAPH_PATH — the link graph parsed out of the
 *                                          markdown ([[wikilinks]] and .md
 *                                          links), including broken links
 *
 * NOT registered:
 *   obsidian — no Obsidian vault exists on this host. A search for `.obsidian`
 *   directories found nothing, and there is no Obsidian Sync or Local REST API
 *   endpoint listening anywhere on the tailnet. Its panel stays a labelled
 *   fixture; the honest fix is to drop it from the world inventory.
 *
 * A NOTE ON knowledge-graph
 * -------------------------
 * Registering it is a judgement call worth being explicit about. The name
 * suggests a graph service, and there isn't one; what the adapter reports is
 * the link structure genuinely present in the wiki files. Every figure it
 * shows is counted from file contents, so nothing is fabricated — but if the
 * intent behind the inventory entry was a real graph database, this adapter
 * should be replaced rather than kept, and the panel title changed with it.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import wiki from "@/adapters/knowledge/wiki-adapter";
import knowledgeGraph from "@/adapters/knowledge/knowledge-graph-adapter";

const KNOWLEDGE_ADAPTERS: Array<[name: string, envVar: string, adapter: DataAdapter]> = [
  ["wiki", "WIKI_PATH", wiki],
  ["knowledge-graph", "KNOWLEDGE_GRAPH_PATH", knowledgeGraph],
];

export function register(registry: Map<string, DataAdapter>): void {
  for (const [name, envVar, adapter] of KNOWLEDGE_ADAPTERS) {
    if (process.env[envVar]) registry.set(name, adapter);
  }
}
