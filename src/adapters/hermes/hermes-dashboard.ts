// Hermes dashboard adapter — reads the dashboard's own status API.
//
// The dashboard at :9119 exposes GET /api/status without auth, and it is the
// richest observable surface Hermes has: version, config version, gateway
// state, per-platform connection state, active agents and sessions, and a
// components block with per-component status. The previous version fetched the
// bare origin (which 302s to the login page) and reported "Responded 302" with
// a healthy badge — measured, but measuring the wrong thing.
//
// Every value below still comes from that payload. Do not reintroduce the
// hardcoded session/tool-invocation counts this module used to return.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { failureResult, fetchJson, makeFreshness } from "@/lib/adapter-http";

const HERMES_DASHBOARD_URL = process.env.HERMES_DASHBOARD_URL || "";

interface PlatformState {
  state?: string;
  error_code?: string | null;
  error_message?: string | null;
  updated_at?: string;
}

interface HermesStatus {
  version?: string;
  release_date?: string;
  config_version?: number;
  latest_config_version?: number;
  gateway_running?: boolean;
  gateway_state?: string;
  gateway_platforms?: Record<string, PlatformState>;
  gateway_exit_reason?: string | null;
  active_agents?: number;
  active_sessions?: number;
  components?: Record<string, { status?: string; state?: string }>;
}

function platformState(p: PlatformState): "healthy" | "warning" | "offline" {
  const s = (p.state ?? "").toLowerCase();
  if (s === "connected" || s === "running" || s === "ok") return "healthy";
  if (s === "connecting" || s === "starting" || s === "degraded") return "warning";
  return "offline";
}

class HermesDashboardAdapter implements DataAdapter {
  readonly name = "hermes-dashboard";
  readonly description = "Hermes dashboard — gateway state, platforms, sessions.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, HERMES_DASHBOARD_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    if (!HERMES_DASHBOARD_URL) {
      return {
        title: "Hermes dashboard",
        subtitle: "Endpoint not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set HERMES_DASHBOARD_URL to connect this service.",
      };
    }

    const url = `${HERMES_DASHBOARD_URL.replace(/\/$/, "")}/api/status`;
    const start = Date.now();
    try {
      const status = await fetchJson<HermesStatus>(url);

      const platforms = Object.entries(status.gateway_platforms ?? {});
      const connected = platforms.filter(([, p]) => platformState(p) === "healthy").length;
      const gatewayUp = status.gateway_running === true && status.gateway_state === "running";
      const configBehind =
        status.config_version != null &&
        status.latest_config_version != null &&
        status.config_version < status.latest_config_version;

      const metrics: Metric[] = [
        { label: "Gateway", value: status.gateway_state ?? "unknown", state: gatewayUp ? "healthy" : "critical" },
        {
          label: "Platforms",
          value: `${connected}/${platforms.length}`,
          state: platforms.length > 0 && connected === platforms.length ? "healthy" : "warning",
        },
        { label: "Active Agents", value: status.active_agents ?? 0 },
        { label: "Active Sessions", value: status.active_sessions ?? 0 },
        { label: "Version", value: status.version ?? "unknown" },
        {
          label: "Config Version",
          value: status.config_version ?? 0,
          state: configBehind ? "warning" : "healthy",
        },
      ];

      const items: Item[] = [
        ...platforms.map(([platform, p]) => ({
          id: `platform:${platform}`,
          label: platform,
          subtitle: p.error_message ? `${p.state} — ${p.error_message}` : (p.state ?? "unknown"),
          value: p.state ?? "unknown",
          state: platformState(p),
          group: "platforms",
        })),
        ...Object.entries(status.components ?? {}).map(([component, c]) => ({
          id: `component:${component}`,
          label: component,
          subtitle: c.state ? `${c.status} — ${c.state}` : (c.status ?? "unknown"),
          value: c.status ?? "unknown",
          state: (c.status === "ok" ? "healthy" : "warning") as "healthy" | "warning",
          group: "components",
        })),
      ];

      const state: VisualQueryResult["state"] = !gatewayUp
        ? "critical"
        : connected < platforms.length || configBehind
          ? "warning"
          : "healthy";

      return {
        title: "Hermes dashboard",
        subtitle: `v${status.version ?? "?"} • gateway ${status.gateway_state ?? "?"} • ${connected}/${platforms.length} platforms connected`,
        state,
        freshness: makeFreshness(this.name, url, start),
        metrics,
        items,
        summary: `Hermes ${status.version ?? "?"} (${status.release_date ?? "?"}): gateway ${status.gateway_state ?? "?"}, ${connected}/${platforms.length} platforms connected, ${status.active_sessions ?? 0} active sessions.`,
      };
    } catch (err) {
      return failureResult(this.name, "Hermes dashboard", url, err, start);
    }
  }
}

const adapter = new HermesDashboardAdapter();
export { adapter as default };
