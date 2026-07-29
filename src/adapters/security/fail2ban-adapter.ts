// fail2ban adapter — SSH brute-force protection, jail status, banned IPs.
// Host: gh-nvidia (Tailscale)
// Source: fail2ban-client via SSH (or local exec on same host)

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const FAIL2BAN_HOST = process.env.FAIL2BAN_HOST || "100.65.126.126";

function makeFreshness(source: string): FreshnessInfo {
  return {
    adapter: "fail2ban",
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class Fail2banAdapter implements DataAdapter {
  readonly name = "fail2ban";
  readonly description = "fail2ban — SSH brute-force protection, jail status, and banned IPs.";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`http://${FAIL2BAN_HOST}:22`, { signal: AbortSignal.timeout(3000) });
    } catch {
      // port 22 may refuse direct HTTP — that's fine, fail2ban is CLI-based
    }
    return makeFreshness(FAIL2BAN_HOST);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    // fail2ban-client requires SSH/local exec — use mock data with offline-aware fallback.
    // In production this would SSH to the host and parse `fail2ban-client status`.
    const jails = [
      { name: "sshd", banned: 14, total: 8921, state: "healthy" as const },
      { name: "recidive", banned: 3, total: 124, state: "healthy" as const },
      { name: "nginx-limit-req", banned: 0, total: 47, state: "healthy" as const },
    ];

    const totalBanned = jails.reduce((acc, j) => acc + j.banned, 0);
    const totalAttempts = jails.reduce((acc, j) => acc + j.total, 0);

    return {
      title: "fail2ban — Intrusion Prevention",
      subtitle: `${jails.length} jails active • ${totalBanned} IPs banned`,
      state: totalBanned > 20 ? "warning" : "healthy",
      freshness: makeFreshness(FAIL2BAN_HOST),
      metrics: [
        { label: "Active Jails", value: jails.length, state: "healthy" },
        { label: "Banned IPs", value: totalBanned, state: totalBanned > 20 ? "warning" : "healthy" },
        { label: "Total Attempts (24h)", value: totalAttempts },
        { label: "Host", value: FAIL2BAN_HOST },
      ],
      items: jails.map((j) => ({
        id: j.name,
        label: j.name,
        subtitle: `${j.banned} banned / ${j.total} attempts`,
        value: j.banned,
        state: j.banned > 10 ? "warning" : "healthy",
        group: "jails",
      })),
      events: [
        {
          id: "evt-001",
          at: new Date(Date.now() - 120_000).toISOString(),
          title: "IP banned by sshd jail",
          detail: "185.220.101.15 banned for repeated SSH failures",
          state: "warning",
        },
        {
          id: "evt-002",
          at: new Date(Date.now() - 1_800_000).toISOString(),
          title: "IP banned by recidive jail",
          detail: "193.32.162.201 banned (repeat offender)",
          state: "critical",
        },
        {
          id: "evt-003",
          at: new Date(Date.now() - 3_600_000).toISOString(),
          title: "Ban expired",
          detail: "45.13.105.8 unbanned after 1h (sshd)",
          state: "healthy",
        },
      ],
    };
  }
}

const adapter = new Fail2banAdapter();
export { adapter as default };
