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
  EmbyUser,
} from "./types";
import { ADAPTER_TIMEOUT_MS, AdapterHttpError, classifyError, fetchWithTimeout } from "@/lib/adapter-http";

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
/**
 * Emby's /Items returns a near-empty BaseItemDto by default — not even
 * ProductionYear survives without an explicit &Fields= request, let alone
 * Genres/Overview/CommunityRating/Studios. Every /Items call below was
 * silently missing this (subtitle read as "undefined" for the year on every
 * poster in production), because none of them asked for it. Verified against
 * the live instance: identical request with and without &Fields= — one comes
 * back with 4 fields, the other with the genres/overview/rating/year actually
 * available in the library.
 */
const ITEM_FIELDS = "Genres,Overview,CommunityRating,ProductionYear,Studios,PremiereDate,RunTimeTicks,RemoteTrailers";

/** RunTimeTicks is 100-nanosecond units (the .NET/Windows tick). */
function runtimeMinutes(ticks: number | undefined): number | undefined {
  return ticks ? Math.round(ticks / 600_000_000) : undefined;
}

/** First real trailer link Emby's metadata provider found — undefined is a real miss, not every item has one. */
function trailerUrl(item: EmbyItem): string | undefined {
  return item.RemoteTrailers?.[0]?.Url;
}

/**
 * Colloquial genre name -> the alternate spelling libraries commonly tag
 * with instead. Verified against the live instance: /Genres lists BOTH
 * "Sci-Fi" and "Science Fiction" as distinct registered tags, and the movies
 * actually on hand use "Science Fiction" — "Sci-Fi" alone returns zero
 * results even though it is a real genre in this library, just not the one
 * applied to any movie. Only covers pairs actually seen mismatching; not a
 * general fuzzy matcher.
 */
const GENRE_SYNONYMS: Record<string, string> = {
  "sci-fi": "Science Fiction",
  "scifi": "Science Fiction",
  "sci fi": "Science Fiction",
  "science fiction": "Sci-Fi",
};

export class EmbyAdapter {
  private config: EmbyConfig;
  private baseUrl: string;
  private apiKey: string
  private resolvedUserId?: string;

