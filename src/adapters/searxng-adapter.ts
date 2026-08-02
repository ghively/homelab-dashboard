// SearXNG search engine adapter (supports multiple instances)
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import { ADAPTER_FANOUT_TIMEOUT_MS, ADAPTER_TIMEOUT_MS, AdapterHttpError, failureResult, makeFreshness } from "@/lib/adapter-http";

// /config engine entries — no score/error here, those live in /stats.
interface SearXNGConfigEngine {
  name: string;
  enabled: boolean;
  categories?: string[];
  shortcut?: string;
}

// /stats/errors?format=json — the one stats surface this SearXNG build serves
// as JSON. Keyed by engine name; value is a list of recent error records.
type SearXNGErrors = Record<string, unknown[]>;

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
        signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
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

  async query(_params?: { query?: string }): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    const base = this.baseUrl.replace(/\/$/, "");
    const start = Date.now();
    try {
      // /config is the source of truth for the engine roster and is valid JSON.
      // /stats is NOT — this SearXNG build serves it as an HTML page even with
      // ?format=json, which is exactly what made the old adapter throw a JSON
      // parse error and render offline while the service was perfectly healthy.
      // /stats/errors?format=json is the one stats surface that is real JSON, so
      // error attribution comes from there and is best-effort.
      const configRes = await fetch(`${base}/config`, {
        signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!configRes.ok) throw new AdapterHttpError(`${base}/config`, configRes.status);
      const configData = (await configRes.json()) as { engines?: SearXNGConfigEngine[] };
      const engines = configData.engines ?? [];
      const enabled = engines.filter((e) => e.enabled);

      let errored: string[] = [];
      try {
        const errRes = await fetch(`${base}/stats/errors?format=json`, {
          signal: AbortSignal.timeout(ADAPTER_FANOUT_TIMEOUT_MS),
          cache: "no-store",
        });
        if (errRes.ok && errRes.headers.get("content-type")?.includes("application/json")) {
          const errData = (await errRes.json()) as SearXNGErrors;
          errored = Object.entries(errData)
            .filter(([, v]) => Array.isArray(v) && v.length > 0)
            .map(([name]) => name);
        }
      } catch {
        // errors endpoint is enrichment only — never fail the panel on it.
      }

      const erroredEnabled = enabled.filter((e) => errored.includes(e.name));

      return {
        title: `SearXNG (${this.name})`,
        subtitle: `${enabled.length}/${engines.length} engines enabled${
          erroredEnabled.length ? ` • ${erroredEnabled.length} erroring` : ""
        }`,
        state: erroredEnabled.length > 0 ? "warning" : "healthy",
        metrics: [
          { label: "Engines Enabled", value: enabled.length },
          { label: "Engines Total", value: engines.length },
          {
            label: "Erroring",
            value: erroredEnabled.length,
            state: erroredEnabled.length > 0 ? "warning" : "healthy",
          },
        ],
        items: enabled.slice(0, 40).map((e, i) => ({
          id: `${this.name}-${e.name || i}`,
          label: e.name,
          subtitle: (e.categories ?? []).join(", ") || (e.shortcut ?? ""),
          value: errored.includes(e.name) ? "erroring" : "ok",
          state: (errored.includes(e.name) ? "warning" : "healthy") as "warning" | "healthy",
        })),
        source: "live",
        freshness: makeFreshness(this.name, base, start),
        summary: `${enabled.length} of ${engines.length} search engines enabled${
          erroredEnabled.length ? `, ${erroredEnabled.length} currently erroring` : ""
        }.`,
      };
    } catch (error) {
      return failureResult(this.name, `SearXNG (${this.name})`, base, error, start);
    }
  }
}