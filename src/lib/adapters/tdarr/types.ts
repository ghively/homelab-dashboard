/**
 * Tdarr API types and interfaces.
 * REST API: https://docs.tdarr.io/
 */

import { z } from "zod";

/**
 * Tdarr library types.
 */
export const TdarrLibraryTypeSchema = z.enum([
  "general",
  "movies",
  "tv",
  "music",
  "anime",
  "sports",
  "other",
]);
export type TdarrLibraryType = z.infer<typeof TdarrLibraryTypeSchema>;

/**
 * Tdarr transcode status.
 */
export const TdarrStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "aborted",
  "paused",
]);
export type TdarrStatus = z.infer<typeof TdarrStatusSchema>;

/**
 * Tdarr file video codec.
 */
export const TdarrCodecSchema = z.enum([
  "h264",
  "h265",
  "hevc",
  "vp9",
  "av1",
  "mpeg2",
  "mpeg4",
  "vc1",
  "prores",
  "dnxhd",
  "uncompressed",
  "other",
]);
export type TdarrCodec = z.infer<typeof TdarrCodecSchema>;

/**
 * Tdarr library.
 */
export const TdarrLibrarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: TdarrLibraryTypeSchema,
  path: z.string(),
  enabled: z.boolean(),
  file_count: z.number().optional(),
  size: z.number().optional(), // Total size in bytes
  last_scanned: z.string().optional(),
});
export type TdarrLibrary = z.infer<typeof TdarrLibrarySchema>;

/**
 * Tdarr file.
 */
export const TdarrFileSchema = z.object({
  id: z.string(),
  library_id: z.string(),
  file_name: z.string(),
  file_path: z.string(),
  file_size: z.number(),
  video_codec: TdarrCodecSchema.optional(),
  audio_codec: z.string().optional(),
  resolution: z.string().optional(), // e.g., "1920x1080"
  bitrate: z.number().optional(), // kbps
  duration: z.number().optional(), // seconds
  frame_rate: z.number().optional(), // fps
  transcoding_status: TdarrStatusSchema.optional(),
  transcode_progress: z.number().optional(), // 0-100
  transcode_file_path: z.string().optional(),
  transcode_file_size: z.number().optional(),
  transcode_bitrate: z.number().optional(),
  transcode_codec: TdarrCodecSchema.optional(),
  health_check_status: z.enum(["healthy", "corrupted", "missing", "unknown"]).optional(),
  date_added: z.string().optional(),
  date_modified: z.string().optional(),
  metadata: z
    .object({
      title: z.string().optional(),
      year: z.number().optional(),
      genre: z.array(z.string()).optional(),
      language: z.string().optional(),
    })
    .optional(),
});
export type TdarrFile = z.infer<typeof TdarrFileSchema>;

/**
 * Tdarr transcode job.
 */
export const TdarrJobSchema = z.object({
  id: z.string(),
  file_id: z.string(),
  file_name: z.string(),
  file_path: z.string(),
  file_size: z.number(),
  library_id: z.string(),
  status: TdarrStatusSchema,
  progress: z.number(), // 0-100
  started_at: z.string(),
  completed_at: z.string().optional(),
  failed_at: z.string().optional(),
  error_message: z.string().optional(),
  cpu_usage: z.number().optional(), // 0-100
  memory_usage: z.number().optional(), // MB
  fps: z.number().optional(), // Current processing FPS
  eta: z.string().optional(), // Estimated time remaining
  priority: z.number().optional(), // Job priority (higher = higher priority)
  worker_id: z.string().optional(),
});
export type TdarrJob = z.infer<typeof TdarrJobSchema>;

/**
 * Tdarr worker.
 */
export const TdarrWorkerSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["online", "offline", "busy", "idle"]),
  cpu_usage: z.number().optional(),
  memory_usage: z.number().optional(), // MB
  current_job_id: z.string().optional(),
  jobs_completed: z.number().optional(),
  jobs_failed: z.number().optional(),
  last_active: z.string().optional(),
});
export type TdarrWorker = z.infer<typeof TdarrWorkerSchema>;

/**
 * Tdarr system status.
 */
export const TdarrSystemStatusSchema = z.object({
  version: z.string(),
  libraries_count: z.number(),
  files_count: z.number(),
  total_size: z.number(),
  workers_online: z.number(),
  workers_offline: z.number(),
  jobs_queued: z.number(),
  jobs_processing: z.number(),
  jobs_completed_today: z.number(),
  jobs_failed_today: z.number(),
  cpu_usage: z.number().optional(),
  memory_usage: z.number().optional(), // MB
  disk_usage: z.number().optional(), // MB
  uptime: z.string().optional(),
});
export type TdarrSystemStatus = z.infer<typeof TdarrSystemStatusSchema>;