/**
 * SABnzbd API types and interfaces.
 * REST API: https://sabnzbd.org/wiki/extra/api/
 */

import { z } from "zod";

/**
 * SABnzbd queue slot (download item).
 */
export const SabQueueSlotSchema = z.object({
  id: z.string(),
  filename: z.string(),
  status: z.enum([
    "Queued",
    "Downloading",
    "Paused",
    "Completed",
    "Failed",
    "Warning",
  ]),
  mbleft: z.number(), // MB left
  mb: z.number(), // Total MB
  bytes: z.number(), // Total bytes
  sizeleft: z.number(),
  percentage: z.number(),
  eta: z.string().optional(), // ETA string like "2h 30m"
  avg_age: z.number().optional(), // Average age in days
  script: z.string().optional(),
  script_line: z.string().optional(),
  unpackopts: z.string().optional(),
  password: z.string().optional(),
  priority: z.union([z.literal("Default"), z.literal("Low"), z.literal("Normal"), z.literal("High")]),
  category: z.string().optional(),
  labels: z.array(z.string()).optional(),
  sizemb: z.string(), // Formatted size string
  size: z.string(), // Formatted size string
  downloaded: z.number(),
  nzo_id: z.string(),
  path: z.string().optional(),
});
export type SabQueueSlot = z.infer<typeof SabQueueSlotSchema>;

/**
 * SABnzbd queue response.
 */
export const SabQueueSchema = z.object({
  queue: z.object({
    status: z.string(),
    eta: z.string().optional(), // Queue-level ETA, e.g. "2h 30m"
    speedlimit: z.number(), // Speed limit in KB/s
    speedlimit_abs: z.number(), // Absolute speed limit
    paused: z.boolean(),
    pause_int: z.string(), // Pause interval
    left_quota: z.string(), // Left quota
    kbpersec: z.number(), // Current speed in KB/s
    mbleft: z.number(), // MB left in queue
    mb: z.number(), // Total MB in queue
    sizeleft: z.number(), // Bytes left
    size: z.number(), // Total bytes
    diskspace1: z.number().optional(), // Disk space of primary download folder
    diskspace2: z.number().optional(), // Disk space of complete folder
    diskspace_total: z.number().optional(), // Total disk space
    download_dir: z.string().optional(),
    complete_dir: z.string().optional(),
    noofslots: z.number(), // Number of items in queue
    noofslots_total: z.number(), // Total number of slots (including history)
    jobs: z.array(SabQueueSlotSchema),
    categories: z.record(z.string(), z.array(z.string())).optional(),
    scripts: z.array(z.string()).optional(),
    version: z.string(),
    have_warnings: z.string().optional(), // "0" or "1"
    pause_on_pp: z.boolean(),
    diskspace1_norm: z.string().optional(),
    diskspace2_norm: z.string().optional(),
    diskspace_total_norm: z.string().optional(),
  }),
});
export type SabQueue = z.infer<typeof SabQueueSchema>;

/**
 * SABnzbd history slot (completed download).
 */
export const SabHistorySlotSchema = z.object({
  id: z.string(),
  filename: z.string(),
  status: z.enum([
    "Completed",
    "Failed",
    "Verified",
    "Deleted",
  ]),
  mbleft: z.number(),
  mb: z.number(),
  bytes: z.number(),
  sizeleft: z.number(),
  percentage: z.number(),
  download_time: z.number().optional(), // Download time in seconds
  postproc_time: z.number().optional(), // Post-processing time in seconds
  script_time: z.number().optional(), // Script time in seconds
  total_time: z.number().optional(), // Total time in seconds
  fail_message: z.string().optional(),
  path: z.string().optional(),
  storage: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  labels: z.array(z.string()).optional(),
  completed: z.number().optional(), // Unix timestamp
  nzo_id: z.string(),
  size: z.string(), // Formatted size string
  sizemb: z.string(), // Formatted size string
  loaded: z.boolean(),
  meta: z.string().optional(),
  type: z.enum(["nzb", "nzo"]).optional(),
});
export type SabHistorySlot = z.infer<typeof SabHistorySlotSchema>;

/**
 * SABnzbd history response.
 */
export const SabHistorySchema = z.object({
  history: z.object({
    noofslots: z.number(),
    slots: z.array(SabHistorySlotSchema),
    version: z.string(),
  }),
});
export type SabHistory = z.infer<typeof SabHistorySchema>;

/**
 * SABnzbd server status.
 */
export const SabServerStatusSchema = z.object({
  version: z.string(),
  completed: z.number(),
  speedlimit: z.number(),
  speedlimit_abs: z.number(),
  paused: z.boolean(),
  disk_size: z.string().optional(),
  disk_size_free: z.string().optional(),
  disk_size_total: z.string().optional(),
  have_warnings: z.string().optional(),
  quota: z.string().optional(),
  left_quota: z.string().optional(),
  download_dir: z.string().optional(),
  complete_dir: z.string().optional(),
  pause_int: z.string(),
  uptime: z.string().optional(),
  cache_size: z.number().optional(),
  cache_artifacts: z.number().optional(),
  cache_build: z.number().optional(),
});
export type SabServerStatus = z.infer<typeof SabServerStatusSchema>;

/**
 * SABnzbd server warnings.
 */
export const SabWarningSchema = z.object({
  type: z.string(),
  text: z.string(),
});
export type SabWarning = z.infer<typeof SabWarningSchema>;