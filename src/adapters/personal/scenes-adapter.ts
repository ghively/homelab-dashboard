// Scenes adapter — Home Assistant scenes and when they last ran.
//
// A "scene" is not a service; it is a Home Assistant entity domain. So this
// panel reads the same instance the `home-assistant` panel does, filtered to
// scene.* (and script.*, which is where most people's one-button routines
// actually live):
//   GET /api/states → scene.* / script.* entities and their attributes
//
// Home Assistant sets a scene entity's `state` to the ISO timestamp of its
// last activation, so "last run" here is a real recorded value, not an
// inference. Scenes that have never been activated report `unknown` and are
// shown as such rather than being given a plausible date.
//
// Without a token this renders `denied` against a proven-reachable instance —
// see ha-client.ts for why that is the honest outcome rather than "not
// configured".

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { failureResult, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import {
  HA_URL_ENV,
  haBaseUrl,
  haDeniedResult,
  haStates,
  haToken,
  probeUnauthorized,
  type HaEntity,
} from "../home/ha-client";

const DAY_MS = 86_400_000;

function friendlyName(e: HaEntity): string {
  const n = e.attributes?.friendly_name;
  return typeof n === "string" && n ? n : e.entity_id.split(".")[1] ?? e.entity_id;
}

/** Home Assistant stores a scene's last activation in its state field. */
function lastActivated(e: HaEntity): Date | null {
  const raw = e.state;
  if (!raw || raw === "unknown" || raw === "unavailable") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class ScenesAdapter implements DataAdapter {
  readonly name = "scenes";
  readonly description = "Home Assistant scenes and scripts — what they are and when they last ran.";
  readonly category = "personal" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, haBaseUrl() || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const base = haBaseUrl();
    if (!base) return notConfiguredResult(this.name, "Scenes", HA_URL_ENV);

    const start = Date.now();

    if (!haToken()) {
      try {
        const status = await probeUnauthorized(base);
        return haDeniedResult(this.name, "Scenes", base, status, start);
      } catch (err) {
        return failureResult(this.name, "Scenes", base, err, start);
      }
    }

    try {
      const entities = await haStates(base);
      const scenes = entities.filter((e) => e.entity_id.startsWith("scene."));
      const scripts = entities.filter((e) => e.entity_id.startsWith("script."));

      const now = Date.now();
      const activated = scenes
        .map((e) => ({ entity: e, at: lastActivated(e) }))
        .filter((x): x is { entity: HaEntity; at: Date } => x.at !== null)
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      const neverRun = scenes.length - activated.length;
      const runLast7d = activated.filter((x) => now - x.at.getTime() < 7 * DAY_MS).length;
      const scriptsRunning = scripts.filter((e) => e.state === "on").length;

      const metrics: Metric[] = [
        { label: "Scenes", value: scenes.length, state: scenes.length ? "healthy" : "empty" },
        { label: "Scripts", value: scripts.length },
        { label: "Used (7d)", value: runLast7d },
        { label: "Never Activated", value: neverRun, state: neverRun ? "warning" : "healthy" },
        { label: "Scripts Running", value: scriptsRunning },
        {
          label: "Last Activation",
          value: activated[0] ? activated[0].at.toISOString().replace("T", " ").slice(0, 16) : "none",
        },
      ];

      const items: Item[] = [
        ...activated.slice(0, 25).map((x) => ({
          id: `scene:${x.entity.entity_id}`,
          label: friendlyName(x.entity),
          subtitle: x.entity.entity_id,
          value: `${Math.floor((now - x.at.getTime()) / DAY_MS)}d ago`,
          state: "healthy" as const,
          group: "recently used",
        })),
        ...scenes
          .filter((e) => lastActivated(e) === null)
          .slice(0, 25)
          .map((e) => ({
            id: `unused:${e.entity_id}`,
            label: friendlyName(e),
            subtitle: e.entity_id,
            value: "never activated",
            state: "empty" as const,
            group: "never used",
          })),
        ...scripts.slice(0, 20).map((e) => ({
          id: `script:${e.entity_id}`,
          label: friendlyName(e),
          subtitle: e.entity_id,
          value: e.state ?? "unknown",
          state: (e.state === "on" ? "healthy" : "empty") as "healthy" | "empty",
          group: "scripts",
        })),
      ];

      const state: VisualQueryResult["state"] =
        scenes.length === 0 && scripts.length === 0 ? "empty" : "healthy";

      return {
        title: "Scenes — Home Routines",
        subtitle: `${scenes.length} scenes • ${scripts.length} scripts • ${runLast7d} used this week`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary:
          `Home Assistant at ${base} exposes ${scenes.length} scenes and ${scripts.length} scripts. ` +
          `${activated.length} scenes have a recorded activation (${runLast7d} in the last 7 days) and ` +
          `${neverRun} have never been activated.`,
      };
    } catch (err) {
      return failureResult(this.name, "Scenes", base, err, start);
    }
  }
}

const adapter = new ScenesAdapter();
export { adapter as default };
