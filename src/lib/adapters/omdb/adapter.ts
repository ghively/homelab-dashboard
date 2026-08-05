/**
 * OMDb adapter implementation.
 * Real Rotten Tomatoes/Metacritic/IMDb critic+audience scores for a title —
 * enrichment for recommendations, not a browsable library like the other
 * media adapters. One query shape: look a title up, get back real ratings.
 *
 * Endpoint: GET https://www.omdbapi.com/?apikey=...&t=<title>&y=<year>
 */

import type { VisualData, VisualQueryResult, FreshnessInfo, Metric } from "../core/contracts";
import type { OmdbResponse } from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, classifyError, fetchWithTimeout } from "@/lib/adapter-http";

const BASE_URL = "https://www.omdbapi.com";

export interface OmdbConfig {
  apiKey: string;
}

export class OmdbAdapter {
  private apiKey: string;

  constructor(config: OmdbConfig) {
    this.apiKey = config.apiKey;
  }

  private async fetch(params: Record<string, string>): Promise<OmdbResponse> {
    const url = `${BASE_URL}/?${new URLSearchParams({ apikey: this.apiKey, ...params })}`;
    const res = await fetchWithTimeout(url, {}, ADAPTER_TIMEOUT_MS);
    if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
    return (await res.json()) as OmdbResponse;
  }

  /**
   * Health check — OMDb has no dedicated status endpoint; a real lookup
   * against a title that will always exist is the honest equivalent.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      const body = await this.fetch({ t: "The Matrix" });
      return {
        timestamp: new Date().toISOString(),
        source: `OMDb:${BASE_URL}`,
        state: body.Response === "True" ? "healthy" : "offline",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `OMDb:${BASE_URL}`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Default view — deliberately NOT a real lookup. OMDb has to be registered
   * under a world (the adapter registry has no concept of "query-only,
   * never world-browsable"), so its default query is what the Media world
   * page would show with no specific title in context. A real API call
   * against a hardcoded placeholder title would burn a quota unit on every
   * world-page load and show confusingly specific data with no reason
   * behind it; this is a static, honest "here's what this is for" instead.
   */
  async queryReady(): Promise<VisualQueryResult> {
    const now = new Date().toISOString();
    const data: VisualData = {
      title: "OMDb Ratings",
      subtitle: "Ask about a specific title for real critic/audience scores",
      state: "healthy",
      metrics: [{ label: "Status", value: "Ready" }],
      updatedAt: now,
    };
    return {
      data,
      freshness: { timestamp: now, source: `OMDb:${BASE_URL}`, state: "healthy", cacheAgeMs: 0 },
    };
  }

  /**
   * Query: real critic/audience ratings for one title.
   * Returns VisualData for MetricStrip — a handful of numbers about one
   * title, the same shape rule every other numeric-summary adapter follows.
   * `year` disambiguates same-titled movies; omit it if unknown, OMDb still
   * usually resolves the best/most popular match.
   */
  async queryRatings(title: string, year?: string): Promise<VisualQueryResult> {
    const start = Date.now();
    const label = title ? `"${title}" Ratings` : "Ratings";
    try {
      const params: Record<string, string> = { t: title };
      if (year) params.y = year;
      const body = await this.fetch(params);

      const now = new Date().toISOString();

      if (body.Response === "False") {
        // Not an error — OMDb genuinely doesn't have this title. Honest
        // empty state, not a thrown exception (a miss is expected/common,
        // not exceptional — many niche/self-hosted titles won't be in OMDb).
        const data: VisualData = {
          title: label,
          subtitle: body.Error,
          state: "empty",
          metrics: [],
          updatedAt: now,
        };
        return {
          data,
          freshness: { timestamp: now, source: `OMDb:${BASE_URL}`, state: "healthy", cacheAgeMs: Date.now() - start },
        };
      }

      // Only the sources OMDb actually returned — obscure titles often have
      // an IMDb rating but no Rotten Tomatoes/Metacritic entry, and showing
      // "N/A" as if it were a real score would be its own small dishonesty.
      const metrics: Metric[] = (body.Ratings ?? []).map((r) => ({
        label: r.Source === "Internet Movie Database" ? "IMDb" : r.Source,
        value: r.Value,
      }));

      const data: VisualData = {
        title: `${body.Title}${body.Year ? ` (${body.Year})` : ""}`,
        subtitle: [body.Rated, body.Runtime].filter(Boolean).join(" · ") || undefined,
        state: "healthy",
        metrics,
        summary: body.Plot,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `OMDb:${BASE_URL}?t=${encodeURIComponent(title)}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
    }
  }

  private errorResult(title: string, err: unknown, startTime: number): VisualQueryResult {
    const c = classifyError(err);
    return {
      data: {
        title,
        subtitle: c.message,
        state: c.state,
        metrics: [{ label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state }],
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        timestamp: new Date().toISOString(),
        source: `OMDb:${BASE_URL}`,
        state: c.state === "healthy" ? "healthy" : "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}
