/**
 * Barrel for the src/adapters/* modules.
 *
 * Regenerated from what these modules actually export. The previous version
 * re-exported several names that did not exist (Fail2banAdapter has only a
 * default export) and mixed types into value exports, which `isolatedModules`
 * rejects. Nothing imported this file, so the breakage was invisible.
 *
 * Types are re-exported with `export type` — required under isolatedModules,
 * and it keeps them out of the runtime bundle.
 */

// ── Base ─────────────────────────────────────────────────────────────────
export { BaseAdapter } from "./BaseAdapter";

// ── Shared contracts ─────────────────────────────────────────────────────
export {
  MetricSchema,
  ItemSchema,
  SeriesSchema,
  NodeSchema,
  EdgeSchema,
  EventSchema,
  FreshnessInfoSchema,
  VisualQueryResultSchema,
} from "./types";

export type {
  VisualStateValue,
  Metric,
  Item,
  Series,
  Node,
  Edge,
  Event,
  FreshnessInfo,
  VisualQueryResult,
  ResolvedQueryResult,
  ServiceAdapter,
  CredentialEntry,
  ApiClientConfig,
  AdapterConfig,
  AdapterResult,
  AdapterState,
  HealthCheck,
} from "./types";

// ── Security ─────────────────────────────────────────────────────────────
export { WazuhAdapter } from "./WazuhAdapter";
export type { WazuhConfig } from "./WazuhAdapter";
// Fail2banAdapter exposes only a default export.
export { default as Fail2banAdapter } from "./Fail2banAdapter";

// ── Storage ──────────────────────────────────────────────────────────────
export { SynologyAdapter } from "./SynologyAdapter";
export type { SynologyConfig } from "./SynologyAdapter";
export { SMBNFSAdapter } from "./SMBNFSAdapter";
export type { SMBNFSConfig } from "./SMBNFSAdapter";
export { SyncthingAdapter } from "./SyncthingAdapter";
export type { SyncthingConfig } from "./SyncthingAdapter";
export { SpoolmanAdapter } from "./SpoolmanAdapter";
export type { SpoolmanConfig } from "./SpoolmanAdapter";
export { WatchtowerAdapter } from "./WatchtowerAdapter";
export type { WatchtowerConfig } from "./WatchtowerAdapter";

// ── Network ──────────────────────────────────────────────────────────────
export { CaddyAdapter } from "./CaddyAdapter";
export type { CaddyConfig } from "./CaddyAdapter";

// ── Home automation ──────────────────────────────────────────────────────
export { HomeAssistantAdapter } from "./home-assistant";
export { MQTTAdapter } from "./mqtt";
export { NodeRedAdapter } from "./node-red";
export { WyomingAdapter } from "./wyoming";

// ── Personal / productivity ──────────────────────────────────────────────
export { OutlineAdapter } from "./outline";
export { RoundcubeAdapter } from "./roundcube";
export { StalwartMailAdapter } from "./stalwart-mail";
export { TelegramAdapter } from "./telegram";
export { VikunjaAdapter } from "./vikunja";
