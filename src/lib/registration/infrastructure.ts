/**
 * Live-adapter registration for the `infrastructure` world.
 *
 * One module per world so that wiring several worlds in parallel never
 * contends on a single file. Called from initAdapters() in adapter-runtime.
 *
 * The rule from adapter-runtime applies unchanged here: register an adapter
 * ONLY when its query() derives every displayed value from a real fetch, and
 * only when its env var is set. An unconfigured service must fall through to a
 * labelled fixture rather than probing a hardcoded default host and rendering
 * a misleading `offline`.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import gpu from "@/adapters/infra/gpu-adapter";
import valkey from "@/adapters/valkey-adapter";
import onepanel from "@/adapters/onepanel-adapter";

/**
 * Infrastructure world live adapters.
 *
 *   gpu      — real CUDA device VRAM via ComfyUI /system_stats. GPU_STATS_URL.
 *   valkey   — real RESP PING + INFO over TCP. VALKEY_HOST.
 *   onepanel — real 1Panel v2 API-key handshake. ONEPANEL_BASE_URL; renders
 *              `denied` until ONEPANEL_API_KEY is set (API access is disabled
 *              on the current deployment).
 *
 * Deliberately NOT registered (no real, reachable service — see the audit):
 *   pihole, unifi   — LAN-only (192.168.x); unreachable from this VPS host.
 *   iot-vlan        — no service; would require the (unreachable) UniFi controller.
 *   garage-s3       — no Garage cluster deployed on the fleet.
 *   smb-nfs         — no reachable share-metrics source (gh-storage exporter filtered).
 * These fall through to labelled fixtures rather than a misleading live panel.
 */
export function register(registry: Map<string, DataAdapter>): void {
  if (process.env.GPU_STATS_URL) registry.set("gpu", gpu);
  if (process.env.VALKEY_HOST) registry.set("valkey", valkey);
  // Registered on the URL alone so a missing API key surfaces as `denied`
  // (reachable, needs a credential) rather than a fixture.
  if (process.env.ONEPANEL_BASE_URL) registry.set("onepanel", onepanel);
}
