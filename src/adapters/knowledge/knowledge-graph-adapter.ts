// Knowledge-graph adapter — the link graph the wiki actually contains.
//
// SCOPE, STATED PLAINLY
// ---------------------
// There is no graph database on this fleet. What there is, is a markdown
// corpus whose documents link to each other with [[wikilinks]] and relative
// .md links — a real graph, stored implicitly. This adapter parses those
// links out of the files and reports the graph they form. Every number is
// counted from file contents:
//   • documents that participate in at least one link (nodes)
//   • links found, split into resolved and unresolved
//   • orphans: documents nothing links to and which link nowhere
//   • the most-linked documents, by inbound edge count
//
// BROKEN vs UNRESOLVED — why these are counted separately
// -------------------------------------------------------
// An unresolved [[wikilink]] is a real defect: wikilinks only ever address
// documents inside the corpus, so one that matches nothing is a dangling
// reference someone should fix. An unresolved markdown .md link usually is
// not: much of this corpus is quoted upstream material, and a captured README
// full of `](CONTRIBUTING.md)` links is pointing at another repository, not at
// a missing wiki page. Lumping the two together produced a "996 broken links"
// headline that was arithmetically true and completely misleading. Only
// dangling wikilinks drive state; outbound file references are reported as
// what they are.
//
// Resolution is exact — slug or path match, never a fuzzy guess — so the
// resolved count is a floor, not an estimate.
//
// If a real graph service is adopted later, this adapter should be replaced
// rather than extended, and the world inventory entry re-pointed at it.

import type { DataAdapter } from "../adapter-base";
import type { Edge, FreshnessInfo, Item, Metric, Node, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { classifyError, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import { readLinks, scanCorpus } from "./wiki-corpus";

const PATH_ENV = "KNOWLEDGE_GRAPH_PATH";

/** Rendering guard — a few hundred nodes is already past what a graph reads well. */
const MAX_GRAPH_NODES = 60;

export class KnowledgeGraphAdapter implements DataAdapter {
  readonly name = "knowledge-graph";
  readonly description = "Knowledge graph — link structure parsed from the wiki corpus.";
  readonly category = "knowledge" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[PATH_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const root = process.env[PATH_ENV];
    if (!root) return notConfiguredResult(this.name, "Knowledge Graph", PATH_ENV);

    const start = Date.now();
    try {
      const corpus = await scanCorpus(root);
      const links = await readLinks(corpus);

      const resolved = links.filter((l) => l.to !== null);
      // Dangling wikilinks are defects; unresolved .md paths are usually
      // references out of the corpus. See the header note.
      const danglingWikilinks = links.filter((l) => l.to === null && l.kind === "wikilink");
      const externalFileRefs = links.filter((l) => l.to === null && l.kind === "markdown");

      const inbound = new Map<string, number>();
      const outbound = new Map<string, number>();
      for (const l of resolved) {
        outbound.set(l.from, (outbound.get(l.from) ?? 0) + 1);
        inbound.set(l.to as string, (inbound.get(l.to as string) ?? 0) + 1);
      }

      const connected = new Set<string>([...inbound.keys(), ...outbound.keys()]);
      const orphans = corpus.docs.filter((d) => !connected.has(d.rel));

      const wikilinks = links.filter((l) => l.kind === "wikilink").length;
      const mdlinks = links.filter((l) => l.kind === "markdown").length;

      const metrics: Metric[] = [
        { label: "Documents", value: corpus.docs.length },
        { label: "Connected", value: connected.size },
        { label: "Orphans", value: orphans.length, state: orphans.length ? "warning" : "healthy" },
        { label: "Links", value: links.length },
        { label: "Resolved", value: resolved.length, state: "healthy" },
        {
          label: "Dangling Wikilinks",
          value: danglingWikilinks.length,
          state: danglingWikilinks.length ? "warning" : "healthy",
        },
        { label: "External File Refs", value: externalFileRefs.length },
        { label: "Wikilinks", value: wikilinks },
        { label: "Markdown Links", value: mdlinks },
      ];

      const topLinked = [...inbound.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_GRAPH_NODES);
      const slugOf = (rel: string) => rel.replace(/\.md$/i, "").split("/").pop() ?? rel;

      const nodes: Node[] = topLinked.map(([rel, count]) => ({
        id: rel,
        label: slugOf(rel),
        value: count,
        state: "healthy" as const,
      }));
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edges: Edge[] = resolved
        .filter((l) => nodeIds.has(l.from) && nodeIds.has(l.to as string))
        .slice(0, 300)
        .map((l) => ({ source: l.from, target: l.to as string }));

      const items: Item[] = [
        ...topLinked.slice(0, 20).map(([rel, count]) => ({
          id: `hub:${rel}`,
          label: slugOf(rel),
          subtitle: `${rel} • ${outbound.get(rel) ?? 0} outbound`,
          value: `${count} inbound`,
          state: "healthy" as const,
          group: "most-linked",
        })),
        ...danglingWikilinks.slice(0, 20).map((l, i) => ({
          id: `dangling:${i}:${l.from}`,
          label: l.target,
          subtitle: `[[${l.target}]] in ${l.from} matches no document`,
          value: "dangling",
          state: "warning" as const,
          group: "dangling-wikilinks",
        })),
      ];

      const state: VisualQueryResult["state"] =
        links.length === 0 ? "empty" : danglingWikilinks.length > 0 ? "warning" : "healthy";

      return {
        title: "Knowledge Graph — Wiki Link Structure",
        subtitle: `${connected.size}/${corpus.docs.length} documents linked • ${links.length} links • ${danglingWikilinks.length} dangling`,
        state,
        freshness: makeFreshness(this.name, root, start),
        metrics,
        items,
        nodes,
        edges,
        summary:
          `Parsed ${links.length} links (${wikilinks} wikilinks, ${mdlinks} markdown) from ` +
          `${corpus.docs.length} documents under ${root}. ${resolved.length} resolve within the corpus; ` +
          `${danglingWikilinks.length} wikilinks dangle and ${externalFileRefs.length} markdown links ` +
          `point at .md files outside it (mostly quoted upstream documentation). ` +
          `${orphans.length} documents are unlinked in both directions. This graph is parsed from the ` +
          `markdown itself — there is no graph database behind it.`,
      };
    } catch (err) {
      const c = classifyError(err);
      return {
        title: "Knowledge Graph — Wiki Link Structure",
        subtitle: `Cannot read ${root}`,
        state: "warning",
        freshness: makeFreshness(this.name, root, start),
        metrics: [
          { label: "Status", value: "UNREADABLE", state: "warning" },
          { label: "Path", value: root },
          { label: "Error", value: c.message },
        ],
        summary: `${PATH_ENV}=${root} could not be scanned: ${c.message}`,
      };
    }
  }
}

const adapter = new KnowledgeGraphAdapter();
export { adapter as default };
