/**
 * Sonarr v3 API types and interfaces.
 * REST API: https://sonarr.tv/docs/api/
 */

import { z } from "zod";

/**
 * Sonarr series status.
 */
export const SonarrSeriesStatusSchema = z.enum([
  "continuing",
  "ended",
  "upcoming",
]);
export type SonarrSeriesStatus = z.infer<typeof SonarrSeriesStatusSchema>;

/**
 * Sonarr monitored state.
 */
export const SonarrMonitoredSchema = z.enum(["true", "false"]);
export type SonarrMonitored = z.infer<typeof SonarrMonitoredSchema>;

/**
 * Sonarr series.
 */
export const SonarrSeriesSchema = z.object({
  id: z.number(),
  title: z.string(),
  sortTitle: z.string(),
  status: SonarrSeriesStatusSchema,
  overview: z.string().optional(),
  network: z.string().optional(),
  airTime: z.string().optional(),
  images: z
    .array(
      z.object({
        coverType: z.string(),
        url: z.string(),
      })
    )
    .optional(),
  seasons: z
    .array(
      z.object({
        seasonNumber: z.number(),
        monitored: z.boolean(),
        statistics: z
          .object({
            episodeFileCount: z.number(),
            episodeCount: z.number(),
            totalEpisodeCount: z.number(),
            sizeOnDisk: z.number(),
          })
          .optional(),
      })
    )
    .optional(),
  year: z.number().optional(),
  qualityProfileId: z.number().optional(),
  languageProfileId: z.number().optional(),
  seasonFolder: z.boolean().optional(),
  monitored: z.boolean(),
  useSceneNumbering: z.boolean().optional(),
  runtime: z.number().optional(),
  tvdbId: z.number().optional(),
  tvRageId: z.number().optional(),
  tvMazeId: z.number().optional(),
  firstAired: z.string().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
  cleanTitle: z.string(),
  imdbId: z.string().optional(),
  titleSlug: z.string(),
  certification: z.string().optional(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.number()).optional(),
  added: z.string(),
  ratings: z.object({ votes: z.number(), value: z.number() }).optional(),
  ended: z.boolean().optional(),
  lastInfoSync: z.string().optional(),
  previousAiring: z.string().optional(),
  nextAiring: z.string().optional(),
});
export type SonarrSeries = z.infer<typeof SonarrSeriesSchema>;

/**
 * Sonarr episode.
 */
