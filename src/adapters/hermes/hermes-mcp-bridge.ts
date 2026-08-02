// Hermes MCP bridge — reachability probe against the real health route.
//
// Hermes exposes no aggregate metrics API on this surface, so this adapter
// reports only what it can actually observe: whether /health answers, the
// status it returns, how long it took, and whatever version/platform fields
// the payload carries. Every value is measured. Do not reintroduce the
// hardcoded session/tool-invocation counts this module used to return.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { hermesFreshness, probeHermesEndpoint } from "./probe";

const BASE_URL = process.env.HERMES_MCP_BRIDGE_URL || "";
const HEALTH_PATH = "/health";

class HermesMcpBridgeAdapter implements DataAdapter {
  readonly name = "hermes-mcp-bridge";
  readonly description = "Hermes MCP bridge — reachability and version.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return hermesFreshness(this.name, BASE_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }
    return probeHermesEndpoint({
      adapter: this.name,
      title: "Hermes MCP bridge",
      baseUrl: BASE_URL,
      healthPath: HEALTH_PATH,
      envVar: "HERMES_MCP_BRIDGE_URL",
    });
  }
}

const adapter = new HermesMcpBridgeAdapter();
export { adapter as default };
