/**
 * Emby API types and interfaces.
 * REST API: https://github.com/MediaBrowser/Emby/wiki/Api
 */

import { z } from "zod";

/**
 * Emby item types.
 */
export const EmbyItemTypeSchema = z.enum([
  "Movie",
  "Series",
  "Episode",
  "Season",
  "Audio",
  "MusicAlbum",
  "MusicArtist",
  "Video",
  "BoxSet",
]);
export type EmbyItemType = z.infer<typeof EmbyItemTypeSchema>;

/**
 * Base Emby item response.
 */
export const EmbyItemSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  Type: EmbyItemTypeSchema,
  ServerId: z.string(),
  PremiereDate: z.string().optional(),
  ProductionYear: z.number().optional(),
  CommunityRating: z.number().optional(),
  Overview: z.string().optional(),
  ImageTags: z.object({
    Primary: z.string().optional(),
    Banner: z.string().optional(),
    Logo: z.string().optional(),
    Thumb: z.string().optional(),
    Backdrop: z.string().optional(),
  }).optional(),
  UserData: z
    .object({
      Played: z.boolean().optional(),
      PlayedPercentage: z.number().optional(),
      UnplayedItemCount: z.number().optional(),
      PlaybackPositionTicks: z.number().optional(),
      IsFavorite: z.boolean().optional(),
      PlayCount: z.number().optional(),
    })
    .optional(),
  RunTimeTicks: z.number().optional(),
  Genres: z.array(z.string()).optional(),
  Studios: z.array(z.string()).optional(),
  // Returned for Audio / MusicAlbum items. Consumed by queryAlbums().
  AlbumArtist: z.string().optional(),
  // Verified live: populated with real YouTube trailer links when Emby's
  // metadata provider found one (not every item has one — an empty array is
  // a real miss, not a bug). First entry is what's rendered.
  RemoteTrailers: z.array(z.object({ Url: z.string() })).optional(),
});
export type EmbyItem = z.infer<typeof EmbyItemSchema>;

/**
 * Emby library/collection info.
 */
export const EmbyLibrarySchema = z.object({
  Id: z.string(),
  Name: z.string(),
  Type: z.enum(["CollectionFolder", "UserView", "Folder"]),
  CollectionType: z.string().optional(), // "movies", "tvshows", "music", etc.
  Locations: z.array(z.string()).optional(),
  ChildCount: z.number().optional(),
});
export type EmbyLibrary = z.infer<typeof EmbyLibrarySchema>;

/**
 * Emby playback session.
 */
export const EmbySessionSchema = z.object({
  Id: z.string(),
  UserId: z.string(),
  UserName: z.string(),
  Client: z.string(),
  DeviceName: z.string(),
  DeviceId: z.string(),
  ApplicationVersion: z.string(),
  NowPlayingItem: EmbyItemSchema.optional(),
  PlayState: z.object({
    IsPaused: z.boolean(),
    IsMuted: z.boolean(),
    RepeatMode: z.enum(["RepeatNone", "RepeatOne", "RepeatAll"]),
    ShuffleMode: z.enum(["Shuffle", "ShuffleNone"]),
    PositionTicks: z.number().optional(),
  }).optional(),
  LastActivityDate: z.string(),
  LastPlaybackCheckIn: z.string(),
  SupportedCommands: z.array(z.string()).optional(),
});
export type EmbySession = z.infer<typeof EmbySessionSchema>;

/**
 * Emby scheduled task.
 */
export const EmbyTaskSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  Key: z.string(),
  State: z.enum(["Idle", "Running", "Cancelled"]),
  LastExecutionResult: z.object({
    StartTimeUtc: z.string().optional(),
    EndTimeUtc: z.string().optional(),
    Status: z.enum(["Completed", "Failed", "Cancelled"]),
    ErrorMessage: z.string().optional(),
  }).optional(),
});
export type EmbyTask = z.infer<typeof EmbyTaskSchema>;

/**
 * Emby server info.
 */
export const EmbyServerInfoSchema = z.object({
  Id: z.string(),
  ServerName: z.string(),
  Version: z.string(),
  ProductName: z.string(),
  OperatingSystem: z.string(),
  StartupWizardCompleted: z.boolean(),
  LocalAddress: z.string(),
  CanSelfRestart: z.boolean(),
});
export type EmbyServerInfo = z.infer<typeof EmbyServerInfoSchema>;

/**
 * Emby user info.
 */
export const EmbyUserSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  ServerId: z.string(),
  Policy: z.object({
    IsAdministrator: z.boolean(),
    IsDisabled: z.boolean(),
    MaxParentalRating: z.number(),
    EnableAudioPlaybackTranscoding: z.boolean(),
    EnableVideoPlaybackTranscoding: z.boolean(),
  }).optional(),
});
export type EmbyUser = z.infer<typeof EmbyUserSchema>;