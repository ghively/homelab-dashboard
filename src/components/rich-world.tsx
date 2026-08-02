"use client";

/**
 * Renders a world's adapter results as a real generated-style dashboard.
 *
 * The rich visual components (ArtworkWall, LineChart, Capacity, PlaybackSessions,
 * …) call useTriggerAction(), which throws outside a <Renderer>, so they cannot
 * be invoked directly. Instead this feeds the Renderer a deterministic program
 * built from the world's results, with an inline toolProvider that serves the
 * ALREADY-FETCHED data back for each Query(adapter) — no re-fetch, no data in
 * the program text. Drill-down survives: an action message is mapped back to the
 * full entity via the label index and opened in the existing drawer.
 */

import { useMemo } from "react";
import { Renderer } from "@openuidev/react-lang";
import { library } from "@/lib/library";
import {
  buildWorldProgram,
  buildEntityIndex,
  labelFromAction,
  type WorldEntry,
} from "@/lib/panel-program";

export function RichWorld({
  entries,
  title,
  subtitle,
  onEntityClick,
}: {
  entries: WorldEntry[];
  title: string;
  subtitle: string;
  onEntityClick: (
    entity: Record<string, unknown>,
    adapter: string,
    source?: "live" | "fixture" | "offline",
  ) => void;
}) {
  // Empty grid title/subtitle: the world page's Hero already names the world,
  // so a DashboardGrid heading would just repeat it. `title`/`subtitle` are kept
  // on the props for the a11y label below and future non-Hero callers.
  const program = useMemo(
    () => buildWorldProgram("", "", entries),
    [entries],
  );

  // Query(adapter) resolves to this adapter's already-fetched result. Built
  // fresh whenever the entries change so a world re-fetch re-renders with new
  // data. The args are ignored — the world page fetched the default view.
  const toolProvider = useMemo(() => {
    const provider: Record<string, () => Promise<unknown>> = {};
    for (const { adapter, result } of entries) {
      provider[adapter] = async () => result;
    }
    return provider;
  }, [entries]);

  const index = useMemo(() => buildEntityIndex(entries), [entries]);

  return (
    <div
      className="dash-rich-world chat-rendered"
      role="region"
      aria-label={subtitle ? `${title} — ${subtitle}` : title}
    >
      <Renderer
        response={program}
        library={library}
        toolProvider={toolProvider}
        isStreaming={false}
        onAction={(event: { humanFriendlyMessage: string }) => {
          const hit = index.get(labelFromAction(event.humanFriendlyMessage));
          if (hit) onEntityClick(hit.item, hit.adapter, hit.source);
        }}
      />
    </div>
  );
}
