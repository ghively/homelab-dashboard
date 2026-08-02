// Caddy adapter — reverse proxy routes, TLS certs, upstream health.
// Host: gh-vps (Tailscale 100.92.162.32)
// API: Admin API (default 2019)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, failureResult, makeFreshness } from "@/lib/adapter-http";

const CADDY_ADMIN_URL =
  process.env.CADDY_ADMIN_URL || "http://100.92.162.32:2019";

class CaddyAdapter implements DataAdapter {
  readonly name = "caddy";
  readonly description = "Caddy reverse proxy — routes, TLS certs, upstream health.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${CADDY_ADMIN_URL}/version`, {
        signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
      });
    } catch {
      // offline
    }
    return makeFreshness("caddy", CADDY_ADMIN_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const start = Date.now();
    try {
      // /config/ is the probe, not /version. Caddy's admin API has no /version
      // route — the stock build answers 404 — so requiring it to be ok() meant
      // a perfectly healthy Caddy always rendered "Admin API unreachable".
      // /reverse_proxy/upstreams is the one endpoint that reports real health
      // (per-upstream failure counters), so it carries the state.
      const [configRes, upstreamsRes] = await Promise.all([
        fetch(`${CADDY_ADMIN_URL}/config/`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) }),
        fetch(`${CADDY_ADMIN_URL}/reverse_proxy/upstreams`, {
          signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        }),
      ]);

      if (!configRes.ok) throw new AdapterHttpError(`${CADDY_ADMIN_URL}/config/`, configRes.status);

      const config = (await configRes.json()) as Record<string, unknown>;
      const upstreams = upstreamsRes.ok
        ? ((await upstreamsRes.json()) as Array<{ address: string; num_requests: number; fails: number }>)
        : [];
      const failingUpstreams = upstreams.filter((u) => u.fails > 0);

      // Parse server routes from config
      const servers: Array<{ name: string; listen: string[]; routes: number; tls: number }> = [];
      const httpApps = (config as { apps?: { http?: { servers?: Record<string, unknown> } } }).apps?.http?.servers;
      if (httpApps && typeof httpApps === "object") {
        for (const [serverName, serverData] of Object.entries(httpApps)) {
          const sd = serverData as {
            listen?: string[];
            routes?: unknown[];
            tls_connection_policies?: unknown[];
          };
          servers.push({
            name: serverName,
            listen: sd.listen ?? [],
            routes: sd.routes?.length ?? 0,
            tls: sd.tls_connection_policies?.length ?? 0,
          });
        }
      }

      const totalRoutes = servers.reduce((a, s) => a + s.routes, 0);
      const totalTLS = servers.reduce((a, s) => a + s.tls, 0);

      return {
        title: "Caddy — Reverse Proxy & TLS",
        subtitle: `${servers.length} servers • ${totalRoutes} routes • ${upstreams.length} upstreams`,
        state: failingUpstreams.length > 0 ? "warning" : "healthy",
        freshness: makeFreshness("caddy", CADDY_ADMIN_URL, start),
        metrics: [
          { label: "Servers", value: servers.length, state: "healthy" },
          { label: "Routes", value: totalRoutes, state: "healthy" },
          { label: "TLS Policies", value: totalTLS, state: "healthy" },
          { label: "Upstreams", value: upstreams.length, state: "healthy" },
          {
            label: "Failing Upstreams",
            value: failingUpstreams.length,
            state: failingUpstreams.length > 0 ? "warning" : "healthy",
          },
        ],
        items: [
          ...servers.map((s) => ({
            id: s.name,
            label: s.name,
            subtitle: `${s.listen.join(", ")} • ${s.routes} routes • ${s.tls} TLS`,
            value: s.routes,
            state: "healthy" as const,
            group: "servers",
          })),
          ...upstreams.map((u) => ({
            id: `upstream:${u.address}`,
            label: u.address,
            subtitle: `${u.num_requests} in flight • ${u.fails} fails`,
            value: u.fails,
            state: u.fails > 0 ? ("warning" as const) : ("healthy" as const),
            group: "upstreams",
          })),
        ],
        summary: `${servers.length} servers, ${totalRoutes} routes, ${upstreams.length} upstreams (${failingUpstreams.length} failing)`,
      };
    } catch (err) {
      return failureResult("caddy", "Caddy Reverse Proxy", CADDY_ADMIN_URL, err, start);
    }
  }
}

const adapter = new CaddyAdapter();
export { adapter as default };
