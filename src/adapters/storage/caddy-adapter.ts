// Caddy adapter — reverse proxy routes, TLS certs, upstream health.
// Host: gh-vps (Tailscale 100.92.162.32)
// API: Admin API (default 2019)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const CADDY_ADMIN_URL =
  process.env.CADDY_ADMIN_URL || "http://100.92.162.32:2019";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "caddy",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class CaddyAdapter implements DataAdapter {
  readonly name = "caddy";
  readonly description = "Caddy reverse proxy — routes, TLS certs, upstream health.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${CADDY_ADMIN_URL}/version`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return makeFreshness(CADDY_ADMIN_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const [versionRes, configRes] = await Promise.all([
        fetch(`${CADDY_ADMIN_URL}/version`, { signal: AbortSignal.timeout(8000) }),
        fetch(`${CADDY_ADMIN_URL}/config/`, { signal: AbortSignal.timeout(8000) }),
      ]);

      if (!versionRes.ok) throw new Error(`HTTP ${versionRes.status}`);

      const versionData = (await versionRes.json()) as { version?: string };
      const config = configRes.ok ? ((await configRes.json()) as Record<string, unknown>) : {};

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
        subtitle: `v${versionData.version ?? "unknown"} • ${servers.length} servers • ${totalRoutes} routes`,
        state: "healthy",
        freshness: makeFreshness(CADDY_ADMIN_URL),
        metrics: [
          { label: "Version", value: versionData.version ?? "unknown" },
          { label: "Servers", value: servers.length, state: "healthy" },
          { label: "Routes", value: totalRoutes, state: "healthy" },
          { label: "TLS Policies", value: totalTLS, state: "healthy" },
        ],
        items: servers.map((s) => ({
          id: s.name,
          label: s.name,
          subtitle: `${s.listen.join(", ")} • ${s.routes} routes • ${s.tls} TLS`,
          value: s.routes,
          state: "healthy",
          group: "servers",
        })),
      };
    } catch {
      return {
        title: "Caddy Reverse Proxy",
        subtitle: "Admin API unreachable",
        state: "offline",
        freshness: makeFreshness(CADDY_ADMIN_URL),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new CaddyAdapter();
export { adapter as default };
