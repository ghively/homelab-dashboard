/**
 * SABnzbd adapter implementation.
 * Connects to SABnzbd REST API, normalizes responses to VisualData.
 *
 * Endpoints:
 * - GET /api?mode=queue (download queue)
 * - GET /api?mode=history (download history)
 * - GET /api?mode=server_stats (server status/speed)
 * - GET /api?mode=warnings (server warnings)
 */

import type {
  VisualData,
  VisualQueryResult,
  FreshnessInfo,
  Metric,
  Item,
} from "../core/contracts";
import type {
  SabQueue,
  SabHistory,
  SabServerStatus,
  SabQueueSlot,
} from "./types";

/**
 * SABnzbd adapter configuration.
 */
export interface SabnzbdConfig {
  baseUrl: string; // e.g., http://localhost:8080
  apiKey: string; // From 1Password vault "Gregory"
}

/**
 * SABnzbd class.
 */
export class SabnzbdAdapter {
  private config: SabnzbdConfig;
  private baseUrl: string;
  private apiKey: string

  constructor(config: SabnzbdConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  /**
   * Get API URL with parameters.
   */
  private getUrl(mode: string, extraParams: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      mode,
      output: "json",
      apikey: this.apiKey,
      ...extraParams,
    });
    return `${this.baseUrl}/api?${params.toString()}`;
  }

  /**
   * Generic fetch with error handling.
   */
  private async fetch<T>(url: string): Promise<T> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`SABnzbd API error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      throw new Error(`SABnzbd fetch failed: ${err}`);
    }
  }

  /**
   * Health check - fetch server status.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      const _status = await this.fetch<SabServerStatus>(this.getUrl("server_stats"));
      return {
        timestamp: new Date().toISOString(),
        source: `SABnzbd:${this.baseUrl}/api?mode=server_stats`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `SABnzbd:${this.baseUrl}/api?mode=server_stats`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Query: Download queue.
   * Returns VisualData for Queue component.
   */
  async queryQueue(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const queue = await this.fetch<SabQueue>(this.getUrl("queue"));

      const now = new Date().toISOString();

      // SABnzbd returns queue entries under `slots`, not `jobs`, and every
      // number as a string. Reading `jobs` made this throw on every call.
      const slots = queue.queue.slots ?? [];

      const visualItems: Item[] = slots.map((item: SabQueueSlot, idx: number) => ({
        id: item.nzo_id ?? `slot-${idx}`,
        label: item.filename ?? "unknown",
        subtitle: item.cat || "Uncategorized",
        value: item.mb ?? 0,
        ...(item.percentage != null ? { progress: item.percentage / 100 } : {}),
        state:
          item.status === "Downloading"
            ? ("loading" as const)
            : item.status === "Completed"
              ? ("healthy" as const)
              : item.status === "Failed"
                ? ("critical" as const)
                : ("warning" as const),
        group: item.status ?? "queued",
        meta: {
          mbleft: item.mbleft,
          mb: item.mb,
          percentage: item.percentage,
          timeleft: item.timeleft,
          priority: item.priority,
          size: item.size,
        },
      }));

      const data: VisualData = {
        title: "Download Queue",
        subtitle: `${queue.queue.noofslots ?? slots.length} items in queue`,
        state: (queue.queue.noofslots ?? slots.length) > 0 ? "loading" : "empty",
        items: visualItems,
        metrics: [
          { label: "In Queue", value: queue.queue.noofslots ?? slots.length, unit: "items" },
          {
            label: "Downloading",
            value: slots.filter((j) => j.status === "Downloading").length,
            unit: "items",
          },
          {
            label: "Completed",
            value: slots.filter((j) => j.status === "Completed").length,
            unit: "items",
          },
          {
            label: "Failed",
            value: slots.filter((j) => j.status === "Failed").length,
            unit: "items",
          },
          {
            label: "Speed",
            value: queue.queue.kbpersec ?? 0,
            unit: "KB/s",
          },
          {
            label: "Size Left",
            value: ((queue.queue.mbleft ?? 0) / 1024).toFixed(2),
            unit: "GB",
          },
        ],
        events: [],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `SABnzbd:${this.baseUrl}/api?mode=queue`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Download Queue", err, start);
    }
  }

  /**
   * Query: Download history.
   * Returns VisualData for History component.
   */
  async queryHistory(limit: number = 50): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const history = await this.fetch<SabHistory>(this.getUrl("history", { limit: limit.toString() }));

      const now = new Date().toISOString();

      const visualItems: Item[] = history.history.slots.slice(0, limit).map((item) => ({
        id: item.id,
        label: item.filename,
        subtitle: item.category || "Uncategorized",
        image: undefined,
        value: item.mb,
        progress: 1, // All history items are complete
        state: item.status === "Completed" || item.status === "Verified" ? "healthy" : item.status === "Failed" ? "critical" : "warning",
        group: item.status,
        meta: {
          mb: item.mb,
          bytes: item.bytes,
          size: item.size,
          sizemb: item.sizemb,
          status: item.status,
          fail_message: item.fail_message,
          path: item.path,
          storage: item.storage,
          completed: item.completed,
          download_time: item.download_time,
          postproc_time: item.postproc_time,
          total_time: item.total_time,
          nzo_id: item.nzo_id,
          type: item.type,
        },
      }));

      const data: VisualData = {
        title: "Download History",
        subtitle: `${history.history.slots.length} recent downloads`,
        state: "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Completed",
            value: history.history.slots.filter((s) => s.status === "Completed" || s.status === "Verified").length,
            unit: "items",
          },
          {
            label: "Failed",
            value: history.history.slots.filter((s) => s.status === "Failed").length,
            unit: "items",
          },
        ],
        events: history.history.slots
          .filter((s) => s.completed)
          .map((s) => ({
            id: s.id,
            at: new Date(s.completed! * 1000).toISOString(),
            title: s.filename,
            detail: s.status,
            state: s.status === "Completed" || s.status === "Verified" ? "healthy" : "critical",
          })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `SABnzbd:${this.baseUrl}/api?mode=history`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Download History", err, start);
    }
  }

  /**
   * Query: Server status and speed.
   * Returns VisualData for ServerStatus component.
   */
  async queryServerStatus(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const status = await this.fetch<SabServerStatus>(this.getUrl("server_stats"));

      const now = new Date().toISOString();

      const metrics: Metric[] = [
        {
          label: "Current Speed",
          value: status.speedlimit_abs > 0 ? Math.min(status.speedlimit_abs, status.speedlimit) : status.speedlimit,
          unit: "KB/s",
          state: "healthy",
        },
        {
          label: "Speed Limit",
          value: status.speedlimit,
          unit: "KB/s",
        },
        {
          label: "Completed",
          value: status.completed,
          unit: "downloads",
        },
      ];

      // Add disk space metrics if available
      if (status.disk_size_free !== undefined && status.disk_size_total !== undefined) {
        const freeGB = parseFloat(status.disk_size_free);
        const totalGB = parseFloat(status.disk_size_total);
        const percentage = (freeGB / totalGB) * 100;

        metrics.push({
          label: "Disk Free",
          value: freeGB.toFixed(2),
          unit: "GB",
          state: percentage < 10 ? "critical" : percentage < 20 ? "warning" : "healthy",
        });

        metrics.push({
          label: "Disk Total",
          value: totalGB.toFixed(2),
          unit: "GB",
        });
      }

      const data: VisualData = {
        title: "SABnzbd Server",
        subtitle: `v${status.version} - ${status.paused ? "Paused" : "Active"}`,
        state: status.paused ? "warning" : "healthy",
        metrics,
        items: [],
        summary: `Uptime: ${status.uptime || "Unknown"}`,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `SABnzbd:${this.baseUrl}/api?mode=server_stats`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Server Status", err, start);
    }
  }

  /**
   * Query: Server warnings.
   * Returns VisualData for Warnings component.
   */
  async queryWarnings(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const warnings = await this.fetch<{ warnings: Array<{ type: string; text: string }> }>(this.getUrl("warnings"));

      const now = new Date().toISOString();

      const visualItems: Item[] = warnings.warnings.map((w, i) => ({
        id: `warning-${i}`,
        label: w.type,
        subtitle: w.text.substring(0, 100),
        image: undefined,
        state: "critical",
        meta: {
          text: w.text,
        },
      }));

      const data: VisualData = {
        title: "Server Warnings",
        subtitle: `${warnings.warnings.length} warnings`,
        state: warnings.warnings.length > 0 ? "critical" : "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Warnings",
            value: warnings.warnings.length,
            unit: "total",
            state: warnings.warnings.length > 0 ? "critical" : "healthy",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `SABnzbd:${this.baseUrl}/api?mode=warnings`,
          state: warnings.warnings.length > 0 ? "critical" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Server Warnings", err, start);
    }
  }

  /**
   * Query: Current download speed.
   * Returns VisualData for SpeedMetrics component.
   */
  async querySpeed(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const queue = await this.fetch<SabQueue>(this.getUrl("queue"));

      const now = new Date().toISOString();

      const data: VisualData = {
        title: "Current Speed",
        subtitle: `${queue.queue.noofslots ?? 0} items in queue`,
        state: "healthy",
        metrics: [
          {
            label: "Speed",
            value: queue.queue.kbpersec ?? 0,
            unit: "KB/s",
            state: (queue.queue.kbpersec ?? 0) > 0 ? "healthy" : "empty",
          },
          {
            label: "Size Left",
            value: ((queue.queue.mbleft ?? 0) / 1024).toFixed(2),
            unit: "GB",
          },
          {
            label: "Total Size",
            value: ((queue.queue.mb ?? 0) / 1024).toFixed(2),
            unit: "GB",
          },
          {
            // SABnzbd reports remaining time per slot (`timeleft`), not as a
            // queue-level `eta` — that field does not exist in the response.
            label: "Time Left",
            value: queue.queue.slots?.[0]?.timeleft ?? "—",
            unit: "",
          },
        ],
        items: [],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `SABnzbd:${this.baseUrl}/api?mode=queue`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Current Speed", err, start);
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
        source: `SABnzbd:${this.baseUrl}`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}