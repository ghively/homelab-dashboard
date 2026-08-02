// valkey adapter — NOT IMPLEMENTED.
//
// Valkey speaks the Redis wire protocol over TCP. There is no HTTP endpoint
// to fetch, so a browser/Next.js fetch client cannot query it. Implementing
// this needs a Redis client (e.g. iovalkey) called from a server route.
// The previous version returned hardcoded key counts, memory usage and hit
// rates, which the dashboard rendered as live.
//
// query() reports an explicit no-data state instead. Phase 0's rule is that a
// panel must never display a fabricated number; honest emptiness is correct
// until a real client exists.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";

const VALKEY_HOST = process.env.VALKEY_HOST || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "valkey",
    source: VALKEY_HOST || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

export class ValkeyAdapter implements DataAdapter {
  readonly name = "valkey";
  readonly description = "valkey — adapter not implemented.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    return {
      title: "valkey",
      subtitle: "Adapter not implemented",
      state: "empty",
      freshness: makeFreshness(),
      metrics: [{ label: "Status", value: "NOT IMPLEMENTED", state: "empty" }],
      summary: "No client exists for this service yet. Showing no data rather than placeholder values.",
    };
  }
}
