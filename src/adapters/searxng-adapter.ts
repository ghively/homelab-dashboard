// SearXNG search engine adapter (supports multiple instances)
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

interface SearXNGEngine {
  name: string;
  score: number;
  error?: string;
}

interface SearXNGStats {
  engine_count: number;
  result_count: number;
  search_count: number;
}

export class SearXNGAdapter implements DataAdapter {
  readonly name: string;
  readonly description: string;
  readonly category = "ops" as const;

  private baseUrl: string;
  private apiKey?: string;

  constructor(name: string, baseUrl: string, apiKey?: string) {
    this.name = name;
    this.description = `SearXNG search engine (${name})`;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async health(): Promise<FreshnessInfo> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return {
        adapter: this.name,
        source: this.baseUrl,
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    }

    try {
      await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return {
      adapter: this.name,
      source: this.baseUrl,
      queriedAt: new Date().toISOString(),
      stalenessSeconds: 0,
      cacheHit: false,
    };
  }

  async query(params?: { query?: string }): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    const start = Date.now();
    try {
      const [enginesResponse, statsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/config`, {
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`${this.baseUrl}/stats`, {
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      const enginesData = await enginesResponse.json();
      const statsData = await statsResponse.json();

      const engines: SearXNGEngine[] = enginesData.engines || [];
      const stats: SearXNGStats = statsData || {};

      const workingEngines = engines.filter((e) => !e.error);
      const failedEngines = engines.filter((e) => e.error);

      return {
        title: `SearXNG (${this.name})`,
        subtitle: `${this.baseUrl}`,
        state: workingEngines.length > 0 ? "healthy" : "offline",
        metrics: [
          { label: "Engines", value: engines.length },
          { label: "Working", value: workingEngines.length },
          { label: "Failed", value: failedEngines.length, state: failedEngines.length > 0 ? "warning" : "healthy" },
          { label: "Searches", value: stats.search_count || 0 },
          { label: "Results", value: stats.result_count || 0 },
        ],
        items: workingEngines.map((e, i) => ({
          id: `${this.name}-${i}`,
          label: e.name,
          subtitle: `Score: ${e.score.toFixed(2)}`,
          value: "OK",
          state: "healthy",
        })),
        source: this.name,
        fetchedAt: new Date().toISOString(),
        ageMs: Date.now() - start,
        staleMs: 300000, // 5 minutes
      };
    } catch (error) {
      return {
        title: `SearXNG (${this.name})`,
        subtitle: `Failed to fetch from ${this.baseUrl}`,
        state: "offline",
        metrics: [{ label: "Status", value: "ERROR", state: "offline" }],
        source: this.name,
        fetchedAt: new Date().toISOString(),
        ageMs: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}