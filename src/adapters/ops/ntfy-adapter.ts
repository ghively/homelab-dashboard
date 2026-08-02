// ntfy adapter — notification server health and delivery counters.
//
// /v1/health is the health contract ({"healthy":true}); the counters come from
// /metrics when the server has metrics enabled. The counters are optional and
// their absence is reported as absence, not as zero.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, fetchJson, fetchText, makeFreshness } from "@/lib/adapter-http";
import { parsePromText, sumSamples } from "./prom-text";

const NTFY_URL = process.env.NTFY_URL || "";

class NtfyAdapter implements DataAdapter {
  readonly name = "ntfy";
  readonly description = "ntfy — push notification server health and delivery counters.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, NTFY_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!NTFY_URL) {
      return {
        title: "ntfy",
        subtitle: "Not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set NTFY_URL to connect this service.",
      };
    }

    const base = NTFY_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const health = await fetchJson<{ healthy?: boolean }>(`${base}/v1/health`);
      const healthy = health.healthy === true;

      const metricsText = await fetchText(`${base}/metrics`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => "");
      const samples = metricsText ? parsePromText(metricsText) : [];
      const published = sumSamples(samples, "ntfy_messages_published_total");
      const cached = sumSamples(samples, "ntfy_messages_cached_total");
      const subscribers = sumSamples(samples, "ntfy_subscribers_total");

      const metrics: Metric[] = [
        { label: "Health", value: healthy ? "HEALTHY" : "UNHEALTHY", state: healthy ? "healthy" : "critical" },
        ...(metricsText
          ? [
              { label: "Published", value: Math.round(published) },
              { label: "Cached", value: Math.round(cached) },
              { label: "Subscribers", value: Math.round(subscribers) },
            ]
          : [{ label: "Counters", value: "metrics endpoint not exposed", state: "empty" as const }]),
      ];

      return {
        title: "ntfy — Notifications",
        subtitle: healthy ? "Server healthy" : "Server reports unhealthy",
        state: healthy ? "healthy" : "critical",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        summary: healthy
          ? `ntfy healthy${metricsText ? `; ${Math.round(published)} messages published, ${Math.round(subscribers)} subscribers` : " (metrics endpoint not exposed)"}.`
          : "ntfy reported itself unhealthy.",
      };
    } catch (err) {
      return failureResult(this.name, "ntfy", base, err, start);
    }
  }
}

const adapter = new NtfyAdapter();
export { adapter as default };