export const SonarrEpisodeSchema = z.object({
  id: z.number(),
  seriesId: z.number(),
  episodeFileId: z.number().optional(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: z.string(),
  airDate: z.string(),
  airDateUtc: z.string(),
  overview: z.string().optional(),
  hasFile: z.boolean(),
  monitored: z.boolean(),
  absoluteEpisodeNumber: z.number().optional(),
  unverifiedSceneNumbering: z.boolean().optional(),
  runtime: z.number().optional(),
  images: z.array(z.any()).optional(),
  series: SonarrSeriesSchema.optional(),
});
export type SonarrEpisode = z.infer<typeof SonarrEpisodeSchema>;

/**
 * Sonarr queue item.
 */
export const SonarrQueueItemSchema = z.object({
  id: z.number(),
  seriesId: z.number(),
  episodeId: z.number(),
  series: SonarrSeriesSchema.optional(),
  episode: SonarrEpisodeSchema.optional(),
  quality: z.object({
    quality: z.object({ id: z.number(), name: z.string(), source: z.string() }),
    revision: z.object({ version: z.number(), real: z.number() }),
  }).optional(),
  size: z.number(),
  title: z.string(),
  sizeleft: z.number(),
  timeleft: z.string().optional(),
  estimatedCompletionTime: z.string().optional(),
  status: z.enum(["queued", "paused", "downloading", "completed", "failed"]),
  trackedDownloadStatus: z.enum(["ok", "warning", "error"]).optional(),
  statusMessages: z.array(z.any()).optional(),
  downloadId: z.string().optional(),
  protocol: z.enum(["torrent", "usenet"]).optional(),
  downloadClient: z.string().optional(),
  indexer: z.string().optional(),
  added: z.string(),
});
export type SonarrQueueItem = z.infer<typeof SonarrQueueItemSchema>;

/**
 * Sonarr wanted item (missing episodes).
 *
 * Verified against the live instance: /api/v3/wanted/missing returns flat
 * episode records — {seriesId, seasonNumber, episodeNumber, title, airDate,
 * overview, id, ...} — not a {id, seriesId, episodeId, series: {...}}
 * wrapper. There is no embedded series object and therefore no genre data on
 * this record at all; genre-filtering needs a separate /api/v3/series
 * lookup joined by seriesId (see queryWantedByGenre).
 */
export const SonarrWantedItemSchema = z.object({
  id: z.number(),
  seriesId: z.number(),
  tvdbId: z.number().optional(),
  episodeFileId: z.number().optional(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: z.string(),
  airDate: z.string().optional(),
  airDateUtc: z.string().optional(),
  overview: z.string().optional(),
  hasFile: z.boolean().optional(),
  monitored: z.boolean().optional(),
});
export type SonarrWantedItem = z.infer<typeof SonarrWantedItemSchema>;

/**
 * Sonarr calendar item.
 */
export const SonarrCalendarItemSchema = z.object({
  id: z.number(),
  seriesId: z.number(),
  episodeFileId: z.number(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: z.string(),
  airDate: z.string(),
  airDateUtc: z.string(),
  overview: z.string().optional(),
  hasFile: z.boolean(),
  monitored: z.boolean(),
  series: SonarrSeriesSchema.optional(),
});
export type SonarrCalendarItem = z.infer<typeof SonarrCalendarItemSchema>;

/**
 * Sonarr series lookup result — GET /api/v3/series/lookup?term=(text|tvdb:ID).
 * Verified against the live instance: no trailer field exists here (TheTVDB,
 * Sonarr's metadata source, doesn't supply one the way TMDB does for
 * Radarr) — genuinely absent, not missed. Like Radarr's lookup, this carries
 * `remotePoster` (absolute TVDB CDN URL) rather than a usable local
 * `images[].url`, since nothing has been added to Sonarr's library yet.
 */
export const SonarrLookupResultSchema = z.object({
  title: z.string(),
  year: z.number().optional(),
  tvdbId: z.number(),
  imdbId: z.string().optional(),
  overview: z.string().optional(),
  genres: z.array(z.string()).optional(),
  runtime: z.number().optional(),
  network: z.string().optional(),
  certification: z.string().optional(),
  remotePoster: z.string().optional(),
  status: SonarrSeriesStatusSchema.optional(),
  ratings: z.object({ votes: z.number(), value: z.number() }).optional(),
});
export type SonarrLookupResult = z.infer<typeof SonarrLookupResultSchema>;

/**
 * Sonarr health check response.
 */
export const SonarrHealthSchema = z.object({
  source: z.string(),
  type: z.enum(["error", "warning"]),
  message: z.string(),
  wikiUrl: z.string().optional(),
});
export type SonarrHealth = z.infer<typeof SonarrHealthSchema>;

/**
 * Sonarr system status.
 */
export const SonarrSystemStatusSchema = z.object({
  version: z.string(),
  buildTime: z.string(),
  isDebug: z.boolean(),
  isProduction: z.boolean(),
  isAdmin: z.boolean(),
  startTime: z.string(),
  authentication: z.boolean(),
  branch: z.string(),
  urlBase: z.string().optional(),
  sqliteVersion: z.string(),
  migrationVersion: z.number(),
});
export type SonarrSystemStatus = z.infer<typeof SonarrSystemStatusSchema>;

/**
 * Sonarr disk space.
 */
export const SonarrDiskSpaceSchema = z.object({
  path: z.string(),
  label: z.string(),
  freeSpace: z.number(),
  totalSpace: z.number(),
});
export type SonarrDiskSpace = z.infer<typeof SonarrDiskSpaceSchema>;