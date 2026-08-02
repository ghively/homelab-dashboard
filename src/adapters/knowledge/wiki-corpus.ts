/**
 * Shared reader for the markdown corpus behind the `knowledge` world.
 *
 * There is no wiki *service* on this fleet. What exists is a directory of
 * markdown that Hermes writes and reads — ~5.5 MB across a few hundred files.
 * That is a real data source, and counting it is honest; the thing to avoid is
 * dressing it up as something it is not. The fixture this replaces claimed
 * "FTS + embeddings • 32MB index" for a corpus that has neither a full-text
 * index nor an embedding store, and both adapters below are careful to report
 * only what is on disk.
 *
 * Both `wiki` (what is in the corpus) and `knowledge-graph` (how it links to
 * itself) read through here so they cannot disagree about the same files.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/** Directories that are never part of the corpus. */
const SKIP_DIRS = new Set([".git", "node_modules", ".obsidian", ".trash"]);

/** Walk guard — a runaway symlink loop must not outlive the adapter budget. */
const MAX_FILES = 5000;
const WALK_DEADLINE_MS = 2500;

export interface WikiDoc {
  /** Path relative to the corpus root, e.g. "entities/gh-vps.md". */
  rel: string;
  /** Top-level directory, or "(root)" for files directly in the corpus root. */
  section: string;
  /** Slug used to resolve [[wikilinks]] — the filename without its extension. */
  slug: string;
  size: number;
  mtimeMs: number;
}

export interface WikiCorpus {
  root: string;
  docs: WikiDoc[];
  totalBytes: number;
  /** True when the walk stopped early on MAX_FILES or the deadline. */
  truncated: boolean;
}

async function walk(
  root: string,
  dir: string,
  out: WikiDoc[],
  deadline: number,
): Promise<boolean> {
  if (out.length >= MAX_FILES || Date.now() > deadline) return true;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false; // Unreadable subtree: skip it rather than fail the panel.
  }

  let truncated = false;
  for (const entry of entries) {
    if (out.length >= MAX_FILES || Date.now() > deadline) return true;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      truncated = (await walk(root, full, out, deadline)) || truncated;
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;

    try {
      const s = await stat(full);
      const rel = path.relative(root, full);
      const [head] = rel.split(path.sep);
      out.push({
        rel,
        section: rel.includes(path.sep) ? head : "(root)",
        slug: entry.name.replace(/\.md$/i, ""),
        size: s.size,
        mtimeMs: s.mtimeMs,
      });
    } catch {
      // File vanished between readdir and stat. Not worth reporting.
    }
  }
  return truncated;
}

/** Enumerate every markdown document under `root`. Throws if root is unusable. */
export async function scanCorpus(root: string): Promise<WikiCorpus> {
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error(`${root} is not a directory`);

  const docs: WikiDoc[] = [];
  const truncated = await walk(root, root, docs, Date.now() + WALK_DEADLINE_MS);

  return {
    root,
    docs,
    totalBytes: docs.reduce((n, d) => n + d.size, 0),
    truncated,
  };
}

export interface WikiLink {
  /** Source document, relative path. */
  from: string;
  /** Raw link target as written in the markdown. */
  target: string;
  /** Resolved document (relative path), or null when nothing matches. */
  to: string | null;
  kind: "wikilink" | "markdown";
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
const MDLINK_RE = /\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;

/**
 * Read every document and extract the links it contains.
 *
 * Resolution is deliberately conservative: a [[target]] resolves only when a
 * document's slug or relative path matches exactly, and a relative .md link
 * resolves only when that path exists in the corpus. Anything else is counted
 * as broken rather than guessed at, because an inflated "resolved" number is
 * exactly the kind of quietly-wrong figure this work exists to remove.
 */
export async function readLinks(corpus: WikiCorpus): Promise<WikiLink[]> {
  const bySlug = new Map<string, string>();
  const byRel = new Set<string>();
  for (const d of corpus.docs) {
    byRel.add(d.rel.split(path.sep).join("/"));
    // First writer wins; duplicate slugs across sections stay ambiguous and
    // are simply not double-counted.
    if (!bySlug.has(d.slug.toLowerCase())) bySlug.set(d.slug.toLowerCase(), d.rel);
  }

  const resolve = (from: string, raw: string): string | null => {
    const cleaned = raw.trim().replace(/^\.\//, "");
    const direct = cleaned.endsWith(".md") ? cleaned : `${cleaned}.md`;

    // Relative to the linking document.
    const fromDir = path.dirname(from);
    const joined = path.normalize(path.join(fromDir, direct)).split(path.sep).join("/");
    if (byRel.has(joined)) return joined;

    // Relative to the corpus root.
    const fromRoot = path.normalize(direct).split(path.sep).join("/");
    if (byRel.has(fromRoot)) return fromRoot;

    // Bare slug, the usual [[wikilink]] form.
    const slug = path.basename(cleaned).replace(/\.md$/i, "").toLowerCase();
    return bySlug.get(slug) ?? null;
  };

  const links: WikiLink[] = [];
  const deadline = Date.now() + WALK_DEADLINE_MS;

  for (const doc of corpus.docs) {
    if (Date.now() > deadline) break;
    let text: string;
    try {
      text = await readFile(path.join(corpus.root, doc.rel), "utf8");
    } catch {
      continue;
    }

    for (const m of text.matchAll(WIKILINK_RE)) {
      const target = m[1];
      links.push({ from: doc.rel, target, to: resolve(doc.rel, target), kind: "wikilink" });
    }
    for (const m of text.matchAll(MDLINK_RE)) {
      const target = m[1];
      if (/^[a-z]+:\/\//i.test(target)) continue; // external URL ending in .md
      links.push({ from: doc.rel, target, to: resolve(doc.rel, target), kind: "markdown" });
    }
  }

  return links;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
