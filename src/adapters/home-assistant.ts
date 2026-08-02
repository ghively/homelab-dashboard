// Home Assistant adapter — entity registry, availability, automations.
//
// Every value comes from the Home Assistant REST API on the configured
// instance:
//   GET /api/states  → every entity and its current state
//   GET /api/config  → version, location name, loaded integrations
//
// Availability is the state driver. An entity sitting at `unavailable` or
// `unknown` is a device that has fallen off the network, and counting them is
// the one thing this panel can say that a glance at the HA dashboard cannot.
//
// The previous version of this file called /api/devices and /api/areas, which
// are not REST endpoints (they are websocket commands) — it could never have
// returned real device or area counts. Those metrics are gone rather than
// guessed.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import {
  HA_TOKEN_ENV,
  HA_URL_ENV,
  haBaseUrl,
  haConfig,
  haDeniedResult,
  haStates,
  haToken,
  probeUnauthorized,
  type HaEntity,
} from "./home/ha-client";

/** Entity-id prefixes worth a headline count, in display order. */
const DOMAINS: Array<[label: string, prefix: string]> = [
  ["Lights", "light."],
  ["Switches", "switch."],
  ["Sensors", "sensor."],
  ["Binary Sensors", "binary_sensor."],
  ["Climate", "climate."],
  ["Media Players", "media_player."],
  ["Automations", "automation."],
  ["Scenes", "scene."],
];

const DEAD_STATES = new Set(["unavailable", "unknown"]);

function friendlyName(e: HaEntity): string {
  const n = e.attributes?.friendly_name;
  return typeof n === "string" && n ? n : e.entity_id;
}

export class HomeAssistantAdapter implements DataAdapter {
  readonly name = "home-assistant";
  readonly description = "Home Assistant — entities, availability, automations.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, haBaseUrl() || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const base = haBaseUrl();
    if (!base) return notConfiguredResult(this.name, "Home Assistant", HA_URL_ENV);

    const start = Date.now();

    // No token is not "not configured" — the instance is deployed and the URL
    // is known. Prove it is up, then say plainly what is missing.
    if (!haToken()) {
      try {
        const status = await probeUnauthorized(base);
        return haDeniedResult(this.name, "Home Assistant", base, status, start);
      } catch (err) {
        return failureResult(this.name, "Home Assistant", base, err, start);
      }
    }

    try {
      const entities = await haStates(base);
      const config = await haConfig(base, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null);

      const dead = entities.filter((e) => DEAD_STATES.has((e.state ?? "").toLowerCase()));
      const automationsOn = entities.filter(
        (e) => e.entity_id.startsWith("automation.") && e.state === "on",
      ).length;

      const metrics: Metric[] = [
        { label: "Entities", value: entities.length },
        {
          label: "Unavailable",
          value: dead.length,
          state: dead.length > 0 ? "warning" : "healthy",
        },
        ...DOMAINS.map(([label, prefix]) => ({
          label,
          value: entities.filter((e) => e.entity_id.startsWith(prefix)).length,
        })),
        { label: "Automations On", value: automationsOn },
        { label: "Version", value: config?.version ?? "unknown" },
        ...(config?.location_name ? [{ label: "Location", value: config.location_name }] : []),
      ];

      // Unavailable entities first: they are the only rows that need action.
      const items: Item[] = [
        ...dead.slice(0, 25).map((e) => ({
          id: `dead:${e.entity_id}`,
          label: friendlyName(e),
          subtitle: e.entity_id,
          value: e.state ?? "unavailable",
          state: "warning" as const,
          group: "unavailable",
        })),
        ...entities
          .filter((e) => e.entity_id.startsWith("automation."))
          .slice(0, 25)
          .map((e) => ({
            id: `automation:${e.entity_id}`,
            label: friendlyName(e),
            subtitle: e.entity_id,
            value: e.state ?? "unknown",
            state: (e.state === "on" ? "healthy" : "empty") as "healthy" | "empty",
            group: "automations",
          })),
      ];

      const state: VisualQueryResult["state"] =
        entities.length === 0 ? "empty" : dead.length > 0 ? "warning" : "healthy";

      return {
        title: "Home Assistant — Automation Hub",
        subtitle: `${entities.length} entities • ${dead.length} unavailable • HA ${config?.version ?? "?"}`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary:
          `${entities.length} entities reported by Home Assistant ${config?.version ?? ""} at ${base}; ` +
          `${dead.length} unavailable/unknown, ${automationsOn} automations enabled.`,
      };
    } catch (err) {
      return failureResult(this.name, "Home Assistant", base, err, start);
    }
  }
}

export { HA_TOKEN_ENV, HA_URL_ENV };

const adapter = new HomeAssistantAdapter();
export { adapter as default };
