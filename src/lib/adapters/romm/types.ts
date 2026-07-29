/**
 * RomM API types and interfaces.
 * REST API: https://github.com/RomM-app/ROMM-API (community API)
 * Note: RomM may not have a public REST API; this is based on common patterns.
 */

import { z } from "zod";

/**
 * RomM ROM status.
 */
export const RommRomStatusSchema = z.enum([
  "Available",
  "Missing",
  "Downloading",
  "Processing",
  "Failed",
]);
export type RommRomStatus = z.infer<typeof RommRomStatusSchema>;

/**
 * RomM platform/console type.
 */
export const RommPlatformSchema = z.enum([
  "NES",
  "SNES",
  "N64",
  "GB",
  "GBC",
  "GBA",
  "NDS",
  "3DS",
  "Wii",
  "Wii U",
  "Switch",
  "PS1",
  "PS2",
  "PS3",
  "PSP",
  "PS Vita",
  "Sega Genesis",
  "Sega Saturn",
  "Dreamcast",
  "Arcade",
  "Atari 2600",
  "Atari 5200",
  "Atari 7800",
  "Atari Jaguar",
  " Commodore 64",
  "DOS",
  "PC Engine",
  "Neo Geo",
]);
export type RommPlatform = z.infer<typeof RommPlatformSchema>;

/**
 * RomM ROM item.
 */
export const RommRomSchema = z.object({
  id: z.number(),
  name: z.string(),
  region: z.string().optional(), // USA, EUR, JPN, etc.
  language: z.string().optional(),
  platform: RommPlatformSchema,
  size: z.number().optional(), // File size in bytes
  crc32: z.string().optional(),
  md5: z.string().optional(),
  sha1: z.string().optional(),
  release_name: z.string().optional(),
  status: RommRomStatusSchema.optional(),
  filename: z.string().optional(),
  file_path: z.string().optional(),
  image_path: z.string().optional(),
  metadata: z
    .object({
      developer: z.string().optional(),
      publisher: z.string().optional(),
      release_date: z.string().optional(),
      genre: z.array(z.string()).optional(),
      players: z.number().optional(),
      rating: z.number().optional(),
      description: z.string().optional(),
    })
    .optional(),
  added_date: z.string().optional(),
  updated_date: z.string().optional(),
});
export type RommRom = z.infer<typeof RommRomSchema>;

/**
 * RomM platform collection.
 */
export const RommPlatformCollectionSchema = z.object({
  platform: RommPlatformSchema,
  total_roms: z.number(),
  available_roms: z.number(),
  missing_roms: z.number(),
  total_size: z.number().optional(),
  last_updated: z.string().optional(),
});
export type RommPlatformCollection = z.infer<typeof RommPlatformCollectionSchema>;

/**
 * RomM system status.
 */
export const RommSystemStatusSchema = z.object({
  version: z.string(),
  total_roms: z.number(),
  total_platforms: z.number(),
  total_size: z.number(),
  last_scan: z.string().optional(),
  is_scanning: z.boolean(),
});
export type RommSystemStatus = z.infer<typeof RommSystemStatusSchema>;

/**
 * RomM scan job.
 */
export const RommScanJobSchema = z.object({
  id: z.string(),
  platform: RommPlatformSchema,
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  progress: z.number(), // 0-100
  started_at: z.string(),
  completed_at: z.string().optional(),
  roms_processed: z.number(),
  roms_added: z.number(),
  roms_updated: z.number(),
  roms_removed: z.number(),
  error_message: z.string().optional(),
});
export type RommScanJob = z.infer<typeof RommScanJobSchema>;