  constructor(config: EmbyConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  /**
   * The user ID mutations act on behalf of. EMBY_USER_ID is optional in
   * config — most homelab Emby instances have exactly one real (admin) user,
   * so falling back to "the only user on the server" needs zero setup for
   * the common case, rather than requiring an env var nobody's told to set.
   * Fails closed (throws, naming the fix) rather than guessing among several
   * users — silently acting as the wrong person's watched-history is worse
   * than an honest "set EMBY_USER_ID" error.
   */
  private async resolveUserId(): Promise<string> {
    if (this.config.userId) return this.config.userId;
    if (this.resolvedUserId) return this.resolvedUserId;
    const users = await this.fetchList<EmbyUser>("/Users");
    if (users.length === 1) {
      this.resolvedUserId = users[0].Id;
      return this.resolvedUserId;
    }
    throw new Error(
      users.length === 0
        ? "No Emby users found."
        : `${users.length} Emby users found — set EMBY_USER_ID to disambiguate.`,
    );
  }

  /**
   * Non-throwing resolveUserId(), for read paths. Mutations fail closed on
   * an ambiguous user (acting on the wrong person's watch history is a real
   * mistake); a read degrading to non-personalized results because it
   * couldn't resolve one user is not the same class of problem, so it
   * should not refuse to answer — it should just skip the personalization
   * and say so, which is what callers of this do with a null result.
   */
  private async tryResolveUserId(): Promise<string | null> {
    try {
      return await this.resolveUserId();
    } catch {
      return null;
    }
  }

  /**
   * Base path for an /Items-style query — user-scoped (real UserData:
   * Played/IsFavorite/PlayCount, and Filters=IsUnplayed becomes usable) when
   * a user can be resolved, the generic endpoint otherwise. Verified live:
   * the generic /Items endpoint never returns UserData at all, regardless of
   * API key — personalization genuinely requires the user-scoped path, not
   * just an extra field request.
   */
  private async itemsBase(): Promise<{ base: string; userId: string | null }> {
    const userId = await this.tryResolveUserId();
    return { base: userId ? `/Users/${userId}/Items` : "/Items", userId };
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

  /** POST with no body — used by mutations (e.g. marking an item played). */
  private async post(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetchWithTimeout(url, { method: "POST", headers: this.getHeaders() }, ADAPTER_TIMEOUT_MS);
    if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
  }

  /** DELETE with no body — used by mutations (e.g. marking an item unplayed). */
  private async del(endpoint: string): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    const res = await fetchWithTimeout(url, { method: "DELETE", headers: this.getHeaders() }, ADAPTER_TIMEOUT_MS);
    if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
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
      const { base } = await this.itemsBase();
      const items = await this.fetchList<EmbyItem>(
        `${base}?IncludeItemTypes=Movie&SortBy=DateCreated&SortOrder=Descending&Recursive=true&Limit=20&ImageTypes=Primary&Fields=${ITEM_FIELDS}`
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
          rating: item.CommunityRating,
          overview: item.Overview,
          watched: item.UserData?.Played,
          favorite: item.UserData?.IsFavorite,
          runtimeMinutes: runtimeMinutes(item.RunTimeTicks),
          trailerUrl: trailerUrl(item),
        },
      }));

      const data: VisualData = {
        title: "Recently Added Movies",
        subtitle: `From ${now.split("T")[0]}`,
        state: "healthy",
        items: visualItems,
        metrics: [
          { label: "Total", value: items.length, unit: "movies" },
          // items.length === 0 divides to NaN — omit the metric rather than
          // rendering "NaN ★" for an empty recently-added result.
          ...(items.length > 0
            ? [
                {
                  label: "Avg Rating",
                  value:
                    items.reduce((sum, i) => sum + (i.CommunityRating || 0), 0) /
                      items.length,
                  unit: "★",
                },
              ]
            : []),
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
   * Query: Movies and/or TV series in a genre, already in the library.
   * Returns VisualData for ArtworkWall — the "what's available now" half of a
   * content-discovery answer (paired with Radarr/Sonarr's wanted-by-genre for
   * "what you could download"). Genres filter is case-insensitive server-side.
   * mediaType narrows to just movies or just series; omitted searches both,
   * same as querySearch already did — there is no reason genre discovery
   * should see only half the library when title search sees all of it.
   *
   * `genre` accepts a comma-separated list for a compound ask ("horror
   * comedy" -> "Horror,Comedy"). Emby's own Genres= filter is OR (matches
   * ANY listed genre) — there is no server-side AND. A compound ask sent
   * straight through returned zero results for a real conversational
   * refinement ("show me something more lighthearted" -> "Horror Comedy" as
   * a single literal genre string, which does not exist as a tag) even
   * though the library has real horror-comedies tagged with both genres
   * separately. So: fetch candidates on the first genre alone (a wider net
   * when more genres must ALL match, since the AND-narrowing happens after
   * the fetch, not before it), then require every other listed genre be
   * present in the item's own Genres array before it counts.
   */
  async queryByGenre(genreInput: string, mediaType?: "movie" | "series", unwatched?: boolean): Promise<VisualQueryResult> {
    const start = Date.now();
    const genres = genreInput.split(",").map((g) => g.trim()).filter(Boolean);
    const [primary, ...alsoRequired] = genres;
    const kind = mediaType === "movie" ? "Movies" : mediaType === "series" ? "Shows" : "Titles";
    const label = genreInput ? `${genreInput} ${kind}` : kind;
    const includeTypes = mediaType === "movie" ? "Movie" : mediaType === "series" ? "Series" : "Movie,Series";
    const fetchLimit = alsoRequired.length > 0 ? 200 : 24;
    const { base, userId } = await this.itemsBase();
    // Filters=IsUnplayed only means anything on the user-scoped endpoint —
    // there is no user context to check "unplayed by whom" against on the
    // generic one, so it is only appended when a user actually resolved.
    const canFilterUnwatched = unwatched && userId;
    const itemsUrl = (g: string) =>
      `${base}?IncludeItemTypes=${includeTypes}&Genres=${encodeURIComponent(g)}&Recursive=true&Limit=${fetchLimit}&SortBy=CommunityRating&SortOrder=Descending&ImageTypes=Primary&Fields=${ITEM_FIELDS}${canFilterUnwatched ? "&Filters=IsUnplayed" : ""}`;
    try {
      let items = await this.fetchList<EmbyItem>(itemsUrl(primary ?? ""));

      // Emby libraries tag inconsistently — "Science Fiction" and "Sci-Fi" can
      // both be registered genres, applied to different items, and the model
      // (or the person asking) has no way to know which one this library
      // actually used. An empty result on a colloquial genre name reads as
      // "nothing here" when it may just be the wrong spelling of a real tag,
      // so retry once against a known synonym before accepting zero.
      if (items.length === 0 && primary) {
        const alt = GENRE_SYNONYMS[primary.toLowerCase()];
        if (alt) items = await this.fetchList<EmbyItem>(itemsUrl(alt));
      }

      if (alsoRequired.length > 0) {
        const requiredLower = alsoRequired.map((g) => g.toLowerCase());
        items = items
          .filter((item) => {
            const itemGenres = (item.Genres ?? []).map((g) => g.toLowerCase());
            return requiredLower.every((r) => itemGenres.includes(r));
          })
          .slice(0, 24);
      }

      const now = new Date().toISOString();

      const visualItems: Item[] = items.map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: [item.Type, item.ProductionYear?.toString()].filter(Boolean).join(" · "),
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        value: item.CommunityRating,
        state: "healthy",
        meta: {
          type: item.Type,
          premiered: item.PremiereDate,
          genres: item.Genres,
          studios: item.Studios,
          rating: item.CommunityRating,
          overview: item.Overview,
          watched: item.UserData?.Played,
          favorite: item.UserData?.IsFavorite,
          runtimeMinutes: runtimeMinutes(item.RunTimeTicks),
          trailerUrl: trailerUrl(item),
        },
      }));

      const data: VisualData = {
        title: label,
        subtitle: `${items.length} in your library`,
        state: items.length > 0 ? "healthy" : "empty",
        items: visualItems,
        // unwatched was asked for but couldn't be honored (ambiguous user) —
        // say so rather than silently returning a broader, unfiltered list
        // while the caller still thinks it asked for unwatched-only.
        ...(unwatched && !userId
          ? { summary: `Showing all ${label.toLowerCase()}, not just unwatched — Emby has multiple users and no EMBY_USER_ID is set, so per-user watch history isn't available.` }
          : {}),
        metrics: [{ label: "Available", value: items.length, unit: "titles" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Items?Genres=${encodeURIComponent(genreInput)}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
    }
  }

  /**
   * Query: Free-text title search across movies and TV shows.
   * Returns VisualData for ArtworkWall.
   */
  async querySearch(term: string): Promise<VisualQueryResult> {
    const start = Date.now();
    const label = term ? `"${term}"` : "Search";
    try {
      const { base } = await this.itemsBase();
      const items = await this.fetchList<EmbyItem>(
        `${base}?SearchTerm=${encodeURIComponent(term)}&IncludeItemTypes=Movie,Series&Recursive=true&Limit=24&ImageTypes=Primary&Fields=${ITEM_FIELDS}`
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: item.ProductionYear?.toString(),
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        value: item.CommunityRating,
        state: "healthy",
        meta: {
          type: item.Type,
          premiered: item.PremiereDate,
          genres: item.Genres,
          rating: item.CommunityRating,
          overview: item.Overview,
          watched: item.UserData?.Played,
          favorite: item.UserData?.IsFavorite,
          runtimeMinutes: runtimeMinutes(item.RunTimeTicks),
          trailerUrl: trailerUrl(item),
        },
      }));

      const data: VisualData = {
        title: label,
        subtitle: `${items.length} result${items.length === 1 ? "" : "s"} in your library`,
        state: items.length > 0 ? "healthy" : "empty",
        items: visualItems,
        metrics: [{ label: "Results", value: items.length, unit: "" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Items?SearchTerm=${encodeURIComponent(term)}`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
    }
  }

  /**
   * Query: titles similar to one already-known item — the "something like
   * that one" / "more like this" half of a real recommendation flow, not
   * just a genre filter. Verified live against the real API: the bare
   * /Items/{id}/Similar endpoint (no userId) 500s outright — "Object
   * reference not set" — it is not a graceful empty result, it is a real
   * server error, so userId is required here, not just nice-to-have.
   * /Users/{id}/Items/{itemId}/Similar (userId as a path segment) also
   * 404s; the only working shape is /Items/{itemId}/Similar?userId=.
   */
  async querySimilar(itemId: string): Promise<VisualQueryResult> {
    const start = Date.now();
    const label = "Similar Titles";
    const userId = await this.tryResolveUserId();
    if (!userId) {
      return this.errorResult(
        label,
        new Error("Similar-title recommendations need a resolved Emby user — set EMBY_USER_ID."),
        start,
      );
    }
    try {
      const items = await this.fetchList<EmbyItem>(
        `/Items/${encodeURIComponent(itemId)}/Similar?userId=${userId}&Limit=24&Fields=${ITEM_FIELDS}`
      );

      const now = new Date().toISOString();

      const visualItems: Item[] = items.map((item) => ({
        id: item.Id,
        label: item.Name,
        subtitle: [item.Type, item.ProductionYear?.toString()].filter(Boolean).join(" · "),
        image: proxyImage("emby", item.ImageTags?.Primary
          ? `${this.baseUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}`
          : undefined),
        value: item.CommunityRating,
        state: "healthy",
        meta: {
          type: item.Type,
          premiered: item.PremiereDate,
          genres: item.Genres,
          rating: item.CommunityRating,
          overview: item.Overview,
          watched: item.UserData?.Played,
          favorite: item.UserData?.IsFavorite,
          runtimeMinutes: runtimeMinutes(item.RunTimeTicks),
          trailerUrl: trailerUrl(item),
        },
      }));

      const data: VisualData = {
        title: label,
        subtitle: `${items.length} titles like this one`,
        state: items.length > 0 ? "healthy" : "empty",
        items: visualItems,
        metrics: [{ label: "Similar", value: items.length, unit: "titles" }],
        updatedAt: now,
      };

      return {
        data,
        freshness: {
          timestamp: now,
          source: `Emby:${this.baseUrl}/Items/${itemId}/Similar`,
          state: "healthy",
          cacheAgeMs: Date.now() - start,
        },
      };
    } catch (err) {
      return this.errorResult(label, err, start);
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
        `/Users/${this.config.userId}/Items/Resume?Limit=10&ImageTypes=Primary&Fields=${ITEM_FIELDS}`
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
      // Both sub-queries fail softly (they catch internally and resolve with
      // state "offline" rather than rejecting), so this never sees a thrown
      // error to catch even when Emby is completely unreachable. The overview
      // must read their states back explicitly instead of assuming "healthy" —
      // otherwise a fully-down Emby still shows a healthy badge with zero data.
      const libsOk = libs.data?.state === "healthy";
      const recentOk = recent.data?.state === "healthy";
      const state = libsOk && recentOk ? "healthy" : libsOk || recentOk ? "warning" : "offline";
      const data: VisualData = {
        title: "Emby",
        subtitle: libs.data?.summary ?? recent.data?.subtitle,
        state,
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
          state,
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
        `/Items?IncludeItemTypes=Series&SortBy=SortName&Recursive=true&Limit=30&ImageTypes=Primary&Fields=${ITEM_FIELDS}`
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
        `/Items?IncludeItemTypes=MusicAlbum&SortBy=SortName&Recursive=true&Limit=30&ImageTypes=Primary&Fields=${ITEM_FIELDS}`
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
   * Mutation: mark an item watched/unwatched. Fully reversible either
   * direction — toggling it back undoes it exactly.
   */
  async setWatched(itemId: string, watched: boolean): Promise<{ success: boolean; message: string }> {
    try {
      const userId = await this.resolveUserId();
      const endpoint = `/Users/${userId}/PlayedItems/${itemId}`;
      if (watched) await this.post(endpoint);
      else await this.del(endpoint);
      return { success: true, message: watched ? "Marked watched." : "Marked unwatched." };
    } catch (err) {
      const c = classifyError(err);
      return { success: false, message: `Could not update watched status: ${c.message}` };
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
    // Classify so a 401/403 (Emby is up, the token is wrong) renders `denied`
    // and names the fix, rather than the generic `offline` that reads as "the
    // service is down" for every failure regardless of cause.
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
        source: `Emby:${this.baseUrl}`,
        state: c.state === "healthy" ? "healthy" : "offline",
        lastError: String(err),
        cacheAgeMs: Date.now() - startTime,
      },
    };
  }
}