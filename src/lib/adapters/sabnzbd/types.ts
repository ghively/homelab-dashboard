/**
 * SABnzbd API types and interfaces.
 * REST API: https://sabnzbd.org/wiki/extra/api/
 */

import { z } from "zod";

/**
 * SABnzbd queue slot (download item).
 */
/**
 * A queue entry as SABnzbd actually returns it.
 *
 * Verified against SABnzbd 5.0.4. The previous schema was written against an
 * imagined API: it required `id`, a `status` enum, and numeric `mb`/`mbleft`.
 * SABnzbd uses `nzo_id`, returns every number as a STRING ("0.00"), and uses a
 * wider status vocabulary. Fields are optional and coerced because a required
 * field that the server omits fails the whole panel.
 */
export const SabQueueSlotSchema = z.object({
  nzo_id: z.string().optional(),
  filename: z.string().optional(),
  status: z.string().optional(),
  cat: z.string().optional(),
  mb: z.coerce.number().optional(),
  mbleft: z.coerce.number().optional(),
  percentage: z.coerce.number().optional(),
  timeleft: z.string().optional(),
  size: z.string().optional(),
  sizeleft: z.string().optional(),
  priority: z.string().optional(),
});
export type SabQueueSlot = z.infer<typeof SabQueueSlotSchema>;

/**
 * SABnzbd queue response.
 */
/**
 * The /api?mode=queue response as SABnzbd actually returns it.
 *
 * Key correction: the entries live under `slots`, NOT `jobs`. The adapter read
 * `queue.jobs`, which is always undefined, so `.map()` threw and the panel
 * rendered offline even with a valid API key — confirmed live against 5.0.4.
 * Numbers arrive as strings and are coerced.
 */
export const SabQueueSchema = z.object({
  queue: z.object({
    status: z.string().optional(),
    paused: z.boolean().optional(),
    speed: z.string().optional(),
    kbpersec: z.coerce.number().optional(),
    mbleft: z.coerce.number().optional(),
    mb: z.coerce.number().optional(),
    diskspace1: z.coerce.number().optional(),
    diskspacetotal1: z.coerce.number().optional(),
    noofslots: z.coerce.number().optional(),
    version: z.string().optional(),
    have_warnings: z.string().optional(),
    slots: z.array(SabQueueSlotSchema).default([]),
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