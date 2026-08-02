/**
 * Emby adapter implementation.
 * Connects to Emby REST API, normalizes responses to VisualData.
 *
 * Endpoints:
 * - GET /Items (items by library)
 * - GET /Sessions (active playback sessions)
 * - GET /Users/{id}/Items/Resume (continue watching)
 * - GET /Library/MediaFolders (libraries)
 * - GET /ScheduledTasks (scheduled tasks)
 * - GET /System/Info (server info)
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
  EmbyItem,
  EmbyLibrary,
  EmbySession,
  EmbyServerInfo,
} from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, fetchWithTimeout } from "@/lib/adapter-http";

/**
 * Emby adapter configuration.
 */
export interface EmbyConfig {
  baseUrl: string; // e.g., http://gh-media:8096
  apiKey: string; // From 1Password vault "Gregory"
  userId?: string; // Optional, for user-specific queries
}

/**
 * Emby class.
 */
export class EmbyAdapter {
  private config: EmbyConfig;
  private baseUrl: string;
  private apiKey: string

  constructor(config: EmbyConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  /**
   * Get API headers.
   */
  private getHeaders(): HeadersInit {
    return {
      "X-MediaBrowser-Token": this.apiKey,
      "Accept": "application/json",
    };
  }

  /**
   * Fetch a list endpoint and unwrap Emby's envelope.
   *
   * /Items and /Library/MediaFolders return {Items: [...], TotalRecordCount},
   * NOT a bare array — only /Sessions is a bare array. The adapter typed these
   * as arrays and called .map() on the envelope, which threw, so every Emby
   * panel rendered offline even with a valid token. Verified live against the
   * gh-media instance.
   */
  private async fetchList<T>(endpoint: string): Promise<T[]> {
    const body = await this.fetch<T[] | { Items?: T[] }>(endpoint);
    if (Array.isArray(body)) return body;
    return body?.Items ?? [];
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
   * Health check - fetch server info.
   */
  async health(): Promise<FreshnessInfo> {
    try {
      const _info = await this.fetch<EmbyServerInfo>("/System/Info");
      return {
        timestamp: new Date().toISOString(),
        source: `Emby:${this.baseUrl}/System/Info`,
        state: "healthy",
        cacheAgeMs: 0,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        source: `Emby:${this.baseUrl}/System/Info`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: 0,
      };
    }
  }

  /**
   * Query: Recently added movies.
   * Returns VisualData for PosterWall or RecentlyAdded component.
   */
  async queryRecentlyAddedMovies(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const items = await this.fetchList<EmbyItem>(
        "/Items?IncludeItemTypes=Movie&SortBy=DateCreated&SortOrder=Descending&Recursive=true&Limit=20&ImageTypes=Primary"
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 20).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        value: item.CommunityRating,
        state: "healthy",
        meta: {
          type: "Movie",
          premiered: item.PremiereDate,
          genres: item.Genres,
          studios: item.Studios,
        },
      }));

      const data: VisualData = {
        title: "Recently Added Movies",
        subtitle: `From ${now.split("T")[0]}`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total", value: items.length, unit: "movies" },
          {
            label: "Avg Rating",
            value:
              items.reduce((sum, i) => sum + (i.CommunityRating || 0), 0) /
                items.length,
            unit: "★",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Items?IncludeItemTypes=Movie&SortBy=DateCreated`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Recently Added Movies", err, start);
    }
  }

  /**
   * Query: Continue watching.
   * Returns VisualData for PlaybackSessionCards or ContinueWatchingRail.
   */
  async queryContinueWatching(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      if (!this.config.userId) {
        throw new Error("userId required for Continue Watching");
      }

      const items = await this.fetchList<EmbyItem>(
        `/Users/${this.config.userId}/Items/Resume?Limit=10&ImageTypes=Primary`
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 10).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        progress: item.UserData?.PlayedPercentage
          ? item.UserData.PlayedPercentage / 100
          : undefined,
        state: "healthy",
        meta: {
          type: item.Type,
          played: item.UserData?.Played,
        },
      }));

      const data: VisualData = {
        title: "Continue Watching",
        subtitle: `${items.length} items in progress`,
        state: "healthy",
        items: visualItems,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Users/${this.config.userId}/Items/Resume`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Continue Watching", err, start);
    }
  }

