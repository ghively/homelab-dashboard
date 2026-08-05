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
  SonarrLookupResult,
} from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, classifyError, fetchWithTimeout } from "@/lib/adapter-http";

/**
 * Where new series land and at what quality/language — verified live against
 * this instance: only one of the three registered root folders is actually
 * accessible, and qualityProfileId 7 is what the large majority of existing
 * series already use (190 of 260). languageProfileId 1 is the only profile
 * that exists on this instance at all (Sonarr v3's one deprecated default).
 */
const DEFAULT_ROOT_FOLDER = "/volume2/Media/TV";
const DEFAULT_QUALITY_PROFILE_ID = 7;
const DEFAULT_LANGUAGE_PROFILE_ID = 1;

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
   * POST with a JSON body — used by mutations (e.g. /api/v3/command to
   * trigger a search). Sonarr's command endpoint returns a command status
   * object; callers that only care about "did the request succeed" can
   * ignore the body.
   */
  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetchWithTimeout(
      url,
      { method: "POST", headers: { ...this.getHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) },
      ADAPTER_TIMEOUT_MS,
    );
    if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
    return (await res.json()) as T;
  }

  /** DELETE with no body — used by mutations (e.g. removing a queue item). */
  private async del(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetchWithTimeout(url, { method: "DELETE", headers: this.getHeaders() }, ADAPTER_TIMEOUT_MS);
    if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
  }

  /**
   * Series id -> full series record, for joining against /api/v3/wanted/missing
   * (a flat episode record with no genre/poster/rating of its own — that data
   * only exists on the series). Not cached across calls: a wanted-list query
   * is already two requests either way, and series data can change between
   * calls (newly added/removed series), so refetching keeps it correct.
   */
  private async seriesLookup(): Promise<Map<number, SonarrSeries>> {
    const series = await this.fetch<SonarrSeries[]>("/api/v3/series");
    return new Map(series.map((s) => [s.id, s]));
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
          rating: s.ratings?.value,
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
      const [response, seriesById] = await Promise.all([
        this.fetch<{ page: number; pageSize: number; totalRecords: number; records: SonarrWantedItem[] }>("/api/v3/wanted/missing?pageSize=50"),
        this.seriesLookup(),
      ]);
      const wanted = response.records;

      const now = new Date().toISOString();

      const visualItems: Item[] = wanted.map((item) => {
        const series = seriesById.get(item.seriesId);
        return {
          id: item.id.toString(),
          label: series?.title ?? "Unknown Series",
          subtitle: `S${item.seasonNumber}E${item.episodeNumber}`,
          image: proxyImage("sonarr", series?.images?.find((img) => img.coverType === "poster")?.url),
          state: "critical",
          group: item.airDate,
          meta: {
            episodeId: item.id,
            seriesId: item.seriesId,
            airDate: item.airDate,
            episodeTitle: item.title,
          },
        };
      });

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
   * Query: Missing episodes in one genre — the "you could download this"
   * half of a TV content-discovery answer (paired with Emby's by-genre for
   * "available now"). Mirrors Radarr's queryWantedByGenre: these are shows
   * Sonarr already tracks and will grab automatically; this does not
   * discover series Sonarr has never heard of. Filtered client-side —
   * /api/v3/wanted/missing has no genre param, and (unlike Radarr, whose
   * wanted/missing IS a full movie record) this is a flat EPISODE record
   * with no genre data of its own — genres only exist on the series, so this
   * joins against /api/v3/series by seriesId via seriesLookup().
   */
  async queryWantedByGenre(genreInput: string): Promise<VisualQueryResult> {
    const start = Date.now();
    const label = genreInput ? `${genreInput} — Could Download` : "Could Download";
    // Comma-separated = ALL must match (a compound ask like "horror
    // comedy" -> "Horror,Comedy") — see Emby's queryByGenre for why this
    // needs to be AND, not OR: a single combined genre string like "Horror
    // Comedy" is not a real tag anywhere, so it always matched nothing.
    const requiredGenres = genreInput.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean);
    try {
      const [response, seriesById] = await Promise.all([
        this.fetch<{ page: number; pageSize: number; totalRecords: number; records: SonarrWantedItem[] }>("/api/v3/wanted/missing?pageSize=200"),
        this.seriesLookup(),
      ]);
      const wanted = requiredGenres.length
        ? response.records.filter((item) => {
            const itemGenres = (seriesById.get(item.seriesId)?.genres ?? []).map((g) => g.toLowerCase());
            return requiredGenres.every((r) => itemGenres.includes(r));
          })
        : response.records;

      const now = new Date().toISOString();

      // "warning", not "critical" — this is a discovery list (things you
      // could grab), not an alert about missing library content.
      const visualItems: Item[] = wanted.slice(0, 24).map((item) => {
        const series = seriesById.get(item.seriesId);
        return {
          id: item.id.toString(),
          label: series?.title ?? "Unknown Series",
          subtitle: `S${item.seasonNumber}E${item.episodeNumber}`,
          image: proxyImage("sonarr", series?.images?.find((img) => img.coverType === "poster")?.url),
          state: "warning",
          meta: {
            seriesId: item.seriesId,
            episodeId: item.id,
            episodeTitle: item.title,
            airDate: item.airDate,
            genres: series?.genres,
            overview: series?.overview,
            network: series?.network,
            rating: series?.ratings?.value,
          },
        };
      });

      const data: VisualData = {
        title: label,
        subtitle: `${wanted.length} episodes tracked but not yet downloaded`,
        state: wanted.length > 0 ? "warning" : "empty",
        items: visualItems,
        metrics: [{ label: "Could Download", value: wanted.length, unit: "episodes" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/wanted/missing`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
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
        // sizeleft === 0 means the download is complete — `item.sizeleft ? …`
        // treated that as falsy and dropped the progress bar right at 100%.
        progress: typeof item.sizeleft === "number" && item.size ? 1 - item.sizeleft / item.size : undefined,
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
   * Query: title lookup against Sonarr's own metadata source (TheTVDB) — for
   * a series Sonarr may have never heard of, the "could I add this" half of
   * a download conversation. Distinct from queryWantedByGenre, which only
   * covers series Sonarr already tracks. Capped to 8, same as Radarr's
   * lookupMovie.
   */
  async lookupSeries(term: string): Promise<VisualQueryResult> {
    const start = Date.now();
    const label = term ? `"${term}" — Lookup` : "Series Lookup";
    try {
      const results = await this.fetch<SonarrLookupResult[]>(`/api/v3/series/lookup?term=${encodeURIComponent(term)}`);
      const now = new Date().toISOString();

      const visualItems: Item[] = results.slice(0, 8).map((r) => ({
        id: r.tvdbId.toString(),
        label: r.title,
        subtitle: r.year?.toString(),
        image: r.remotePoster,
        state: "healthy",
        meta: {
          tvdbId: r.tvdbId,
          year: r.year,
          overview: r.overview,
          genres: r.genres,
          runtime: r.runtime,
          network: r.network,
          certification: r.certification,
          rating: r.ratings?.value,
        },
      }));

      const data: VisualData = {
        title: label,
        subtitle: `${results.length} match${results.length === 1 ? "" : "es"}`,
        state: results.length > 0 ? "healthy" : "empty",
        items: visualItems,
        metrics: [{ label: "Matches", value: results.length, unit: "" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Sonarr:${this.baseUrl}/api/v3/series/lookup?term=${encodeURIComponent(term)}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
    }
  }

  /**
   * Mutation: add a series Sonarr doesn't track yet, and start searching for
   * missing episodes — the real "download this" action, not just
   * re-searching an episode of something already monitored (searchEpisode()).
   * Re-looks-up by tvdbId (rather than trusting a client-supplied metadata
   * blob) so the object Sonarr gets back is always its own canonical shape.
   */
  async addSeries(tvdbId: number, title: string, year: number): Promise<{ success: boolean; message: string }> {
    try {
      const matches = await this.fetch<SonarrLookupResult[]>(`/api/v3/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`);
      const match = matches[0];
      if (!match) throw new Error(`No Sonarr metadata found for tvdbId ${tvdbId}.`);
      await this.post("/api/v3/series", {
        ...match,
        qualityProfileId: DEFAULT_QUALITY_PROFILE_ID,
        languageProfileId: DEFAULT_LANGUAGE_PROFILE_ID,
        rootFolderPath: DEFAULT_ROOT_FOLDER,
        monitored: true,
        seasonFolder: true,
        addOptions: { searchForMissingEpisodes: true },
      });
      return { success: true, message: `Added "${title}" (${year}) and started searching.` };
    } catch (err) {
      const c = classifyError(err);
      return { success: false, message: `Could not add "${title}": ${c.message}` };
    }
  }

  /**
   * Mutation: trigger a search for one missing episode. Idempotent and fully
   * safe — it only asks Sonarr's indexers to look again, it does not grab or
   * download anything on its own authority.
   */
  async searchEpisode(episodeId: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.post("/api/v3/command", { name: "EpisodeSearch", episodeIds: [episodeId] });
      return { success: true, message: `Search triggered for episode ${episodeId}.` };
    } catch (err) {
      const c = classifyError(err);
      return { success: false, message: `Could not trigger search: ${c.message}` };
    }
  }

  /**
   * Mutation: remove a stuck/unwanted item from the download queue.
   * Reversible in the sense that the episode stays monitored and searchable
   * again — this does not un-monitor or delete anything else.
   */
  async removeQueueItem(queueId: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.del(`/api/v3/queue/${queueId}?removeFromClient=true&blocklist=false`);
      return { success: true, message: `Removed queue item ${queueId}.` };
    } catch (err) {
      const c = classifyError(err);
      return { success: false, message: `Could not remove queue item: ${c.message}` };
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
    // Classify so a 401/403 (Sonarr is up, the API key is wrong) renders
    // `denied` and names the fix, rather than the generic `offline` that
    // reads as "the service is down" for every failure regardless of cause.
    const c = classifyError(err);
    return {
      data: {
        title,
        subtitle: c.message,
        state: c.state,
        items: [],
        metrics: [{ label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state }],
        updatedAt: new Date().toISOString(),
      },
      freshness: {
        timestamp: new Date().toISOString(),
        source: `Sonarr:${this.baseUrl}`,
        state: c.state === "healthy" ? "healthy" : "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}