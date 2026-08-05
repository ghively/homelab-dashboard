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

import { proxyImage } from "@/lib/image-proxy";
import type {
  VisualData,
  VisualQueryResult,
  FreshnessInfo,
  Metric,
  Item,
} from "../core/contracts";
import type {
  RadarrMovie,
  RadarrQueueItem,
  RadarrWantedItem,
  RadarrCalendarItem,
  RadarrSystemStatus,
  RadarrDiskSpace,
  RadarrLookupResult,
} from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, classifyError, fetchWithTimeout } from "@/lib/adapter-http";

/**
 * Radarr's `ratings` is keyed per provider (tmdb/imdb/rottenTomatoes/…), not
 * a flat {votes, value} — verified against the live instance. Prefer tmdb
 * (Radarr's own primary metadata source) and fall back to whatever else is
 * present, rather than showing nothing because tmdb specifically is unrated.
 */
function bestRating(ratings: RadarrMovie["ratings"]): number | undefined {
  if (!ratings) return undefined;
  return ratings.tmdb?.value ?? Object.values(ratings).find((r) => r?.value != null)?.value;
}

/** youTubeTrailerId -> a real playable link, when Radarr's metadata has one. */
function trailerUrl(id: string | undefined): string | undefined {
  return id ? `https://www.youtube.com/watch?v=${id}` : undefined;
}

/**
 * Where new movies land and at what quality — verified live against this
 * instance: /api/v3/rootfolder returns exactly one accessible path, and
 * qualityProfileId 7 is what every existing movie in the library actually
 * uses (529 of 533). Not user-configurable from the model (no UI here to
 * pick a profile) — this mirrors "the one root folder / the profile everyone
 * else already uses", not a guess.
 */
