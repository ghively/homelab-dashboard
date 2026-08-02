// iot-vlan adapter — NOT IMPLEMENTED.
//
// IoT VLAN visibility requires querying the router/controller (UniFi) or an
// ARP/mDNS sweep of the segment. No endpoint is configured for this adapter.
// Use the `unifi` adapter for real client data on the network.
// The previous version returned a hardcoded device inventory.
//
// query() reports an explicit no-data state instead. Phase 0's rule is that a
// panel must never display a fabricated number; honest emptiness is correct
// until a real client exists.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "iot-vlan",
    source: "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

export class IoTVLANAdapter implements DataAdapter {
  readonly name = "iot-vlan";
  readonly description = "iot-vlan — adapter not implemented.";
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
      title: "iot-vlan",
      subtitle: "Adapter not implemented",
      state: "empty",
      freshness: makeFreshness(),
      metrics: [{ label: "Status", value: "NOT IMPLEMENTED", state: "empty" }],
      summary: "No client exists for this service yet. Showing no data rather than placeholder values.",
    };
  }
}
