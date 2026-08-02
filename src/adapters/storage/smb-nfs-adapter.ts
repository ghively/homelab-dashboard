// smb-nfs adapter — NOT IMPLEMENTED.
//
// SMB/NFS share stats come from SSH + df/nfsstat on the NAS, or the DSM
// FileStation API. Neither is reachable via fetch from this process.
// The previous version returned hardcoded share sizes and throughput.
//
// query() reports an explicit no-data state instead. Phase 0's rule is that a
// panel must never display a fabricated number; honest emptiness is correct
// until a real client exists.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const SMBNFS_HOST = process.env.SMBNFS_HOST || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "smb-nfs",
    source: SMBNFS_HOST || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

class SmbNfsAdapter implements DataAdapter {
  readonly name = "smb-nfs";
  readonly description = "smb-nfs — adapter not implemented.";
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
      title: "smb-nfs",
      subtitle: "Adapter not implemented",
      state: "empty",
      freshness: makeFreshness(),
      metrics: [{ label: "Status", value: "NOT IMPLEMENTED", state: "empty" }],
      summary: "No client exists for this service yet. Showing no data rather than placeholder values.",
    };
  }
}

const adapter = new SmbNfsAdapter();
export { adapter as default };