const DEFAULT_ROOT_FOLDER = "/volume2/Media/Movies";
const DEFAULT_QUALITY_PROFILE_ID = 7;

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
   * trigger a search). Radarr's command endpoint returns a command status
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
   * Health check - fetch system status.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      const _status = await this.fetch<RadarrSystemStatus>("/api/v3/system/status");
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
        image: proxyImage("radarr", m.images?.find((img) => img.coverType === "poster")?.url),
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
          rating: bestRating(m.ratings),
          trailerUrl: trailerUrl(m.youTubeTrailerId),
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
        updatedAt: now,
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
        label: item.title,
        subtitle: item.year?.toString(),
        image: proxyImage("radarr", item.images?.find((img) => img.coverType === "poster")?.url),
        state: "critical",
        group: item.digitalRelease || item.physicalRelease || "Unknown",
        meta: {
          movieId: item.id,
          inCinemas: item.inCinemas,
          physicalRelease: item.physicalRelease,
          digitalRelease: item.digitalRelease,
          genres: item.genres,
          overview: item.overview,
          rating: bestRating(item.ratings),
          studio: item.studio,
          trailerUrl: trailerUrl(item.youTubeTrailerId),
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
        updatedAt: now,
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
   * Query: Wanted/missing movies in one genre — the "you could download this"
   * half of a content-discovery answer (paired with Emby's by-genre for
   * "available now"). These are movies Radarr already tracks and will grab
   * automatically once found; this does not discover titles Radarr has never
   * heard of (that needs a movie lookup against TMDB, a separate capability).
   * Filtered client-side: /api/v3/wanted/missing has no genre query param, but
   * `genres` is already present on every record it returns (it IS a full
   * movie record, not a wrapper around one — see RadarrWantedItemSchema).
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
      const response = await this.fetch<{ page: number; pageSize: number; totalRecords: number; records: RadarrWantedItem[] }>("/api/v3/wanted/missing?pageSize=200");
      const wanted = requiredGenres.length
        ? response.records.filter((item) => {
            const itemGenres = (item.genres ?? []).map((g) => g.toLowerCase());
            return requiredGenres.every((r) => itemGenres.includes(r));
          })
        : response.records;

      const now = new Date().toISOString();

      // "warning", not "critical" — this is a discovery list (things you
      // could grab), not an alert about missing library content.
      const visualItems: Item[] = wanted.slice(0, 24).map((item) => ({
        id: item.id.toString(),
        label: item.title,
        subtitle: item.year?.toString(),
        image: proxyImage("radarr", item.images?.find((img) => img.coverType === "poster")?.url),
        state: "warning",
        meta: {
          movieId: item.id,
          genres: item.genres,
          overview: item.overview,
          rating: bestRating(item.ratings),
          studio: item.studio,
          inCinemas: item.inCinemas,
          physicalRelease: item.physicalRelease,
          digitalRelease: item.digitalRelease,
          trailerUrl: trailerUrl(item.youTubeTrailerId),
        },
      }));

      const data: VisualData = {
        title: label,
        subtitle: `${wanted.length} tracked but not yet downloaded`,
        state: wanted.length > 0 ? "warning" : "empty",
        items: visualItems,
        metrics: [{ label: "Could Download", value: wanted.length, unit: "movies" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Radarr:${this.baseUrl}/api/v3/wanted/missing`,
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
      const response = await this.fetch<{ page: number; pageSize: number; totalRecords: number; records: RadarrQueueItem[] }>("/api/v3/queue?pageSize=50");
      const queue = response.records;

      const now = new Date().toISOString();

      const visualItems: Item[] = queue.map((item) => ({
        id: item.id.toString(),
        label: item.title,
        subtitle: item.movie?.title,
        image: proxyImage("radarr", item.movie?.images?.find((img) => img.coverType === "poster")?.url),
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
            title: q.movie?.title || "Unknown Movie",
            detail: q.status,
            state: q.status === "downloading" ? "loading" : q.status === "completed" ? "healthy" : "warning",
          })),
        updatedAt: now,
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
        image: proxyImage("radarr", item.images?.find((img) => img.coverType === "poster")?.url),
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
        updatedAt: now,
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
        updatedAt: now,
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
   * Query: title lookup against Radarr's own metadata source (TMDB) — for a
   * movie Radarr may have never heard of, the "could I add this" half of a
   * download conversation. Distinct from queryWantedByGenre, which only
   * covers movies Radarr already tracks. Capped to 8 — this is meant to back
   * a handful of MediaTiles, not another full browse wall.
   */
  async lookupMovie(term: string): Promise<VisualQueryResult> {
    const start = Date.now();
    const label = term ? `"${term}" — Lookup` : "Movie Lookup";
    try {
      const results = await this.fetch<RadarrLookupResult[]>(`/api/v3/movie/lookup?term=${encodeURIComponent(term)}`);
      const now = new Date().toISOString();

      const visualItems: Item[] = results.slice(0, 8).map((r) => ({
        id: r.tmdbId.toString(),
        label: r.title,
        subtitle: r.year?.toString(),
        // remotePoster is an absolute TMDB CDN URL — not proxied, it needs no
        // auth and doesn't live behind Radarr's own host the way an already-
        // added movie's images[].url does.
        image: r.remotePoster,
        state: "healthy",
        meta: {
          tmdbId: r.tmdbId,
          year: r.year,
          overview: r.overview,
          genres: r.genres,
          runtime: r.runtime,
          studio: r.studio,
          certification: r.certification,
          rating: bestRating(r.ratings),
          trailerUrl: trailerUrl(r.youTubeTrailerId),
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
          source: `Radarr:${this.baseUrl}/api/v3/movie/lookup?term=${encodeURIComponent(term)}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
    }
  }

  /**
   * Mutation: add a movie Radarr doesn't track yet, and start searching for
   * it — the real "download this" action, not just re-searching something
   * already monitored (that's searchMovie()). Re-looks-up by tmdbId (rather
   * than trusting a client-supplied metadata blob) so the object Radarr gets
   * back is always its own canonical shape, then adds the two fields only
   * the add call needs: which quality profile and which root folder.
   */
  async addMovie(tmdbId: number, title: string, year: number): Promise<{ success: boolean; message: string }> {
    try {
      const match = await this.fetch<RadarrLookupResult>(`/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`);
      await this.post("/api/v3/movie", {
        ...match,
        qualityProfileId: DEFAULT_QUALITY_PROFILE_ID,
        rootFolderPath: DEFAULT_ROOT_FOLDER,
        monitored: true,
        addOptions: { searchForMovie: true },
      });
      return { success: true, message: `Added "${title}" (${year}) and started searching.` };
    } catch (err) {
      const c = classifyError(err);
      return { success: false, message: `Could not add "${title}": ${c.message}` };
    }
  }

  /**
   * Mutation: trigger a search for one movie (e.g. a wanted/missing item).
   * Idempotent and fully safe — it only asks Radarr's indexers to look again,
   * it does not grab or download anything on its own authority.
   */
  async searchMovie(movieId: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.post("/api/v3/command", { name: "MoviesSearch", movieIds: [movieId] });
      return { success: true, message: `Search triggered for movie ${movieId}.` };
    } catch (err) {
      const c = classifyError(err);
      return { success: false, message: `Could not trigger search: ${c.message}` };
    }
  }

  /**
   * Mutation: remove a stuck/unwanted item from the download queue.
   * Reversible in the sense that the movie stays monitored and searchable
   * again — this does not un-monitor or delete the movie itself.
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
    // Classify so a 401/403 (Radarr is up, the API key is wrong) renders
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
        source: `Radarr:${this.baseUrl}`,
        state: c.state === "healthy" ? "healthy" : "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}