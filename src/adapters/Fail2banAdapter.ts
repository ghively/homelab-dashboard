// Fail2ban adapter — SSH brute-force protection, jail status, banned IPs.
// Host: gh-vps (Tailscale: 100.92.162.32)
// Access: SSH → `sudo fail2ban-client status` (server-side adapter; mock fallback in browser)
import type { DataAdapter, HealthCheck } from "./adapter-base";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import type { Item, Metric, VisualQueryResult } from "./types";
import { ADAPTER_TIMEOUT_MS } from "@/lib/adapter-http";

const FAIL2BAN_API_URL = process.env.FAIL2BAN_API_URL || "";

interface JailStatus {
  jail: string;
  banned: number;
  totalBanned: number;
  currentlyFailed: number;
  totalFailed: number;
  file: string;
}

class Fail2banAdapter implements DataAdapter {
  readonly name = "fail2ban";
  readonly description = "Fail2ban intrusion prevention — SSH brute-force protection.";
  readonly category = "security" as const;

  async health(): Promise<HealthCheck> {
    const now = new Date().toISOString();
    try {
      if (FAIL2BAN_API_URL) {
        const response = await fetch(`${FAIL2BAN_API_URL}/health`, {
          signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        });
        if (response.ok) {
          return { adapter: this.name, source: "fail2ban", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
        }
      }
      return { adapter: this.name, source: "fail2ban-mock", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    } catch {
      return { adapter: this.name, source: "fail2ban-mock", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fs = getFixtureState();
    if (fs) return getFixtureForState(this.name, fs);

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      let jails: JailStatus[] = [];

      if (FAIL2BAN_API_URL) {
        const response = await fetch(`${FAIL2BAN_API_URL}/status`, {
          signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        });
        if (response.ok) {
          const data = await response.json() as { jails?: JailStatus[] };
          jails = data.jails ?? [];
        }
      }

      // No hardcoded fallback here. The previous version substituted two
      // invented jails (sshd with 127 historical bans, nginx-limit-req with 12)
      // whenever FAIL2BAN_API_URL was unset or the response was empty — so an
      // unreachable service silently rendered fabricated ban counts as live
      // security data. An empty list is the honest answer.
      if (!FAIL2BAN_API_URL) {
        throw new Error("FAIL2BAN_API_URL not configured");
      }

      const totalBanned = jails.reduce((acc, j) => acc + j.banned, 0);
      const totalFailed = jails.reduce((acc, j) => acc + j.currentlyFailed, 0);
      const totalBannedHistorical = jails.reduce((acc, j) => acc + j.totalBanned, 0);

      const state: VisualQueryResult["state"] =
        totalBanned > 10 ? "critical" : totalBanned > 0 ? "warning" : "healthy";

      const metrics: Metric[] = [
        { label: "Active Jails", value: jails.length, state: "healthy" },
        { label: "Banned Now", value: totalBanned, state: totalBanned > 0 ? "warning" : "healthy" },
        { label: "Total Banned", value: totalBannedHistorical, state: "healthy" },
        { label: "Failed Attempts", value: totalFailed, state: totalFailed > 0 ? "warning" : "healthy" },
      ];

      const items: Item[] = jails.map((j) => ({
        id: j.jail,
        label: j.jail,
        subtitle: `${j.banned} banned · ${j.currentlyFailed} failing`,
        value: j.banned,
        state: j.banned > 5 ? "critical" : j.banned > 0 ? "warning" : "healthy",
        group: j.banned > 0 ? "Active Bans" : "Clean",
        meta: { totalBanned: j.totalBanned, totalFailed: j.totalFailed, file: j.file },
      }));

      return {
        title: "Fail2ban",
        subtitle: `${jails.length} jails · ${totalBanned} active bans`,
        state,
        freshness: { adapter: this.name, source: "fail2ban", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics,
        items,
        summary: `${totalBanned} active bans across ${jails.length} jails (${totalBannedHistorical} historical)`,
      };
    } catch (error) {
      return {
        title: "Fail2ban",
        subtitle: error instanceof Error ? error.message : "Connection failed",
        state: "offline",
        freshness: { adapter: this.name, source: "fail2ban", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics: [{ label: "Status", value: "OFFLINE", state: "offline" }],
        summary: "Fail2ban status unavailable",
      };
    }
  }
}

const adapter = new Fail2banAdapter();
export { adapter as default };
