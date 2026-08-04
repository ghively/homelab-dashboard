// Security adapters — Phase 8.
// Wazuh x3 (manager, indexer, dashboard).

import type { DataAdapter } from "../adapter-base";

import wazuhManager from "./wazuh-manager-adapter";
import wazuhIndexer from "./wazuh-indexer-adapter";
import wazuhDashboard from "./wazuh-dashboard-adapter";

export const securityAdapters: Record<string, DataAdapter> = {
  "wazuh-manager": wazuhManager,
  "wazuh-indexer": wazuhIndexer,
  "wazuh-dashboard": wazuhDashboard,
};

export function getSecurityAdapter(name: string): DataAdapter | undefined {
  return securityAdapters[name];
}

export function listSecurityAdapters(): Array<{ name: string; description: string }> {
  return Object.values(securityAdapters).map((a) => ({
    name: a.name,
    description: a.description,
  }));
}

export {
  default as wazuhManagerAdapter,
} from "./wazuh-manager-adapter";

export {
  default as wazuhIndexerAdapter,
} from "./wazuh-indexer-adapter";

export {
  default as wazuhDashboardAdapter,
} from "./wazuh-dashboard-adapter";
