/**
 * Sonarr v3 adapter implementation.
 * Connects to Sonarr REST API, normalizes responses to VisualData.
 *
 * Endpoints:
 * - GET /api/v3/series (all series)
 * - GET /api/v3/wanted/missing (missing episodes)
 * - GET /api/v3/queue (download queue)
 * - GET /api/v3/calendar (upcoming episodes)
 * - GET /api/v3/system/status (health)
 * - GET /api/v3/diskspace (disk usage)
 */

import { proxyImage } from "@/lib/image-proxy";
import type {
  VisualData,
  VisualQueryResult,
  FreshnessInfo,
  Metric,
  Item,
} from "../core/contracts";
import type {
  SonarrSeries,
  SonarrQueueItem,
  SonarrWantedItem,
  SonarrCalendarItem,
  SonarrSystemStatus,
  SonarrDiskSpace,
} from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, fetchWithTimeout } from "@/lib/adapter-http";

/**
 * Sonarr adapter configuration.
 */
export interface SonarrConfig {
  baseUrl: string; // e.g., http://localhost:8989
  apiKey: string; // From 1Password vault "Gregory"
}

/**
 * Sonarr class.
 */
export class SonarrAdapter {
  private config: SonarrConfig;
  private baseUrl: string;
  private apiKey: string

  constructor(config: SonarrConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  /**
   * Get API headers.
   */
  private getHeaders(): HeadersInit {
    return {
      "X-Api-Key": this.apiKey,
      "Accept": "application/json",
    };
  }

  /**
   * Generic fetch with error handling.
   */
  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    // The signal is load-bearing. Node fetch has no default timeout, so a
    // host that accepts the connection and never answers held this promise
    // for the kernel's full TCP retry window (~130s). /api/fleet awaits every
    // adapter in a world, so one such host pinned the whole endpoint and the
    // world tile sat on LOADING. AdapterHttpError is thrown rather than a
    // stringified Error so classifyError() can still tell 401 from offline.
    const res = await fetchWithTimeout(url, { headers: this.getHeaders() }, ADAPTER_TIMEOUT_MS);
    if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
    return (await res.json()) as T;
  }

