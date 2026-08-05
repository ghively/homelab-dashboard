/**
 * RomM adapter implementation.
 * Connects to RomM REST API, normalizes responses to VisualData.
 *
 * Endpoints (hypothetical, based on common patterns):
 * - GET /api/roms (all ROMs)
 * - GET /api/platforms (platform collections)
 * - GET /api/status (system status)
 * - GET /api/scan-jobs (scan jobs)
 */

import { proxyImage } from "@/lib/image-proxy";
import type {
  VisualData,
  VisualQueryResult,
  FreshnessInfo,
  Item,
} from "../core/contracts";
import type {
  RommRom,
  RommPlatform,
  RommPlatformCollection,
  RommSystemStatus,
  RommScanJob,
} from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, classifyError, fetchWithTimeout } from "@/lib/adapter-http";

/**
 * Subset of RomM 5.x GET /api/heartbeat — the one endpoint that answers
 * anonymously. It carries the version and the filesystem platform roster, so
 * it is enough for a live, honest "system" panel without a credential.
 */
interface RommHeartbeat {
  SYSTEM?: { VERSION?: string; SHOW_SETUP_WIZARD?: boolean };
  WATCHER?: { ENABLED?: boolean; TITLE?: string };
  SCHEDULER?: Record<string, unknown>;
  FILESYSTEM?: { FS_PLATFORMS?: string[] };
  METADATA_SOURCES?: Record<string, boolean>;
}

/**
 * RomM adapter configuration.
 */
export interface RommConfig {
  baseUrl: string; // e.g., http://localhost:8082
  apiKey?: string; // Optional, if RomM requires authentication
}

/**
 * RomM class.
 */
export class RommAdapter {
  private config: RommConfig;
  private baseUrl: string;

