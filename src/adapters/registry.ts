// Central registry for all data adapters.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo } from "./types";

// All adapters register here.
const adapters = new Map<string, DataAdapter>();

// Register an adapter.
export function registerAdapter(adapter: DataAdapter): void {
  adapters.set(adapter.name, adapter);
}

// Get an adapter by name.
export function getAdapter(name: string): DataAdapter | undefined {
  return adapters.get(name);
}

// List all adapter names.
export function listAdapters(): string[] {
  return Array.from(adapters.keys());
}

// List adapters by category.
export function listAdaptersByCategory(category: DataAdapter["category"]): DataAdapter[] {
  return Array.from(adapters.values()).filter((a) => a.category === category);
}

// Health check all adapters.
export async function healthCheckAll(): Promise<Record<string, { healthy: boolean; latencyMs: number; freshness?: FreshnessInfo }>> {
  const results: Record<string, { healthy: boolean; latencyMs: number; freshness?: FreshnessInfo }> = {};
  await Promise.all(
    Array.from(adapters.entries()).map(async ([name, adapter]) => {
      const start = Date.now();
      try {
        const freshness = await adapter.health();
        const latencyMs = Date.now() - start;
        results[name] = {
          healthy: freshness.stalenessSeconds < 300, // Fresh if <5 minutes old
          latencyMs,
          freshness,
        };
      } catch (err) {
        results[name] = {
          healthy: false,
          latencyMs: Date.now() - start,
        };
      }
    })
  );
  return results;
}

// Fixture state override for testing.
// When set, all adapters return fixture data in the specified state.
import type { VisualStateValue } from "./types";
let fixtureState: VisualStateValue | null = null;

export function setFixtureState(state: VisualStateValue | null): void {
  fixtureState = state;
}

export function getFixtureState(): VisualStateValue | null {
  return fixtureState;
}