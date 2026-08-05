/**
 * Deterministic program builder for the static world pages.
 *
 * The sidebar world pages used to render every adapter result as plain text
 * rows — ignoring the posters, series and events the adapters already return,
 * and never touching the rich visual components that only the generated
 * dashboards used. This builds, from a world's already-fetched results, the
 * same kind of program the chat generates: each adapter's result is matched to
 * the best component by DATA SHAPE, and the whole thing renders through the
 * real <Renderer>. The static pages become pre-authored dashboards.
 *
 * Only safe tokens ever reach the DSL — adapter names (a fixed registry set),
 * component names, and JSON-escaped title strings. Panel DATA never goes into
 * the program text: it flows in through an inline toolProvider keyed by adapter
 * name, so there is nothing to serialize and nothing to escape on the hot path.
 */

import type { VisualQueryResult } from "@/adapters/types";

export interface WorldEntry {
  adapter: string;
  result: VisualQueryResult;
}

/** A DSL string literal that cannot break the program, whatever the label holds. */
function lit(s: string | undefined): string {
  return JSON.stringify(s ?? "");
}

/**
 * Which components best present one adapter result, in render order.
 *
 * A result commonly carries both KPIs and a collection (Emby: counts + posters),
 * so this returns the MetricStrip for the numbers AND the shape-appropriate
 * component for the collection — a panel that leads with the summary and shows
 * the detail, rather than one or the other.
 */
export function pickPanels(result: VisualQueryResult): string[] {
  const panels: string[] = [];
  const items = result.items ?? [];
  const hasImages = items.some((i) => i.image);
  // Playback rows carry a mode/pause in meta; those belong in PlaybackSessions,
  // which draws the now-playing treatment rather than a poster grid.
  const isPlayback = items.some(
    (i) => i.meta && ("isPaused" in i.meta || "paused" in i.meta || "mode" in i.meta),
  );
  const series = result.series ?? [];
  const events = result.events ?? [];
  const nodes = result.nodes ?? [];
  const metrics = result.metrics ?? [];

  if (metrics.length) panels.push("MetricStrip");

  if (items.length) {
    if (isPlayback) panels.push("PlaybackSessions");
    else if (hasImages) panels.push("ArtworkWall");
    // A ranked list — every row carries a numeric value — reads best as bars.
    else if (items.every((i) => typeof i.value === "number") && items.length >= 2)
      panels.push("BarRank");
    else panels.push("VisualTable");
  }

  if (series.length === 1) panels.push("LineChart");
  else if (series.length >= 2) panels.push("MultiLine");

  if (events.length) panels.push("Timeline");
  if (nodes.length) panels.push("NodeGraph");

  // A result with nothing but a title/state still deserves a panel, so the
  // world shows the service exists and what state it is in.
  if (!panels.length) panels.push("MetricStrip");
  return panels;
}

/**
 * Which Query-result field(s) each component in `pickPanels`'s output set
 * consumes, in the order they follow `state` in the component's positional
 * signature. NodeGraph is the only component pickPanels emits that takes two
 * data fields.
 */
const DATA_FIELDS: Record<string, string[]> = {
  MetricStrip: ["metrics"],
  PlaybackSessions: ["items"],
  ArtworkWall: ["items"],
  BarRank: ["items"],
  VisualTable: ["items"],
  LineChart: ["series"],
  MultiLine: ["series"],
  Timeline: ["events"],
  NodeGraph: ["nodes", "edges"],
};

/**
 * The renderer binds a component call's arguments POSITIONALLY — every data
 * component's signature is (surfaceStyle, span, rowSpan, title, subtitle,
 * state, ...data). Passing the whole Query result as a single argument binds
 * it to surfaceStyle and leaves the data fields undefined, so every panel
 * renders its frame but nothing inside (see src/lib/prompt-options.ts, which
 * hit and fixed the identical bug in the chat-generation prompt).
 */
function panelCall(component: string, q: string): string {
  const fields = DATA_FIELDS[component] ?? [];
  const args = [
    "null", "null", "null",
    `${q}.title`, `${q}.subtitle`, `${q}.state`,
    ...fields.map((f) => `${q}.${f}`),
  ];
  return `${component}(${args.join(", ")})`;
}

/**
 * Build the full program for one world from its (already filtered) results.
 * Returns the DSL source; render it through <Renderer> with an inline
 * toolProvider that returns each adapter's result for `Query(adapter)`.
 */
export function buildWorldProgram(
  title: string,
  subtitle: string,
  entries: WorldEntry[],
): string {
  const lines: string[] = [];
  const childVars: string[] = [];

  entries.forEach((entry, i) => {
    const q = `q${i}`;
    // The inline provider ignores args and returns this adapter's result, so a
    // bare Query(name) is all that's needed. The JSON fallback keeps a panel
    // from rendering nothing if the provider ever misses.
    lines.push(`${q} = Query(${lit(entry.adapter)}, {}, {state: "empty", title: ${lit(entry.result.title)}})`);
    pickPanels(entry.result).forEach((component, j) => {
      const v = `p${i}_${j}`;
      lines.push(`${v} = ${panelCall(component, q)}`);
      childVars.push(v);
    });
  });

  lines.push(
    `root = DashboardGrid(${lit(title)}, ${lit(subtitle)}, null, null, null, null, [${childVars.join(", ")}])`,
  );
  return lines.join("\n");
}

/**
 * Index every collection row by a normalized label, so a drill-down action —
 * which arrives as a "Show details for <label>" message from the component —
 * can be mapped back to the full entity (with its meta) and adapter/source.
 */
export interface EntityHit {
  item: Record<string, unknown>;
  adapter: string;
  source?: "live" | "fixture" | "offline";
}

export function buildEntityIndex(entries: WorldEntry[]): Map<string, EntityHit> {
  const index = new Map<string, EntityHit>();
  for (const { adapter, result } of entries) {
    const source = result.source as EntityHit["source"];
    for (const collection of [result.items, result.events, result.nodes]) {
      for (const row of collection ?? []) {
        const label = (row as { label?: string; title?: string }).label
          ?? (row as { title?: string }).title;
        if (label) index.set(label.trim().toLowerCase(), { item: row as Record<string, unknown>, adapter, source });
      }
    }
  }
  return index;
}

/** Pull the label back out of a "Show details for <label>" action message. */
export function labelFromAction(message: string): string {
  return message.replace(/^show details for\s*/i, "").trim().toLowerCase();
}
