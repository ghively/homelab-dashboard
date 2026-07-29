// Base interface for all data adapters.

import type { FreshnessInfo, VisualQueryResult } from "./types";

// Export HealthCheck type for backward compatibility
export type HealthCheck = FreshnessInfo;

export interface DataAdapter {
  // Adapter metadata.
  readonly name: string;
  readonly description: string;
  readonly category: "ai" | "media" | "ops" | "host" | "home" | "security" | "network" | "knowledge" | "personal";

  // Health check (Level 1 integration).
  health(): Promise<FreshnessInfo>;

  // Query for normalized visual data (Level 2+ integration).
  // Returns fixture data if configured, otherwise fetches from real source.
  query(params?: { query?: string; filters?: Record<string, unknown>; limit?: number }): Promise<VisualQueryResult>;
}

// Helper to compute freshness state from age.
export function computeFreshnessState(ageMs: number, staleThresholdMs = 300_000): "healthy" | "stale" | "offline" {
  if (ageMs < staleThresholdMs) return "healthy";
  if (ageMs < staleThresholdMs * 6) return "stale";
  return "offline";
}

// Helper to compute overall state from metrics.
export function computeStateFromMetrics(metrics: Array<{ state?: string }>): "healthy" | "warning" | "critical" {
  if (metrics.some((m) => m.state === "critical")) return "critical";
  if (metrics.some((m) => m.state === "warning")) return "warning";
  return "healthy";
}