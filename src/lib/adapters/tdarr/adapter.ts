/**
 * Tdarr adapter implementation.
 * Connects to Tdarr REST API, normalizes responses to VisualData.
 *
 * Endpoints:
 * - GET /api/v2/config/libraries (all libraries)
 * - GET /api/v2/status (system status)
 * - GET /api/v2/jobs (transcode jobs)
 * - GET /api/v2/files (media files)
 * - GET /api/v2/workers (worker nodes)
 */

import type {
  VisualData,
  VisualQueryResult,
  FreshnessInfo,
  Item,
} from "../core/contracts";
import type {
  TdarrLibrary,
  TdarrJob,
  TdarrWorker,
  TdarrSystemStatus,
} from "./types";

/**
 * Tdarr adapter configuration.
 */
export interface TdarrConfig {
  baseUrl: string; // e.g., http://localhost:8265
  apiKey?: string; // Optional, if Tdarr requires authentication
}

/**
 * Tdarr class.
 */
export class TdarrAdapter {
  private config: TdarrConfig;
  private baseUrl: string;

  constructor(config: TdarrConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  /**
   * Get API headers.
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  /**
   * Generic fetch with error handling.
   */
  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        throw new Error(`Tdarr API error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      throw new Error(`Tdarr fetch failed: ${err}`);
    }
  }

  /**
   * Health check - fetch system status.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      const _status = await this.fetch<TdarrSystemStatus>("/api/v2/status");
      return {
        timestamp: new Date().toISOString(),
        source: `Tdarr:${this.baseUrl}/api/v2/status`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `Tdarr:${this.baseUrl}/api/v2/status`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Query: System status.
   * Returns VisualData for SystemStatus component.
   */
  async querySystemStatus(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const status = await this.fetch<TdarrSystemStatus>("/api/v2/status");

      const now = new Date().toISOString();

      const data: VisualData = {
        title: "Tdarr System",
        subtitle: `v${status.version} - ${status.workers_online} workers online`,
        state: status.workers_online > 0 ? "healthy" : "warning",
        metrics: [
          { label: "Version", value: status.version, unit: "" },
          {
            label: "Libraries",
            value: status.libraries_count,
            unit: "libraries",
          },
          {
            label: "Total Files",
            value: status.files_count,
            unit: "files",
          },
          {
            label: "Total Size",
            value: ((status.total_size / 1024 / 1024 / 1024)).toFixed(2),
            unit: "GB",
          },
          {
            label: "Workers",
            value: status.workers_online,
            unit: "online",
          },
          {
            label: "Jobs Queued",
            value: status.jobs_queued,
            unit: "jobs",
            state: status.jobs_queued > 0 ? "loading" : "healthy",
          },
          {
            label: "Jobs Processing",
            value: status.jobs_processing,
            unit: "jobs",
            state: status.jobs_processing > 0 ? "loading" : "healthy",
          },
          {
            label: "Completed Today",
            value: status.jobs_completed_today,
            unit: "jobs",
          },
          {
            label: "Failed Today",
            value: status.jobs_failed_today,
            unit: "jobs",
            state: status.jobs_failed_today > 0 ? "critical" : "healthy",
          },
        ],
        items: [],
        summary: status.uptime ? `Uptime: ${status.uptime}` : undefined,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Tdarr:${this.baseUrl}/api/v2/status`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("System Status", err, start);
    }
  }

  /**
   * Query: Transcode queue.
   * Returns VisualData for Queue component.
   */
  async queryJobs(limit: number = 50): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const jobs = await this.fetch<TdarrJob[]>(`/api/v2/jobs?limit=${limit}`);

      const now = new Date().toISOString();

      const visualItems: Item[] = jobs.map((job) => ({
        id: job.id,
        label: job.file_name,
        subtitle: job.file_path.substring(0, 80),
        image: undefined,
        value: job.file_size,
        progress: job.progress / 100,
        state: job.status === "processing" ? "loading" : job.status === "completed" ? "healthy" : job.status === "failed" ? "critical" : "warning",
        group: job.status,
        meta: {
          file_id: job.file_id,
          file_path: job.file_path,
          file_size: job.file_size,
          library_id: job.library_id,
          status: job.status,
          started_at: job.started_at,
          completed_at: job.completed_at,
          failed_at: job.failed_at,
          error_message: job.error_message,
          cpu_usage: job.cpu_usage,
          memory_usage: job.memory_usage,
          fps: job.fps,
          eta: job.eta,
          priority: job.priority,
          worker_id: job.worker_id,
        },
      }));

