// Wiki adapter — the markdown corpus on disk.
//
// This is NOT a service adapter. There is no wiki server on this fleet; the
// "wiki" is a directory of markdown that Hermes maintains, and WIKI_PATH points
// at it. Every value below is measured by walking that directory: document
// count, per-section counts, bytes on disk, and how recently anything changed.
//
// What is deliberately absent: index size, FTS term counts and embedding
// counts. The fixture this replaces advertised all three ("662 documents •
// FTS + embeddings • 32MB index") for a corpus that has no index and no
// embedding store. If a search index is added later it can be measured; until
// then the panel says how many files there are and when they last moved.
//
// Recency is the state driver. A knowledge base nobody has written to in a
// month is stale, and that is the only failure mode a pile of files has.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { classifyError, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import { formatBytes, scanCorpus } from "./wiki-corpus";

const PATH_ENV = "WIKI_PATH";

const DAY_MS = 86_400_000;
/** No document touched in this long means the corpus has gone quiet. */
const STALE_DAYS = 30;

export class WikiAdapter implements DataAdapter {
  readonly name = "wiki";
  readonly description = "Knowledge wiki — markdown corpus on disk.";
  readonly category = "knowledge" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[PATH_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const root = process.env[PATH_ENV];
    if (!root) return notConfiguredResult(this.name, "Wiki", PATH_ENV);

    const start = Date.now();
    try {
      const corpus = await scanCorpus(root);
      const now = Date.now();

      const sections = new Map<string, { count: number; bytes: number; newest: number }>();
      for (const d of corpus.docs) {
        const s = sections.get(d.section) ?? { count: 0, bytes: 0, newest: 0 };
        s.count += 1;
        s.bytes += d.size;
        s.newest = Math.max(s.newest, d.mtimeMs);
        sections.set(d.section, s);
      }

      const changed7d = corpus.docs.filter((d) => now - d.mtimeMs < 7 * DAY_MS);
      const changed30d = corpus.docs.filter((d) => now - d.mtimeMs < 30 * DAY_MS);
      const newest = corpus.docs.reduce<number>((max, d) => Math.max(max, d.mtimeMs), 0);
      const daysSinceChange = newest ? Math.floor((now - newest) / DAY_MS) : Infinity;

      const metrics: Metric[] = [
        { label: "Documents", value: corpus.docs.length },
        { label: "Sections", value: sections.size },
        { label: "On Disk", value: formatBytes(corpus.totalBytes) },
        { label: "Changed 7d", value: changed7d.length },
        { label: "Changed 30d", value: changed30d.length },
        {
          label: "Last Change",
          value: Number.isFinite(daysSinceChange) ? `${daysSinceChange}d ago` : "never",
          state: daysSinceChange > STALE_DAYS ? "stale" : "healthy",
        },
        { label: "Path", value: root },
        ...(corpus.truncated ? [{ label: "Scan", value: "TRUNCATED", state: "warning" as const }] : []),
      ];

      const recent = [...corpus.docs].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 15);

      const items: Item[] = [
        ...[...sections.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, s]) => ({
            id: `section:${name}`,
            label: name,
            subtitle: `${formatBytes(s.bytes)} • newest ${Math.floor((now - s.newest) / DAY_MS)}d ago`,
            value: s.count,
            state: (s.count === 0 ? "empty" : "healthy") as "empty" | "healthy",
            group: "sections",
          })),
        ...recent.map((d) => ({
          id: `doc:${d.rel}`,
          label: d.slug,
          subtitle: `${d.section} • ${formatBytes(d.size)}`,
          value: `${Math.floor((now - d.mtimeMs) / DAY_MS)}d ago`,
          state: "healthy" as const,
          group: "recent",
        })),
      ];

      const state: VisualQueryResult["state"] =
        corpus.docs.length === 0 ? "empty" : daysSinceChange > STALE_DAYS ? "stale" : "healthy";

      return {
        title: "Wiki — Markdown Corpus",
        subtitle: `${corpus.docs.length} documents • ${sections.size} sections • ${formatBytes(corpus.totalBytes)}`,
        state,
        freshness: makeFreshness(this.name, root, start),
        metrics,
        items,
        summary:
          `${corpus.docs.length} markdown documents across ${sections.size} sections under ${root}, ` +
          `${formatBytes(corpus.totalBytes)} on disk. ${changed7d.length} changed in the last 7 days; ` +
          `most recent change ${Number.isFinite(daysSinceChange) ? `${daysSinceChange} day(s) ago` : "unknown"}. ` +
          `Counts come from the filesystem — there is no search index or embedding store to report.`,
      };
    } catch (err) {
      // A missing or unreadable directory is a configuration fact, not an
      // outage, so say which path failed rather than rendering "offline".
      const c = classifyError(err);
      return {
        title: "Wiki — Markdown Corpus",
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

const adapter = new WikiAdapter();
export { adapter as default };
