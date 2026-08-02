// Hermes API server — reachability probe against the real health route.
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

const BASE_URL = process.env.HERMES_API_SERVER_URL || "";
const HEALTH_PATH = "/health";

class HermesApiServerAdapter implements DataAdapter {
  readonly name = "hermes-api-server";
  readonly description = "Hermes API server — reachability and version.";
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
      title: "Hermes API server",
      baseUrl: BASE_URL,
      healthPath: HEALTH_PATH,
      envVar: "HERMES_API_SERVER_URL",
    });
  }
}

const adapter = new HermesApiServerAdapter();
export { adapter as default };