      const data: VisualData = {
        title: "Transcode Queue",
        subtitle: `${jobs.length} jobs`,
        state: jobs.some((j) => j.status === "processing") ? "loading" : "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Processing",
            value: jobs.filter((j) => j.status === "processing").length,
            unit: "jobs",
          },
          {
            label: "Queued",
            value: jobs.filter((j) => j.status === "queued").length,
            unit: "jobs",
          },
          {
            label: "Completed",
            value: jobs.filter((j) => j.status === "completed").length,
            unit: "jobs",
          },
          {
            label: "Failed",
            value: jobs.filter((j) => j.status === "failed").length,
            unit: "jobs",
          },
        ],
        events: jobs
          .filter((j) => j.started_at)
          .map((j) => ({
            id: j.id,
            at: j.started_at,
            title: j.file_name,
            detail: j.status,
            state: j.status === "processing" ? "loading" : j.status === "completed" ? "healthy" : j.status === "failed" ? "critical" : "warning",
          })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Tdarr:${this.baseUrl}/api/v2/jobs`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Transcode Queue", err, start);
    }
  }

  /**
   * Query: Libraries.
   * Returns VisualData for LibraryOverview component.
   */
  async queryLibraries(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const libraries = await this.fetch<TdarrLibrary[]>("/api/v2/config/libraries");

      const now = new Date().toISOString();

      const visualItems: Item[] = libraries.map((lib) => ({
        id: lib.id,
        label: lib.name,
        subtitle: lib.type,
        image: undefined,
        value: lib.file_count || 0,
        state: lib.enabled ? "healthy" : "warning",
        group: lib.enabled ? "Enabled" : "Disabled",
        meta: {
          type: lib.type,
          path: lib.path,
          enabled: lib.enabled,
          file_count: lib.file_count,
          size: lib.size,
          last_scanned: lib.last_scanned,
        },
      }));

      const data: VisualData = {
        title: "Tdarr Libraries",
        subtitle: `${libraries.length} libraries`,
        state: "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Total Libraries",
            value: libraries.length,
            unit: "libraries",
          },
          {
            label: "Enabled",
            value: libraries.filter((l) => l.enabled).length,
            unit: "libraries",
          },
          {
            label: "Total Files",
            value: libraries.reduce((sum, l) => sum + (l.file_count || 0), 0),
            unit: "files",
          },
          {
            label: "Total Size",
            value: ((libraries.reduce((sum, l) => sum + (l.size || 0), 0) / 1024 / 1024 / 1024)).toFixed(2),
            unit: "GB",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Tdarr:${this.baseUrl}/api/v2/config/libraries`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Libraries", err, start);
    }
  }

  /**
   * Query: Workers.
   * Returns VisualData for WorkerStatus component.
   */
  async queryWorkers(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const workers = await this.fetch<TdarrWorker[]>("/api/v2/workers");

      const now = new Date().toISOString();

      const visualItems: Item[] = workers.map((worker) => ({
        id: worker.id,
        label: worker.name,
        subtitle: worker.status,
        image: undefined,
        value: worker.jobs_completed || 0,
        state: worker.status === "online" ? "healthy" : worker.status === "busy" ? "loading" : "offline",
        group: worker.status,
        meta: {
          status: worker.status,
          cpu_usage: worker.cpu_usage,
          memory_usage: worker.memory_usage,
          current_job_id: worker.current_job_id,
          jobs_completed: worker.jobs_completed,
          jobs_failed: worker.jobs_failed,
          last_active: worker.last_active,
        },
      }));

      const data: VisualData = {
        title: "Tdarr Workers",
        subtitle: `${workers.length} workers`,
        state: workers.every((w) => w.status === "offline") ? "critical" : workers.some((w) => w.status === "online") ? "healthy" : "warning",
        items: visualItems,
        metrics: [
          {
            label: "Online",
            value: workers.filter((w) => w.status === "online").length,
            unit: "workers",
          },
          {
            label: "Busy",
            value: workers.filter((w) => w.status === "busy").length,
            unit: "workers",
          },
          {
            label: "Offline",
            value: workers.filter((w) => w.status === "offline").length,
            unit: "workers",
            state: workers.some((w) => w.status === "offline") ? "warning" : "healthy",
          },
          {
            label: "Jobs Completed",
            value: workers.reduce((sum, w) => sum + (w.jobs_completed || 0), 0),
            unit: "jobs",
          },
          {
            label: "Jobs Failed",
            value: workers.reduce((sum, w) => sum + (w.jobs_failed || 0), 0),
            unit: "jobs",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Tdarr:${this.baseUrl}/api/v2/workers`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Workers", err, start);
    }
  }

  /**
   * Query: Failed jobs.
   * Returns VisualData for FailedJobs component.
   */
  async queryFailedJobs(limit: number = 50): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const jobs = await this.fetch<TdarrJob[]>(`/api/v2/jobs?limit=${limit}`);
      const failedJobs = jobs.filter((j) => j.status === "failed");

      const now = new Date().toISOString();

      const visualItems: Item[] = failedJobs.map((job) => ({
        id: job.id,
        label: job.file_name,
        subtitle: job.file_path.substring(0, 80),
        image: undefined,
        value: job.file_size,
        progress: job.progress / 100,
        state: "critical",
        group: "Failed",
        meta: {
          file_id: job.file_id,
          file_path: job.file_path,
          file_size: job.file_size,
          library_id: job.library_id,
          failed_at: job.failed_at,
          error_message: job.error_message,
          started_at: job.started_at,
        },
      }));

      const data: VisualData = {
        title: "Failed Jobs",
        subtitle: `${failedJobs.length} failed transcodes`,
        state: failedJobs.length > 0 ? "critical" : "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Failed",
            value: failedJobs.length,
            unit: "jobs",
            state: failedJobs.length > 0 ? "critical" : "healthy",
          },
        ],
        events: failedJobs
          .filter((j) => j.failed_at)
          .map((j) => ({
            id: j.id,
            at: j.failed_at!,
            title: j.file_name,
            detail: j.error_message || "Unknown error",
            state: "critical",
          })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Tdarr:${this.baseUrl}/api/v2/jobs`,
          state: failedJobs.length > 0 ? "critical" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Failed Jobs", err, start);
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
        source: `Tdarr:${this.baseUrl}`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}