  /**
   * Query: Active playback sessions.
   * Returns VisualData for PlaybackSessions component.
   */
  async queryPlaybackSessions(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const sessions = await this.fetch<EmbySession[]>("/Sessions");

      const now = new Date().toISOString();

      const visualItems: Item[] = sessions.map((session) => ({
        id: session.Id,
        label: session.NowPlayingItem?.Name || "Unknown",
        subtitle: session.NowPlayingItem?.Type,
        image: proxyImage("emby", session.NowPlayingItem?.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${session.NowPlayingItem.Id}/Images/Primary?tag=${session.NowPlayingItem.ImageTags.Primary}`
          : undefined),
        progress: session.PlayState?.PositionTicks && session.NowPlayingItem?.RunTimeTicks
          ? session.PlayState.PositionTicks / session.NowPlayingItem.RunTimeTicks
          : undefined,
        state: session.PlayState?.IsPaused ? "warning" : "healthy",
        meta: {
          user: session.UserName,
          client: session.Client,
          device: session.DeviceName,
          isPaused: session.PlayState?.IsPaused,
        },
      }));

      const data: VisualData = {
        title: "Now Playing",
        subtitle: `${sessions.length} active sessions`,
        state: sessions.length > 0 ? "healthy" : "empty",
        items: visualItems,
        metrics: [
          { label: "Sessions", value: sessions.length, unit: "active" },
          {
            label: "Paused",
            value: sessions.filter((s) => s.PlayState?.IsPaused).length,
            unit: "sessions",
          },
        ],
        events: sessions
          .filter((s) => s.LastActivityDate)
          .map((s) => ({
            id: s.Id,
            at: s.LastActivityDate,
            title: `${s.UserName} started ${s.NowPlayingItem?.Name || "content"}`,
            detail: `${s.Client} on ${s.DeviceName}`,
            state: "healthy",
          })),
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Sessions`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Now Playing", err, start);
    }
  }

  /**
   * Query: Library overview.
   * Returns VisualData for LibraryCounts or MediaHero component.
   */
  async queryLibraryOverview(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const libraries = await this.fetchList<EmbyLibrary>("/Library/MediaFolders");

      // /Library/MediaFolders does not carry item counts — ChildCount is absent,
      // so every library reported 0. The count comes from a Limit=0 query per
      // library, which returns TotalRecordCount without transferring any items.
      const counts = await Promise.all(
        libraries.map(async (lib) => {
          try {
            const body = await this.fetch<{ TotalRecordCount?: number }>(
              `/Items?ParentId=${encodeURIComponent(lib.Id)}&Recursive=true&Limit=0`,
            );
            return body?.TotalRecordCount ?? 0;
          } catch {
            return 0;
          }
        }),
      );

      const now = new Date().toISOString();

      const metrics: Metric[] = libraries.map((lib, i) => ({
        label: lib.Name,
        value: counts[i] ?? 0,
        unit: "items",
        state: "healthy",
      }));

      const items: Item[] = libraries.map((lib, i) => ({
        id: lib.Id,
        label: lib.Name,
        subtitle: lib.CollectionType || lib.Type,
        value: counts[i] ?? 0,
        state: "healthy",
        meta: {
          collectionType: lib.CollectionType,
          locations: lib.Locations,
        },
      }));

      const data: VisualData = {
        title: "Emby Libraries",
        subtitle: `${libraries.length} collections`,
        state: "healthy",
        metrics,
        items,
        // Summed from `counts`, not from lib.ChildCount. /Library/MediaFolders
        // omits ChildCount entirely, so the old expression was a sum of
        // undefined-coerced-to-0 and the panel always read "0 total items"
        // while the per-library metrics above showed the real numbers.
        summary: `${libraries.length} libraries across ${counts.reduce((sum, c) => sum + c, 0).toLocaleString()} total items`,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Library/MediaFolders`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Emby Libraries", err, start);
    }
  }

  /**
   * Query: Overview — the default view.
   *
   * The library view alone returns counts but no artwork, so on the media page
   * Emby rendered as ranked bars while Sonarr/Radarr showed poster walls. This
   * keeps the per-library count KPIs (which the picker turns into a MetricStrip)
   * AND attaches the recently-added movie posters (which it turns into an
   * ArtworkWall), so Emby leads with its numbers and shows its cover art like
   * the other media services. Both sub-queries already exist and already fail
   * softly; this only composes them.
   */
  async queryOverview(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const [libs, recent] = await Promise.all([
        this.queryLibraryOverview(),
        this.queryRecentlyAddedMovies(),
      ]);
      const now = new Date().toISOString();
      const data: VisualData = {
        title: "Emby",
        subtitle: libs.data?.summary ?? recent.data?.subtitle,
        state: "healthy",
        // Library counts drive the KPI strip; recent movies (with proxied
        // posters) drive the wall. If either sub-query failed softly its field
        // is simply absent and the panel drops that half rather than erroring.
        metrics: libs.data?.metrics,
        items: recent.data?.items,
        summary: libs.data?.summary,
        updatedAt: now,
      };
      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/overview`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Emby", err, start);
    }
  }

  /**
   * Query: Series list.
   * Returns VisualData for SeriesWall component.
   */
  async querySeries(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const items = await this.fetchList<EmbyItem>(
        "/Items?IncludeItemTypes=Series&SortBy=SortName&Recursive=true&Limit=30&ImageTypes=Primary"
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 30).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        state: "healthy",
        meta: {
          unplayedCount: item.UserData?.UnplayedItemCount,
          genres: item.Genres,
          studios: item.Studios,
        },
      }));

      const data: VisualData = {
        title: "TV Series",
        subtitle: `${items.length} shows`,
        state: "healthy",
        items: visualItems,
        metrics: [
          {
            label: "Total Shows",
            value: items.length,
            unit: "series",
          },
          {
            label: "New Episodes",
            value: items.reduce((sum, i) => sum + (i.UserData?.UnplayedItemCount || 0), 0),
            unit: "episodes",
          },
        ],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Items?IncludeItemTypes=Series`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("TV Series", err, start);
    }
  }

  /**
   * Query: Music albums.
   * Returns VisualData for AlbumWall component.
   */
  async queryAlbums(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const items = await this.fetchList<EmbyItem>(
        "/Items?IncludeItemTypes=MusicAlbum&SortBy=SortName&Recursive=true&Limit=30&ImageTypes=Primary"
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 30).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.Genres?.[0],
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        state: "healthy",
        meta: {
          albumArtist: item.AlbumArtist,
          genres: item.Genres,
          studios: item.Studios,
        },
      }));

      const data: VisualData = {
        title: "Music Albums",
        subtitle: `${items.length} albums`,
        state: "healthy",
        items: visualItems,
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Items?IncludeItemTypes=MusicAlbum`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult("Music Albums", err, start);
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
        source: `Emby:${this.baseUrl}`,
        state: "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}