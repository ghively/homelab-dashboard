/**
 * Shared Home Assistant REST client.
 *
 * Two panels read the same instance — `home-assistant` (the whole entity
 * registry) and `scenes` in the personal world (scene.* only) — so the URL
 * resolution, the auth header and, most importantly, the no-token behaviour
 * live in one place.
 *
 * The no-token case is the interesting one. Home Assistant is running at
 * gh-media:8123 and answers /api/ with 401; the long-lived token that Hermes
 * used is recorded as expired. Returning "not configured" there would be a
 * lie — the service is up and we proved it. probeUnauthorized() makes the call
 * anyway and reports what the server actually said, so the panel reads
 * `denied` and names the token to regenerate.
 */

import type { VisualQueryResult } from "../types";
import { fetchJson, fetchWithTimeout, makeFreshness } from "@/lib/adapter-http";

export const HA_URL_ENV = "HOME_ASSISTANT_URL";
export const HA_TOKEN_ENV = "HOME_ASSISTANT_TOKEN";

export interface HaEntity {
  entity_id: string;
  state?: string;
  last_changed?: string;
  attributes?: Record<string, unknown>;
}

export interface HaConfig {
  version?: string;
  location_name?: string;
  time_zone?: string;
  components?: string[];
  state?: string;
}

/** Configured base URL with any trailing slash removed, or "" when unset. */
export function haBaseUrl(): string {
  return (process.env[HA_URL_ENV] ?? "").replace(/\/$/, "");
}

export function haToken(): string {
  return process.env[HA_TOKEN_ENV] ?? "";
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${haToken()}`, "Content-Type": "application/json" };
}

export async function haStates(base: string, timeoutMs?: number): Promise<HaEntity[]> {
  return fetchJson<HaEntity[]>(`${base}/api/states`, { headers: authHeaders() }, timeoutMs);
}

export async function haConfig(base: string, timeoutMs?: number): Promise<HaConfig> {
  return fetchJson<HaConfig>(`${base}/api/config`, { headers: authHeaders() }, timeoutMs);
}

/**
 * Confirm the instance is really there before reporting `denied`.
 *
 * Returns the HTTP status /api/ gave us without credentials. A 401 is the
 * proof that Home Assistant is alive and simply will not talk to us; anything
 * else (or a throw) means the problem is not the token, and the caller should
 * let the transport error classify normally.
 */
export async function probeUnauthorized(base: string): Promise<number> {
  const res = await fetchWithTimeout(`${base}/api/`);
  return res.status;
}

/**
 * The panel for "Home Assistant answered, but not to us."
 *
 * `status` is the real observed status code, not an assumption — it is the
 * only thing this result asserts beyond the configured URL.
 */
export function haDeniedResult(
  adapter: string,
  title: string,
  base: string,
  status: number,
  startedAt: number,
): VisualQueryResult {
  return {
    title,
    subtitle: `Reachable, but the API rejected the request (HTTP ${status})`,
    state: "denied",
    freshness: makeFreshness(adapter, base, startedAt),
    metrics: [
      { label: "Status", value: "NEEDS TOKEN", state: "denied" },
      { label: "API Response", value: `HTTP ${status}` },
      { label: "Endpoint", value: base },
    ],
    summary:
      `Home Assistant at ${base} answered /api/ with HTTP ${status}. ` +
      `Set ${HA_TOKEN_ENV} to a valid long-lived access token to read live entity data.`,
  };
}
