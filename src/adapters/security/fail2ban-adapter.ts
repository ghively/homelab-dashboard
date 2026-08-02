// Fail2ban adapter (subdirectory copy) — NOT IMPLEMENTED.
//
// Fail2ban has no native HTTP API; state comes from `fail2ban-client status`
// over SSH. The previous version fetched a TCP probe against port 22 and then
// returned a hardcoded jail list with invented ban counts, which the dashboard
// rendered as live security data.
//
// A real implementation exists at src/adapters/Fail2banAdapter.ts, which reads
// from a FAIL2BAN_API_URL sidecar exposing /status. Use that one — it is the
// copy registered in src/lib/adapter-runtime.ts.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const FAIL2BAN_HOST = process.env.FAIL2BAN_HOST || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "fail2ban",
    source: FAIL2BAN_HOST || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class Fail2banAdapter implements DataAdapter {
  readonly name = "fail2ban";
  readonly description = "Fail2ban — intrusion prevention (not implemented in this copy).";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    return {
      title: "Fail2ban",
      subtitle: "Adapter not implemented — no HTTP API",
      state: "empty",
      freshness: makeFreshness(),
      metrics: [{ label: "Status", value: "NOT IMPLEMENTED", state: "empty" }],
      summary: "Use src/adapters/Fail2banAdapter.ts with FAIL2BAN_API_URL for real data.",
    };
  }
}

const adapter = new Fail2banAdapter();
export { adapter as default };
