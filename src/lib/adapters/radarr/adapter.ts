/**
 * Radarr v4 adapter implementation.
 * Connects to Radarr REST API, normalizes responses to VisualData.
 *
 * Endpoints:
 * - GET /api/v3/movie (all movies)
 * - GET /api/v3/wanted/missing (missing movies)
 * - GET /api/v3/queue (download queue)
 * - GET /api/v3/calendar (upcoming releases)
 * - GET /api/v3/system/status (health)
 * - GET /api/v3/diskspace (disk usage)
 */

import { z } from "zod";
import type {
  VisualData,
  VisualQueryResult,
  FreshnessInfo,
  Metric,
  Item,
  Event,
} from "../core/contracts";
import { VisualStateSchema } from "../core/contracts";
import type {
  RadarrMovie,
  RadarrQueueItem,
  RadarrWantedItem,
  RadarrCalendarItem,
  RadarrSystemStatus,
  RadarrDiskSpace,
} from "./types";

/**
 * Radarr adapter configuration.
 */
export interface RadarrConfig {
  baseUrl: string; // e.g., http://localhost:7878
  apiKey: string; // From 1Password vault "Gregory"
}

/**
 * Radarr class.
 */
export class RadarrAdapter {
  private config: RadarrConfig;
  private baseUrl: string;
  private apiKey: string

  constructor(config: RadarrConfig) {
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
    try {
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        throw new Error(`Radarr API error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      throw new Error(`Radarr fetch failed: ${err}`);
    }
  }

  /**
   * Health check - fetch system status.
   */
  async health(): Promise<FreshnessInfo> {
    const start = Date.now();
    try {
      const status = await this.fetch<RadarrSystemStatus>("/api/v3/system/status");
      return {
        timestamp: new Date().toISOString(),
        source: `Radarr:${this.baseUrl}/api/v3/system/status`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `Radarr:${this.baseUrl}/api/v3/system/status`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Query: All movies.
   * Returns VisualData for PosterWall component.
   */
  async queryAllMovies(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const movies = await this.fetch<RadarrMovie[]>("/api/v3/movie");

      const now = new Date().toISOString();

      const visualItems: Item[] = movies.slice(0, 50).map((m) => ({
        id: m.id.toString(),
        label: m.title,
        subtitle: m.year?.toString(),
        image: m.images?.find((img) => img.coverType === "poster")?.url,
        value: m.year,
        state: m.monitored ? "healthy" : "warning",
        group: m.status,
        meta: {
          overview: m.overview,
          genres: m.genres,
          runtime: m.runtime,
          tmdbId: m.tmdbId,
          monitored: m.monitored,
          hasFile: m.hasFile,
          studio: m.studio,
          certification: m.certification,
        },
      }));

      const data: VisualData = {
        title: "All Movies",
        subtitle: `${movies.length} movies tracked`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total Movies", value: movies.length, unit: "movies" },
          {
            label: "Released",
            value: movies.filter((m) => m.status === "released").length,
            unit: "movies",
          },
          {
            label: "Announced",
            value: movies.filter((m) => m.status === "announced").length,
            unit: "movies",
          },
          {
            label: "Monitored",
            value: movies.filter((m) => m.monitored).length,
            unit: "movies",
          },
        ],
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Radarr:${this.baseUrl}/api/v3/movie`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("All Movies", err, start);
    }
  }

  /**
   * Query: Wanted (missing movies).
   * Returns VisualData for WantedList component.
   */
  async queryWantedMissing(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const response = await this.fetch<{ page: number; pageSize: number; totalRecords: number; records: RadarrWantedItem[] }>("/api/v3/wanted/missing?pageSize=50");
      const wanted = response.records;

      const now = new Date().toISOString();

      const visualItems: Item[] = wanted.map((item) => ({
        id: item.id.toString(),
        label: item.movie?.title || "Unknown Movie",
        subtitle: item.movie?.year?.toString(),
        image: item.movie?.images?.find((img) => img.coverType === "poster")?.url,
        state: "critical",
        group: item.digitalRelease || item.physicalRelease || "Unknown",
        meta: {
          movieId: item.movieId,
          inCinemas: item.inCinemas,
          physicalRelease: item.physicalRelease,
          digitalRelease: item.digitalRelease,
        },
      }));

      const data: VisualData = {
        title: "Missing Movies",
        subtitle: `${wanted.length} movies unavailable`,
        state: wanted.length > 0 ? "critical" : "healthy",
        items: visualItems,
        metrics: [
          { label: "Missing", value: wanted.length, unit: "movies" },
          { label: "Total Records", value: response.totalRecords, unit: "movies" },
        ],
        summary: `${wanted.length} movies missing across monitored library`,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Radarr:${this.baseUrl}/api/v3/wanted/missing`,
          state: wanted.length > 0 ? "critical" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Missing Movies", err, start);
    }
  }

  /**
   * Query: Download queue.
   * Returns VisualData for Queue component.
   */
  async queryQueue(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const response = await this.fetch<{ page: number; pageSize: number; totalRecords: number; records: RadarrQueueItem[] }>("/api/v3/queue?pageSize=50");
      const queue = response.records;

      const now = new Date().toISOString();

      const visualItems: Item[] = queue.map((item) => ({
        id: item.id.toString(),
        label: item.title,
        subtitle: item.movie?.title,
        image: item.movie?.images?.find((img) => img.coverType === "poster")?.url,
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
            title: q.movie?.title || "Unknown Movie",
            detail: q.status,
            state: q.status === "downloading" ? "loading" : q.status === "completed" ? "healthy" : "warning",
          })),
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Radarr:${this.baseUrl}/api/v3/queue`,
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
      endDt.setDate(endDt.getDate() + 30); // Next 30 days

      const calendar = await this.fetch<RadarrCalendarItem[]>(
        `/api/v3/calendar?start=${startDt.toISOString()}&end=${endDt.toISOString()}`
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = calendar.map((item) => ({
        id: item.id.toString(),
        label: item.title,
        subtitle: item.year?.toString(),
        image: item.images?.find((img) => img.coverType === "poster")?.url,
        state: item.hasFile ? "healthy" : "warning",
        group: item.physicalRelease || item.digitalRelease || "Unknown",
        meta: {
          inCinemas: item.inCinemas,
          physicalRelease: item.physicalRelease,
          digitalRelease: item.digitalRelease,
          overview: item.overview,
          monitored: item.monitored,
        },
      }));

      const data: VisualData = {
        title: "Upcoming Movies",
        subtitle: `Next 30 days: ${calendar.length} releases`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total", value: calendar.length, unit: "movies" },
          {
            label: "Downloaded",
            value: calendar.filter((c) => c.hasFile).length,
            unit: "movies",
          },
          {
            label: "Missing",
            value: calendar.filter((c) => !c.hasFile).length,
            unit: "movies",
          },
        ],
        events: calendar.map((c) => ({
          id: c.id.toString(),
          at: c.physicalRelease || c.digitalRelease || c.inCinemas || "",
          title: c.title,
          detail: c.status,
          state: c.hasFile ? "healthy" : "warning",
        })),
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Radarr:${this.baseUrl}/api/v3/calendar`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Upcoming Movies", err, start);
    }
  }

  /**
   * Query: Disk space.
   * Returns VisualData for StorageMetrics component.
   */
  async queryDiskSpace(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const diskspace = await this.fetch<RadarrDiskSpace[]>("/api/v3/diskspace");

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
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Radarr:${this.baseUrl}/api/v3/diskspace`,
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
      },
      freshness: {
        timestamp: new Date().toISOString(),
        source: `Radarr:${this.baseUrl}`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}