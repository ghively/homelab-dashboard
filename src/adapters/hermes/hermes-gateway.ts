// Hermes gateway adapter.
//
// Two measurements, both real:
//   1. The gateway's own HTTP surface answers /health (it does not answer "/",
//      which is why the previous version reported "Responded 404" under a
//      healthy badge — it was probing a route that does not exist).
//   2. When HERMES_DASHBOARD_URL is also set, the dashboard's /api/status is
//      the only place the gateway's *process* state and per-platform
//      connection states are published, so the panel is enriched from there.
//
// The enrichment is strictly additive: if the dashboard is not configured or
// not answering, the panel still reports the probe result rather than
// inventing platform counts.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, fetchJson, makeFreshness } from "@/lib/adapter-http";
import { probeHermesEndpoint } from "./probe";

const HERMES_GATEWAY_URL = process.env.HERMES_GATEWAY_URL || "";
const HERMES_DASHBOARD_URL = process.env.HERMES_DASHBOARD_URL || "";

interface GatewayStatus {
  gateway_running?: boolean;
  gateway_state?: string;
  gateway_exit_reason?: string | null;
  gateway_platforms?: Record<string, { state?: string; error_message?: string | null }>;
  active_agents?: number;
}

class HermesGatewayAdapter implements DataAdapter {
  readonly name = "hermes-gateway";
  readonly description = "Hermes gateway — reachability and platform connection state.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, HERMES_GATEWAY_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const probe = await probeHermesEndpoint({
      adapter: this.name,
      title: "Hermes gateway",
      baseUrl: HERMES_GATEWAY_URL,
      healthPath: "/health",
      envVar: "HERMES_GATEWAY_URL",
    });

    if (!HERMES_DASHBOARD_URL || probe.state === "empty") return probe;

    // Best-effort enrichment on a shorter budget — this must never be the
    // reason the panel goes slow or offline.
    let status: GatewayStatus | null = null;
    try {
      status = await fetchJson<GatewayStatus>(
        `${HERMES_DASHBOARD_URL.replace(/\/$/, "")}/api/status`,
        {},
        ADAPTER_FANOUT_TIMEOUT_MS,
      );
    } catch {
      return probe;
    }

    const platforms = Object.entries(status.gateway_platforms ?? {});
    const connected = platforms.filter(([, p]) => (p.state ?? "").toLowerCase() === "connected").length;
    const running = status.gateway_running === true && status.gateway_state === "running";

    return {
      ...probe,
      state: !running ? "critical" : connected < platforms.length ? "warning" : probe.state,
      subtitle: `gateway ${status.gateway_state ?? "unknown"} • ${connected}/${platforms.length} platforms connected`,
      metrics: [
        ...(probe.metrics ?? []),
        { label: "Gateway State", value: status.gateway_state ?? "unknown", state: running ? "healthy" : "critical" },
        {
          label: "Platforms",
          value: `${connected}/${platforms.length}`,
          state: platforms.length > 0 && connected === platforms.length ? "healthy" : "warning",
        },
        { label: "Active Agents", value: status.active_agents ?? 0 },
      ],
      items: platforms.map(([platform, p]) => ({
        id: `platform:${platform}`,
        label: platform,
        subtitle: p.error_message ? `${p.state} — ${p.error_message}` : (p.state ?? "unknown"),
        value: p.state ?? "unknown",
        state: ((p.state ?? "").toLowerCase() === "connected" ? "healthy" : "offline") as "healthy" | "offline",
      })),
      summary: `${probe.summary} · gateway ${status.gateway_state ?? "unknown"}, ${connected}/${platforms.length} platforms connected.`,
    };
  }
}

const adapter = new HermesGatewayAdapter();
export { adapter as default };
