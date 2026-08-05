/**
 * RomM API types.
 *
 * These are NOT guessed. The previous version of this file was written
 * against "common patterns" (its own comment said so) — wrong endpoint names
 * (/api/status, /api/scan-jobs: neither exists), wrong param names (`platform`
 * instead of `platform_ids`), wrong response shape (a bare array where the
 * real API paginates: {items, total, limit, offset}), and wrong field names
 * on the rom itself (`image_path`/`region`/`status` don't exist; the real
 * fields are `path_cover_small`/`path_cover_large`/`regions[]`/
 * `missing_from_fs`). Every shape below was pulled from the live instance's
 * own /openapi.json (RomM is FastAPI; that endpoint is unauthenticated), not
 * from documentation or memory.
 */

import { z } from "zod";

/**
 * GET /api/platforms — a bare array, unlike /api/roms.
 */
export const RommPlatformSchema = z.object({
  id: z.number(),
  slug: z.string(),
  fs_slug: z.string(),
  name: z.string(),
  display_name: z.string(),
  custom_name: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  generation: z.union([z.string(), z.number()]).nullable().optional(),
  rom_count: z.number(),
  firmware_count: z.number().optional(),
  url_logo: z.string().nullable().optional(),
  is_unidentified: z.boolean().optional(),
  is_identified: z.boolean().optional(),
  missing_from_fs: z.boolean().optional(),
});
export type RommPlatformItem = z.infer<typeof RommPlatformSchema>;

/**
 * GET /api/roms — one row of the paginated `items` array (SimpleRomSchema).
 * `name` is nullable: an unidentified ROM has no matched metadata, so the
 * filesystem name (`fs_name`) is the only thing guaranteed to exist.
 */
export const RommRomSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  fs_name: z.string(),
  fs_name_no_tags: z.string().optional(),
  fs_size_bytes: z.number().optional(),
  platform_id: z.number(),
  platform_slug: z.string(),
  platform_display_name: z.string().optional(),
  summary: z.string().nullable().optional(),
  regions: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  path_cover_small: z.string().nullable().optional(),
  path_cover_large: z.string().nullable().optional(),
  url_cover: z.string().nullable().optional(),
  missing_from_fs: z.boolean().optional(),
  crc_hash: z.string().nullable().optional(),
  md5_hash: z.string().nullable().optional(),
  sha1_hash: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type RommRom = z.infer<typeof RommRomSchema>;

/**
 * GET /api/roms response envelope — CustomLimitOffsetPage[SimpleRomSchema].
 * The old adapter typed this endpoint's response as a bare `RommRom[]` and
 * called `.map()` on it directly; the real body is this object, so that call
 * would have thrown (or, worse, silently returned nothing) the moment the
 * endpoint was actually reachable.
 */
export const RommRomsPageSchema = z.object({
  items: z.array(RommRomSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type RommRomsPage = z.infer<typeof RommRomsPageSchema>;

/**
 * GET /api/stats — system-wide counts. Requires ROMM_API_KEY like
 * /api/platforms and /api/roms; only /api/heartbeat is anonymous.
 */
export const RommStatsSchema = z.object({
  PLATFORMS: z.number(),
  ROMS: z.number(),
  SAVES: z.number(),
  STATES: z.number(),
  SCREENSHOTS: z.number(),
  TOTAL_FILESIZE_BYTES: z.number(),
});
export type RommStats = z.infer<typeof RommStatsSchema>;

/**
 * GET /api/tasks — scheduled maintenance tasks (library scan, metadata
 * refresh, …), keyed by task group. This is a cron-style schedule, not a
 * job-history/progress feed — RomM streams live scan progress over a
 * websocket, which has no REST equivalent, so "Scan Jobs" (a fabricated
 * concept the old adapter invented, complete with a fake progress bar and
 * roms_processed/added/updated/removed counts) is replaced with what the API
 * actually exposes: which maintenance tasks exist, whether each is enabled,
 * and its cron schedule.
 */
export const RommTaskSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  cron_string: z.string().optional(),
  manual_run: z.boolean().optional(),
});
export type RommTask = z.infer<typeof RommTaskSchema>;
