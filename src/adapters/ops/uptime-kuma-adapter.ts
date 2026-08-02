// Uptime Kuma adapter — monitor up/down counts.
//
// Uptime Kuma has no anonymous read API. The one machine-readable surface is
// /metrics, guarded by HTTP Basic with an empty username and an API key as the
// password. Without UPTIME_KUMA_API_KEY the panel reports `denied` and names
// the missing key — which is the honest outcome, and materially more useful
// than a green badge derived from the login page answering 302.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { failureResult, fetchText, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import { parsePromText } from "./prom-text";

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL || "";
const UPTIME_KUMA_API_KEY = process.env.UPTIME_KUMA_API_KEY || "";

class UptimeKumaAdapter implements DataAdapter {
  readonly name = "uptime-kuma";
  readonly description = "Uptime Kuma — monitor up/down counts.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, UPTIME_KUMA_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!UPTIME_KUMA_URL) {
      return notConfiguredResult(this.name, "Uptime Kuma", "UPTIME_KUMA_URL");
    }

    const base = UPTIME_KUMA_URL.replace(/\/$/, "");
    const start = Date.now();

    if (!UPTIME_KUMA_API_KEY) {
      // Confirm the service is actually there before reporting `denied`, so
      // "no key" and "no server" stay distinguishable.
      try {
        await fetchText(`${base}/api/entry-page`);
      } catch (err) {
        return failureResult(this.name, "Uptime Kuma", base, err, start);
      }
      return {
        title: "Uptime Kuma",
        subtitle: "Reachable, but /metrics needs an API key",
        state: "denied",
        freshness: makeFreshness(this.name, base, start),
        metrics: [
          { label: "Service", value: "REACHABLE", state: "healthy" },
          { label: "Monitors", value: "unreadable", state: "denied" },
        ],
        summary:
          "Uptime Kuma is answering, but its only machine-readable endpoint (/metrics) requires HTTP Basic with an API key. Set UPTIME_KUMA_API_KEY to read monitor state.",
      };
    }

    try {
      const auth = Buffer.from(`:${UPTIME_KUMA_API_KEY}`).toString("base64");
      const body = await fetchText(`${base}/metrics`, { headers: { Authorization: `Basic ${auth}` } });
      const samples = parsePromText(body).filter((s) => s.name === "monitor_status");

      const up = samples.filter((s) => s.value === 1);
      const down = samples.filter((s) => s.value === 0);

      const metrics: Metric[] = [
        { label: "Monitors Up", value: `${up.length}/${samples.length}`, state: down.length ? "warning" : "healthy" },
        { label: "Down", value: down.length, state: down.length ? "critical" : "healthy" },
      ];

      const items: Item[] = samples.map((s, i) => ({
        id: `monitor:${s.labels.monitor_name ?? i}`,
        label: s.labels.monitor_name ?? `monitor ${i}`,
        subtitle: s.labels.monitor_url ?? s.labels.monitor_type ?? "",
        value: s.value === 1 ? "up" : "down",
        state: (s.value === 1 ? "healthy" : "critical") as "healthy" | "critical",
      }));

      return {
        title: "Uptime Kuma — Monitors",
        subtitle: `${up.length}/${samples.length} monitors up`,
        state: down.length ? "critical" : "healthy",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `${up.length} of ${samples.length} monitors up, ${down.length} down.`,
      };
    } catch (err) {
      return failureResult(this.name, "Uptime Kuma", base, err, start);
    }
  }
}

const adapter = new UptimeKumaAdapter();
export { adapter as default };
