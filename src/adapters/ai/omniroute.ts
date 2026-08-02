// OmniRoute adapter — providers, routes, circuit breakers, costs.
// Host: gh-arm (192.168.0.156 or Tailscale 100.65.126.126)
//
// NOT IMPLEMENTED. OmniRoute's dashboard API is undocumented — the original
// module carried "exact endpoint TBD from docs" and returned a hardcoded
// provider list, which the dashboard would have rendered as live data.
//
// Rather than guess at endpoints, query() reports an explicit unimplemented
// state. Phase 0's rule is that a panel must never show a fabricated number;
// an honest "no data" is the correct behaviour until the API is known.
//
// To implement: replace query() with real fetches and register it in
// src/lib/adapter-runtime.ts gated on OMNIROUTE_URL.

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, VisualQueryResult } from "../types";

const OMNIROUTE_URL = process.env.OMNIROUTE_URL || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "omniroute",
    source: OMNIROUTE_URL || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class OmniRouteAdapter implements DataAdapter {
  readonly name = "omniroute";
  readonly description = "Model routing and circuit breaker provider.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    return {
      title: "OmniRoute",
      subtitle: "Adapter not implemented — dashboard API undocumented",
      state: "empty",
      freshness: makeFreshness(),
      metrics: [{ label: "Status", value: "NOT IMPLEMENTED", state: "empty" }],
      summary:
        "No client exists for OmniRoute yet. Showing no data rather than placeholder values.",
    };
  }
}

const adapter = new OmniRouteAdapter();
export { adapter as default };
