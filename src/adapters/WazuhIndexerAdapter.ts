// wazuh-indexer adapter (root duplicate) — SUPERSEDED.
//
// This is an older copy of src/adapters/security/wazuh-indexer-adapter.ts, which is the
// version registered in src/lib/adapter-runtime.ts and the one that queries
// the real API.
//
// This copy returned hardcoded values from query() and never contacted the
// service. It is kept only so existing imports of src/adapters/index.ts keep
// resolving; it reports no data rather than fabricating any. Do not register
// it — registering it would shadow the working adapter under the same name.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "wazuh-indexer",
    source: "superseded",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class WazuhIndexerAdapter implements DataAdapter {
  readonly name = "wazuh-indexer";
  readonly description = "wazuh-indexer — superseded duplicate; use the security/ module.";
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
      title: "wazuh-indexer",
      subtitle: "Superseded duplicate — not the registered adapter",
      state: "empty",
      freshness: makeFreshness(),
      metrics: [{ label: "Status", value: "SUPERSEDED", state: "empty" }],
      summary: "Real implementation lives at src/adapters/security/wazuh-indexer-adapter.ts.",
    };
  }
}

const adapter = new WazuhIndexerAdapter();
export { adapter as default };
