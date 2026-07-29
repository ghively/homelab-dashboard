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
  EmbyItem,
  EmbyLibrary,
  EmbySession,
  EmbyTask,
  EmbyServerInfo,
  EmbyItemType,
} from "./types";

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
   * Generic fetch with error handling.
   */
  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const res = await fetch(url, { headers: this.getHeaders() });
      if (!res.ok) {
        throw new Error(`Emby API error: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      throw new Error(`Emby fetch failed: ${err}`);
    }
  }

  /**
   * Health check - fetch server info.
   */
  async health(): Promise<FreshnessInfo> {
    const start = Date.now();
    try {
      const info = await this.fetch<EmbyServerInfo>("/System/Info");
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
      const items = await this.fetch<EmbyItem[]>(
        "/Items?IncludeItemTypes=Movie&SortBy=DateCreated&SortOrder=Descending&Recursive=true&Limit=20&ImageTypes=Primary"
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 20).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined,
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

      const items = await this.fetch<EmbyItem[]>(
        `/Users/${this.config.userId}/Items/Resume?Limit=10&ImageTypes=Primary`
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 10).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined,
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
        image: session.NowPlayingItem?.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${session.NowPlayingItem.Id}/Images/Primary?tag=${session.NowPlayingItem.ImageTags.Primary}`
          : undefined,
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
      const libraries = await this.fetch<EmbyLibrary[]>("/Library/MediaFolders");

      const now = new Date().toISOString();

      const metrics: Metric[] = libraries.map((lib) => ({
        label: lib.Name,
        value: lib.ChildCount || 0,
        unit: "items",
        state: "healthy",
      }));

      const items: Item[] = libraries.map((lib) => ({
        id: lib.Id,
        label: lib.Name,
        subtitle: lib.CollectionType || lib.Type,
        value: lib.ChildCount || 0,
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
        summary: `${libraries.length} libraries across ${libraries.reduce((sum, l) => sum + (l.ChildCount || 0), 0)} total items`,
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
   * Query: Series list.
   * Returns VisualData for SeriesWall component.
   */
  async querySeries(): Promise<VisualQueryResult> {
    const start = Date.now();
    try {
      const items = await this.fetch<EmbyItem[]>(
        "/Items?IncludeItemTypes=Series&SortBy=SortName&Recursive=true&Limit=30&ImageTypes=Primary"
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 30).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined,
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
      const items = await this.fetch<EmbyItem[]>(
        "/Items?IncludeItemTypes=MusicAlbum&SortBy=SortName&Recursive=true&Limit=30&ImageTypes=Primary"
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.slice(0, 30).map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.Genres?.[0],
        image: item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined,
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