  constructor(config: RommConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  /**
   * Get API headers.
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Accept": "application/json",
    };
    if (this.config.apiKey) {
      headers["X-API-Key"] = this.config.apiKey;
    }
    return headers;
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
      const _status = await this.fetch<RommSystemStatus>("/api/status");
      return {
        timestamp: new Date().toISOString(),
        source: `RomM:${this.baseUrl}/api/status`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `RomM:${this.baseUrl}/api/status`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Query: All ROMs by platform.
   * Returns VisualData for RomWall component.
   */
  async queryRomsByPlatform(platform: RommPlatform, limit: number = 50): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const roms = await this.fetch<RommRom[]>(`/api/roms?platform=${platform}&limit=${limit}`);

      const now = new Date().toISOString();

      const visualItems: Item[] = roms.map((rom) => ({
        id: rom.id.toString(),
        label: rom.name,
        subtitle: rom.region || "Unknown Region",
        image: proxyImage("romm", rom.image_path),
        value: rom.size || 0,
        state: rom.status === "Available" ? "healthy" : rom.status === "Missing" ? "critical" : "warning",
        group: rom.status || "Unknown",
        meta: {
          platform: rom.platform,
          region: rom.region,
          language: rom.language,
          crc32: rom.crc32,
          md5: rom.md5,
          sha1: rom.sha1,
          release_name: rom.release_name,
          filename: rom.filename,
          file_path: rom.file_path,
          developer: rom.metadata?.developer,
          publisher: rom.metadata?.publisher,
          release_date: rom.metadata?.release_date,
          genre: rom.metadata?.genre,
          players: rom.metadata?.players,
          rating: rom.metadata?.rating,
          description: rom.metadata?.description,
          added_date: rom.added_date,
          updated_date: rom.updated_date,
        },
      }));

      const data: VisualData = {
        title: `${platform} ROMs`,
        subtitle: `${roms.length} ROMs available`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total ROMs", value: roms.length, unit: "ROMs" },
          {
            label: "Available",
            value: roms.filter((r) => r.status === "Available").length,
            unit: "ROMs",
          },
          {
            label: "Missing",
            value: roms.filter((r) => r.status === "Missing").length,
            unit: "ROMs",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/roms?platform=${platform}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(`${platform} ROMs`, err, start);
    }
  }

  /**
   * Query: All platforms with collection info.
   * Returns VisualData for PlatformOverview component.
   */
  async queryPlatforms(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const platforms = await this.fetch<RommPlatformCollection[]>("/api/platforms");

      const now = new Date().toISOString();

      const visualItems: Item[] = platforms.map((p) => ({
        id: p.platform,
        label: p.platform,
        subtitle: `${p.available_roms} / ${p.total_roms} ROMs`,
        image: undefined,
        value: p.available_roms,
        state: p.missing_roms === 0 ? "healthy" : p.missing_roms < 10 ? "warning" : "critical",
        progress: p.total_roms > 0 ? p.available_roms / p.total_roms : undefined,
        meta: {
          platform: p.platform,
          total_roms: p.total_roms,
          available_roms: p.available_roms,
          missing_roms: p.missing_roms,
          total_size: p.total_size,
          last_updated: p.last_updated,
        },
      }));

      const data: VisualData = {
        title: "ROM Platforms",
        subtitle: `${platforms.length} platforms`,
        state: "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Total Platforms",
            value: platforms.length,
            unit: "platforms",
          },
          {
            label: "Total ROMs",
            value: platforms.reduce((sum, p) => sum + p.total_roms, 0),
            unit: "ROMs",
          },
          {
            label: "Available",
            value: platforms.reduce((sum, p) => sum + p.available_roms, 0),
            unit: "ROMs",
          },
          {
            label: "Missing",
            value: platforms.reduce((sum, p) => sum + p.missing_roms, 0),
            unit: "ROMs",
          },
          {
            label: "Total Size",
            value: ((platforms.reduce((sum, p) => sum + (p.total_size || 0), 0) / 1024 / 1024 / 1024)).toFixed(2),
            unit: "GB",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/platforms`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("ROM Platforms", err, start);
    }
  }

  /**
   * Query: Heartbeat — the anonymous system panel.
   *
   * This is the default query. /api/status is a 404 on RomM 5.x and
   * /api/platforms is 403 without a key, so a keyless-but-reachable RomM (the
   * common case here) has exactly one live surface: /api/heartbeat. Reading it
   * means the panel shows real version + platform-count data instead of an
   * offline badge for a service that is plainly running.
   */
  async queryHeartbeat(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const hb = await this.fetch<RommHeartbeat>("/api/heartbeat");
      const now = new Date().toISOString();
      const fsPlatforms = hb.FILESYSTEM?.FS_PLATFORMS ?? [];
      const enabledSources = Object.entries(hb.METADATA_SOURCES ?? {}).filter(
        ([k, v]) => v === true && k.endsWith("_ENABLED"),
      ).length;

      const data: VisualData = {
        title: "RomM",
        subtitle: `v${hb.SYSTEM?.VERSION ?? "?"} • ${fsPlatforms.length} platforms on disk`,
        state: "healthy",
        metrics: [
          { label: "Version", value: hb.SYSTEM?.VERSION ?? "unknown", unit: "" },
          { label: "Filesystem Platforms", value: fsPlatforms.length, unit: "" },
          { label: "Watcher", value: hb.WATCHER?.ENABLED ? "on" : "off", unit: "" },
          { label: "Metadata Sources", value: enabledSources, unit: "" },
        ],
        items: fsPlatforms.slice(0, 40).map((p) => ({
          id: `fs:${p}`,
          label: p,
          subtitle: "platform folder",
          state: "healthy" as const,
        })),
        summary: `RomM ${hb.SYSTEM?.VERSION ?? "?"} up with ${fsPlatforms.length} platform folders. ROM counts need an API key (ROMM_API_KEY) — /api/platforms is auth-gated.`,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/heartbeat`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("RomM", err, start);
    }
  }

  /**
   * Query: System status.
   * Returns VisualData for SystemStatus component.
   */
  async querySystemStatus(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const status = await this.fetch<RommSystemStatus>("/api/status");

      const now = new Date().toISOString();

      const data: VisualData = {
        title: "RomM System",
        subtitle: `v${status.version} - ${status.is_scanning ? "Scanning" : "Idle"}`,
        state: status.is_scanning ? "loading" : "healthy",
        metrics: [
          { label: "Version", value: status.version, unit: "" },
          {
            label: "Total ROMs",
            value: status.total_roms,
            unit: "ROMs",
          },
          {
            label: "Platforms",
            value: status.total_platforms,
            unit: "platforms",
          },
          {
            label: "Total Size",
            value: ((status.total_size / 1024 / 1024 / 1024)).toFixed(2),
            unit: "GB",
          },
        ],
        items: [],
        summary: status.last_scan ? `Last scan: ${new Date(status.last_scan).toLocaleString()}` : "No scans performed",
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/status`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("System Status", err, start);
    }
  }

  /**
   * Query: Scan jobs.
   * Returns VisualData for ScanJobs component.
   */
  async queryScanJobs(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const jobs = await this.fetch<RommScanJob[]>("/api/scan-jobs");

      const now = new Date().toISOString();

      const visualItems: Item[] = jobs.map((job) => ({
        id: job.id,
        label: `${job.platform} Scan`,
        subtitle: job.status,
        image: undefined,
        value: job.progress,
        progress: job.progress / 100,
        state: job.status === "running" ? "loading" : job.status === "completed" ? "healthy" : job.status === "failed" ? "critical" : "warning",
        group: job.status,
        meta: {
          platform: job.platform,
          status: job.status,
          progress: job.progress,
          started_at: job.started_at,
          completed_at: job.completed_at,
          roms_processed: job.roms_processed,
          roms_added: job.roms_added,
          roms_updated: job.roms_updated,
          roms_removed: job.roms_removed,
          error_message: job.error_message,
        },
      }));

      const data: VisualData = {
        title: "Scan Jobs",
        subtitle: `${jobs.length} jobs`,
        state: jobs.some((j) => j.status === "running") ? "loading" : "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Running",
            value: jobs.filter((j) => j.status === "running").length,
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
            title: `${j.platform} scan ${j.status}`,
            detail: `${j.roms_processed} ROMs processed`,
            state: j.status === "running" ? "loading" : j.status === "completed" ? "healthy" : "critical",
          })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/scan-jobs`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Scan Jobs", err, start);
    }
  }

  /**
   * Query: Missing ROMs across all platforms.
   * Returns VisualData for MissingRoms component.
   */
  async queryMissingRoms(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const platforms = await this.fetch<RommPlatformCollection[]>("/api/platforms");

      const now = new Date().toISOString();

      const missingItems: Item[] = [];
      let totalMissing = 0;

      for (const platform of platforms) {
        if (platform.missing_roms > 0) {
          missingItems.push({
            id: platform.platform,
            label: platform.platform,
            subtitle: `${platform.missing_roms} missing ROMs`,
            image: undefined,
            value: platform.missing_roms,
            state: "critical",
            meta: {
              platform: platform.platform,
              total_roms: platform.total_roms,
              available_roms: platform.available_roms,
              missing_roms: platform.missing_roms,
            },
          });
          totalMissing += platform.missing_roms;
        }
      }

      const data: VisualData = {
        title: "Missing ROMs",
        subtitle: `${totalMissing} ROMs missing across platforms`,
        state: totalMissing > 0 ? "critical" : "healthy",
        items: missingItems,
        metrics: [
          {
            label: "Missing",
            value: totalMissing,
            unit: "ROMs",
            state: totalMissing > 0 ? "critical" : "healthy",
          },
          {
            label: "Platforms Affected",
            value: missingItems.length,
            unit: "platforms",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/platforms`,
          state: totalMissing > 0 ? "critical" : "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Missing ROMs", err, start);
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
    // Classify so a 403 (RomM is up, it wants a key) renders `denied` and names
    // the fix, rather than the generic `offline` the old code showed for every
    // failure — which read as "the service is down" when it was not.
    const c = classifyError(err);
    return {
      data: {
        title,
        subtitle: c.message,
        state: c.state,
        items: [],
        metrics: [{ label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state }],
        summary:
          c.kind === "unauthorized"
            ? `${title}: RomM requires an API key for this data — set ROMM_API_KEY.`
            : `${title}: ${c.message}`,
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        timestamp: new Date().toISOString(),
        source: `RomM:${this.baseUrl}`,
        state: c.state === "denied" ? "offline" : c.state === "healthy" ? "healthy" : "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}