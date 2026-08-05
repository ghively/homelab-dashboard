/**
 * RomM adapter implementation.
 * Connects to RomM REST API, normalizes responses to VisualData.
 *
 * Endpoints (verified against the live instance's own /openapi.json — RomM is
 * FastAPI, that endpoint is unauthenticated, so the real shape is checkable
 * without ROMM_API_KEY):
 * - GET /api/heartbeat (anonymous; version + filesystem platform roster)
 * - GET /api/roms (paginated {items,total,limit,offset}; platform_ids/genres/
 *   search_term/missing filters — all auth-gated)
 * - GET /api/platforms (bare array; auth-gated)
 * - GET /api/stats (system-wide counts; auth-gated)
 * - GET /api/tasks (scheduled maintenance tasks, not a scan-job history —
 *   RomM has no REST endpoint for that; live scan progress is websocket-only)
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
  RommRomsPage,
  RommPlatformItem,
  RommStats,
  RommTask,
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

/** Filters accepted by queryRoms(), forwarded from Query()'s `filters` arg. */
export interface RommRomFilters {
  genre?: string;
  search?: string;
  missing?: boolean;
  platformId?: number;
  limit?: number;
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
   * Health check. /api/status does not exist on this API (verified against
   * /openapi.json) — /api/heartbeat is the only anonymous, always-reachable
   * endpoint, so it is the honest thing to probe.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      await this.fetch<RommHeartbeat>("/api/heartbeat");
      return {
        timestamp: new Date().toISOString(),
        source: `RomM:${this.baseUrl}/api/heartbeat`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `RomM:${this.baseUrl}/api/heartbeat`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /** One rom's cover — prefer RomM's own proxied resource path over the raw
   *  external CDN url_cover, which points at a third-party host outside the
   *  four services image-proxy.ts knows how to authenticate/re-host. */
  private romImage(rom: RommRom): string | undefined {
    return proxyImage("romm", rom.path_cover_large || rom.path_cover_small || undefined) ?? rom.url_cover ?? undefined;
  }

  /**
   * Query: ROMs — filterable browse/search, the actual "show me the games"
   * view. Requires ROMM_API_KEY (/api/roms 403s without one, same as
   * /api/platforms). Replaces the old queryRomsByPlatform(), which required a
   * RommPlatform *name* string ("NES", "SNES", …) — the real API takes
   * `platform_ids` (integers, looked up from /api/platforms), so that method
   * could never have produced a working request even with a key configured.
   */
  async queryRoms(filters: RommRomFilters = {}): Promise<VisualQueryResult> {
    const start = Date.now();
    const { genre, search, missing, platformId, limit = 24 } = filters;
    const params = new URLSearchParams({ limit: String(Math.min(limit, 100)) });
    if (genre) params.append("genres", genre);
    if (search) params.set("search_term", search);
    if (missing != null) params.set("missing", String(missing));
    if (platformId != null) params.append("platform_ids", String(platformId));
    const label = genre ? `${genre} ROMs` : search ? `"${search}"` : missing ? "Missing ROMs" : "ROMs";

    try {
      const page = await this.fetch<RommRomsPage>(`/api/roms?${params}`);
      const now = new Date().toISOString();

      const visualItems: Item[] = page.items.map((rom) => ({
        id: rom.id.toString(),
        label: rom.name || rom.fs_name_no_tags || rom.fs_name,
        subtitle: [rom.platform_display_name, rom.regions?.[0]].filter(Boolean).join(" · ") || undefined,
        image: this.romImage(rom),
        value: rom.fs_size_bytes,
        state: rom.missing_from_fs ? "critical" : "healthy",
        group: rom.platform_display_name,
        meta: {
          platform: rom.platform_display_name,
          regions: rom.regions,
          languages: rom.languages,
          tags: rom.tags,
          crc32: rom.crc_hash,
          md5: rom.md5_hash,
          sha1: rom.sha1_hash,
          filename: rom.fs_name,
          summary: rom.summary,
          sizeBytes: rom.fs_size_bytes,
          missingFromDisk: rom.missing_from_fs,
        },
      }));

      const data: VisualData = {
        title: label,
        subtitle: `${page.total} ROM${page.total === 1 ? "" : "s"}${page.total > page.items.length ? ` (showing ${page.items.length})` : ""}`,
        state: "healthy",
        items: visualItems,
        metrics: [{ label: "Total", value: page.total, unit: "ROMs" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/roms?${params}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
    }
  }

  /**
   * Query: All platforms with rom counts.
   * Returns VisualData for PlatformOverview component.
   */
  async queryPlatforms(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const platforms = await this.fetch<RommPlatformItem[]>("/api/platforms");

      const now = new Date().toISOString();

      const visualItems: Item[] = platforms.map((p) => ({
        id: String(p.id),
        label: p.display_name || p.name,
        subtitle: `${p.rom_count} ROMs`,
        value: p.rom_count,
        state: "healthy",
        meta: {
          slug: p.slug,
          fsSlug: p.fs_slug,
          romCount: p.rom_count,
          firmwareCount: p.firmware_count,
        },
      }));

      const data: VisualData = {
        title: "ROM Platforms",
        subtitle: `${platforms.length} platforms`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Platforms", value: platforms.length, unit: "" },
          { label: "Total ROMs", value: platforms.reduce((sum, p) => sum + p.rom_count, 0), unit: "ROMs" },
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
        summary: `RomM ${hb.SYSTEM?.VERSION ?? "?"} up with ${fsPlatforms.length} platform folders. ROM browsing and cover art need an API key (ROMM_API_KEY) — /api/roms and /api/platforms are auth-gated.`,
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
   * Query: System-wide stats (rom/save/state/screenshot counts, total size).
   * Returns VisualData for a MetricStrip. Replaces the old "System Status"
   * view, which read `.version`/`.is_scanning`/`.total_roms` etc. from
   * /api/status — an endpoint that does not exist on this API.
   */
  async queryStats(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const stats = await this.fetch<RommStats>("/api/stats");

      const now = new Date().toISOString();

      const data: VisualData = {
        title: "RomM Library",
        subtitle: `${stats.ROMS} ROMs across ${stats.PLATFORMS} platforms`,
        state: "healthy",
        metrics: [
          { label: "Platforms", value: stats.PLATFORMS, unit: "" },
          { label: "ROMs", value: stats.ROMS, unit: "" },
          { label: "Saves", value: stats.SAVES, unit: "" },
          { label: "States", value: stats.STATES, unit: "" },
          { label: "Screenshots", value: stats.SCREENSHOTS, unit: "" },
          { label: "Total Size", value: (stats.TOTAL_FILESIZE_BYTES / 1024 / 1024 / 1024).toFixed(1), unit: "GB" },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/stats`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("RomM Library", err, start);
    }
  }

  /**
   * Query: Scheduled maintenance tasks (library scan, metadata refresh, …).
   * Returns VisualData for VisualTable. Replaces the old "Scan Jobs" view,
   * which invented a job-history/progress concept (roms_processed, a percent
   * progress bar) against /api/scan-jobs — an endpoint that does not exist.
   * RomM's real /api/tasks is a schedule (enabled + cron), not a run history;
   * live scan progress is pushed over a websocket the REST API has no view
   * into, so a progress bar here would still be fabricated.
   */
  async queryTasks(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const groups = await this.fetch<Record<string, RommTask[]>>("/api/tasks");
      const tasks = Object.values(groups).flat();

      const now = new Date().toISOString();

      const visualItems: Item[] = tasks.map((t) => ({
        id: t.name,
        label: t.title || t.name,
        subtitle: t.cron_string ? `cron: ${t.cron_string}` : t.description,
        state: t.enabled ? "healthy" : "empty",
        group: t.enabled ? "enabled" : "disabled",
        meta: {
          name: t.name,
          type: t.type,
          description: t.description,
          enabled: t.enabled,
          cronString: t.cron_string,
          manualRun: t.manual_run,
        },
      }));

      const enabledCount = tasks.filter((t) => t.enabled).length;

      const data: VisualData = {
        title: "Scheduled Tasks",
        subtitle: `${enabledCount}/${tasks.length} enabled`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Tasks", value: tasks.length, unit: "" },
          { label: "Enabled", value: enabledCount, unit: "" },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `RomM:${this.baseUrl}/api/tasks`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Scheduled Tasks", err, start);
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
