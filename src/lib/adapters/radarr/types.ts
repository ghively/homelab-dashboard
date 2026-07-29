/**
 * Radarr v4 API types and interfaces.
 * REST API: https://radarr.video/docs/api/
 */

import { z } from "zod";

/**
 * Radarr movie status.
 */
export const RadarrMovieStatusSchema = z.enum([
  "announced",
  "inCinemas",
  "released",
  "deleted",
]);
export type RadarrMovieStatus = z.infer<typeof RadarrMovieStatusSchema>;

/**
 * Radarr monitored state.
 */
export const RadarrMonitoredSchema = z.boolean();
export type RadarrMonitored = z.infer<typeof RadarrMonitoredSchema>;

/**
 * Radarr movie.
 */
export const RadarrMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  sortTitle: z.string(),
  status: RadarrMovieStatusSchema,
  overview: z.string().optional(),
  images: z
    .array(
      z.object({
        coverType: z.string(),
        url: z.string(),
      })
    )
    .optional(),
  year: z.number(),
  qualityProfileId: z.number().optional(),
  languageProfileId: z.number().optional(),
  monitored: z.boolean(),
  useSceneNumbering: z.boolean().optional(),
  runtime: z.number().optional(),
  tmdbId: z.number().optional(),
  titleSlug: z.string(),
  certification: z.string().optional(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.number()).optional(),
  added: z.string(),
  ratings: z.object({ votes: z.number(), value: z.number() }).optional(),
  hasFile: z.boolean(),
  movieFile: z
    .object({
      id: z.number(),
      relativePath: z.string(),
      path: z.string(),
      size: z.number(),
      dateAdded: z.string(),
    })
    .optional(),
  originalLanguage: z
    .object({
      id: z.number(),
      name: z.string(),
    })
    .optional(),
  alternateTitles: z
    .array(
      z.object({
        title: z.string(),
        sourceType: z.string(),
      })
    )
    .optional(),
  studio: z.string().optional(),
  minimumAvailability: z.string().optional(),
  isAvailable: z.boolean(),
  physicalRelease: z.string().optional(),
  digitalRelease: z.string().optional(),
  inCinemas: z.string().optional(),
  secondaryYear: z.number().optional(),
  youTubeTrailerId: z.string().optional(),
});
export type RadarrMovie = z.infer<typeof RadarrMovieSchema>;

/**
 * Radarr queue item.
 */
export const RadarrQueueItemSchema = z.object({
  id: z.number(),
  movieId: z.number(),
  movie: RadarrMovieSchema.optional(),
  quality: z.object({
    quality: z.object({ id: z.number(), name: z.string(), source: z.string() }),
    revision: z.object({ version: z.number(), real: z.number() }),
  }).optional(),
  size: z.number(),
  title: z.string(),
  sizeleft: z.number(),
  timeleft: z.string().optional(),
  estimatedCompletionTime: z.string().optional(),
  status: z.enum(["queued", "paused", "downloading", "completed", "failed", "warning"]),
  trackedDownloadStatus: z.enum(["ok", "warning", "error"]).optional(),
  statusMessages: z.array(z.any()).optional(),
  downloadId: z.string().optional(),
  protocol: z.enum(["torrent", "usenet"]).optional(),
  downloadClient: z.string().optional(),
  indexer: z.string().optional(),
  added: z.string(),
});
export type RadarrQueueItem = z.infer<typeof RadarrQueueItemSchema>;

/**
 * Radarr wanted item (missing movies).
 */
export const RadarrWantedItemSchema = z.object({
  id: z.number(),
  movieId: z.number(),
  movie: RadarrMovieSchema.optional(),
  inCinemas: z.string().optional(),
  physicalRelease: z.string().optional(),
  digitalRelease: z.string().optional(),
});
export type RadarrWantedItem = z.infer<typeof RadarrWantedItemSchema>;

/**
 * Radarr calendar item.
 */
export const RadarrCalendarItemSchema = z.object({
  id: z.number(),
  movieId: z.number(),
  title: z.string(),
  sortTitle: z.string(),
  status: RadarrMovieStatusSchema,
  overview: z.string().optional(),
  images: z.array(z.any()).optional(),
  year: z.number(),
  monitored: z.boolean(),
  inCinemas: z.string().optional(),
  physicalRelease: z.string().optional(),
  digitalRelease: z.string().optional(),
  hasFile: z.boolean(),
  movieFile: z.any().optional(),
  movie: RadarrMovieSchema.optional(),
});
export type RadarrCalendarItem = z.infer<typeof RadarrCalendarItemSchema>;

/**
 * Radarr health check response.
 */
export const RadarrHealthSchema = z.object({
  source: z.string(),
  type: z.enum(["error", "warning"]),
  message: z.string(),
  wikiUrl: z.string().optional(),
});
export type RadarrHealth = z.infer<typeof RadarrHealthSchema>;

/**
 * Radarr system status.
 */
export const RadarrSystemStatusSchema = z.object({
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
export type RadarrSystemStatus = z.infer<typeof RadarrSystemStatusSchema>;

/**
 * Radarr disk space.
 */
export const RadarrDiskSpaceSchema = z.object({
  path: z.string(),
  label: z.string(),
  freeSpace: z.number(),
  totalSpace: z.number(),
});
export type RadarrDiskSpace = z.infer<typeof RadarrDiskSpaceSchema>;