  /**
   * Health check - fetch system status.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      const _status = await this.fetch<SonarrSystemStatus>("/api/v3/system/status");
      return {
        timestamp: new Date().toISOString(),
        source: `Sonarr:${this.baseUrl}/api/v3/system/status`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `Sonarr:${this.baseUrl}/api/v3/system/status`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Query: All series.
   * Returns VisualData for SeriesWall component.
   */
  async queryAllSeries(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const series = await this.fetch<SonarrSeries[]>("/api/v3/series");

      const now = new Date().toISOString();

      const visualItems: Item[] = series.slice(0, 50).map((s) => ({
        id: s.id.toString(),
        label: s.title,
        subtitle: s.year?.toString(),
        image: proxyImage("sonarr", s.images?.find((img) => img.coverType === "poster")?.url),
        value: s.year,
        state: s.monitored ? "healthy" : "warning",
        group: s.status,
        meta: {
          overview: s.overview,
          network: s.network,
          genres: s.genres,
          runtime: s.runtime,
          tvdbId: s.tvdbId,
          imdbId: s.imdbId,
          monitored: s.monitored,
          seasonFolder: s.seasonFolder,
        },
      }));

      const data: VisualData = {
        title: "All Series",
        subtitle: `${series.length} shows tracked`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total Shows", value: series.length, unit: "series" },
          {
            label: "Continuing",
            value: series.filter((s) => s.status === "continuing").length,
            unit: "shows",
          },
          {
            label: "Ended",
            value: series.filter((s) => s.status === "ended").length,
            unit: "shows",
          },
          {
            label: "Monitored",
            value: series.filter((s) => s.monitored).length,
            unit: "shows",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/series`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("All Series", err, start);
    }
  }

  /**
   * Query: Wanted (missing episodes).
   * Returns VisualData for WantedList component.
   */
  async queryWantedMissing(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const response = await this.fetch<{ page: number; pageSize: number; totalRecords: number; records: SonarrWantedItem[] }>("/api/v3/wanted/missing?pageSize=50");
      const wanted = response.records;

      const now = new Date().toISOString();

      const visualItems: Item[] = wanted.map((item) => ({
        id: item.id.toString(),
        label: item.series?.title || "Unknown Series",
        subtitle: `S${item.episode?.seasonNumber}E${item.episode?.episodeNumber}`,
        image: proxyImage("sonarr", item.series?.images?.find((img) => img.coverType === "poster")?.url),
        state: "critical",
        group: item.airDate,
        meta: {
          episodeId: item.episodeId,
          seriesId: item.seriesId,
          airDate: item.airDate,
          episodeTitle: item.episode?.title,
        },
      }));

      const data: VisualData = {
        title: "Missing Episodes",
        subtitle: `${wanted.length} episodes unavailable`,
        state: wanted.length > 0 ? "critical" : "healthy",
        items: visualItems,
        metrics: [
          { label: "Missing", value: wanted.length, unit: "episodes" },
          { label: "Total Records", value: response.totalRecords, unit: "episodes" },
        ],
        summary: `${wanted.length} episodes missing across monitored series`,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/wanted/missing`,
          state: wanted.length > 0 ? "critical" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Missing Episodes", err, start);
    }
  }

  /**
   * Query: Download queue.
   * Returns VisualData for Queue component.
   */
  async queryQueue(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const response = await this.fetch<{ page: number; pageSize: number; totalRecords: number; records: SonarrQueueItem[] }>("/api/v3/queue?pageSize=50");
      const queue = response.records;

      const now = new Date().toISOString();

      const visualItems: Item[] = queue.map((item) => ({
        id: item.id.toString(),
        label: item.title,
        subtitle: item.episode?.title || item.series?.title,
        image: proxyImage("sonarr", item.series?.images?.find((img) => img.coverType === "poster")?.url),
        value: item.size,
        progress: item.sizeleft ? 1 - item.sizeleft / item.size : undefined,
        state: item.status === "downloading" ? "loading" : item.status === "completed" ? "healthy" : "warning",
        group: item.status,
        meta: {
          size: item.size,
          sizeleft: item.sizeleft,
          quality: item.quality?.quality.name,
          protocol: item.protocol,
          downloadClient: item.downloadClient,
          indexer: item.indexer,
          estimatedCompletionTime: item.estimatedCompletionTime,
          trackedDownloadStatus: item.trackedDownloadStatus,
        },
      }));

      const data: VisualData = {
        title: "Download Queue",
        subtitle: `${queue.length} items in queue`,
        state: queue.length > 0 ? "loading" : "empty",
        items: visualItems,
        metrics: [
          { label: "In Queue", value: queue.length, unit: "items" },
          {
            label: "Downloading",
            value: queue.filter((q) => q.status === "downloading").length,
            unit: "items",
          },
          {
            label: "Completed",
            value: queue.filter((q) => q.status === "completed").length,
            unit: "items",
          },
        ],
        events: queue
          .filter((q) => q.added)
          .map((q) => ({
            id: q.id.toString(),
            at: q.added,
            title: `${q.series?.title} S${q.episode?.seasonNumber}E${q.episode?.episodeNumber}`,
            detail: q.status,
            state: q.status === "downloading" ? "loading" : q.status === "completed" ? "healthy" : "warning",
          })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/queue`,
          state: queue.length > 0 ? "loading" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Download Queue", err, start);
    }
  }

  /**
   * Query: Upcoming calendar.
   * Returns VisualData for Calendar component.
   */
  async queryCalendar(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const startDt = new Date();
      const endDt = new Date();
      endDt.setDate(endDt.getDate() + 14); // Next 14 days

      const calendar = await this.fetch<SonarrCalendarItem[]>(
        `/api/v3/calendar?start=${startDt.toISOString()}&end=${endDt.toISOString()}`
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = calendar.map((item) => ({
        id: item.id.toString(),
        label: item.series?.title || "Unknown Series",
        subtitle: `S${item.seasonNumber}E${item.episodeNumber}: ${item.title}`,
        image: proxyImage("sonarr", item.series?.images?.find((img) => img.coverType === "poster")?.url),
        state: item.hasFile ? "healthy" : "warning",
        group: item.airDate,
        meta: {
          airDate: item.airDate,
          overview: item.overview,
          monitored: item.monitored,
        },
      }));

      const data: VisualData = {
        title: "Upcoming Episodes",
        subtitle: `Next 14 days: ${calendar.length} episodes`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total", value: calendar.length, unit: "episodes" },
          {
            label: "Downloaded",
            value: calendar.filter((c) => c.hasFile).length,
            unit: "episodes",
          },
          {
            label: "Missing",
            value: calendar.filter((c) => !c.hasFile).length,
            unit: "episodes",
          },
        ],
        events: calendar.map((c) => ({
          id: c.id.toString(),
          at: c.airDateUtc,
          title: `${c.series?.title} S${c.seasonNumber}E${c.episodeNumber}`,
          detail: c.title,
          state: c.hasFile ? "healthy" : "warning",
        })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/calendar`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Upcoming Episodes", err, start);
    }
  }

  /**
   * Query: Disk space.
   * Returns VisualData for StorageMetrics component.
   */
  async queryDiskSpace(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const diskspace = await this.fetch<SonarrDiskSpace[]>("/api/v3/diskspace");

      const now = new Date().toISOString();

      const metrics: Metric[] = diskspace.map((disk) => ({
        label: disk.label || disk.path,
        value: (disk.freeSpace / 1024 / 1024 / 1024).toFixed(2),
        unit: "GB free",
        state: disk.freeSpace / disk.totalSpace < 0.1 ? "critical" : disk.freeSpace / disk.totalSpace < 0.2 ? "warning" : "healthy",
      }));

      const items: Item[] = diskspace.map((disk) => ({
        id: disk.path,
        label: disk.label || disk.path,
        subtitle: `${(disk.totalSpace / 1024 / 1024 / 1024).toFixed(0)} GB total`,
        value: disk.freeSpace / disk.totalSpace,
        state: disk.freeSpace / disk.totalSpace < 0.1 ? "critical" : disk.freeSpace / disk.totalSpace < 0.2 ? "warning" : "healthy",
        progress: disk.freeSpace / disk.totalSpace,
        meta: {
          freeSpace: disk.freeSpace,
          totalSpace: disk.totalSpace,
        },
      }));

      const data: VisualData = {
        title: "Disk Space",
        subtitle: `${diskspace.length} volumes`,
        state: diskspace.some((d) => d.freeSpace / d.totalSpace < 0.1) ? "critical" : "healthy",
        metrics,
        items,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/diskspace`,
          state: diskspace.some((d) => d.freeSpace / d.totalSpace < 0.1) ? "critical" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Disk Space", err, start);
    }
  }

  /**
   * Create an error result for failed queries.
   */
  private errorResult(
    title: string,
    err: unknown,
    startTime: number
  ): VisualQueryResult {
    return {
      data: {
        title,
        subtitle: "Failed to load data",
        state: "offline",
        items: [],
        metrics: [],
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        timestamp: new Date().toISOString(),
        source: `Sonarr:${this.baseUrl}`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}