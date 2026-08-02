/**
 * Live-adapter registration for the `security` world.
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
import onepassword from "@/adapters/security/onepassword-adapter";

/**
 * Security world live adapters.
 *
 *   1password — real `op` CLI service-account query. The op CLI is installed on
 *               this host, so the adapter is registered unconditionally; with no
 *               OP_SERVICE_ACCOUNT_TOKEN it renders `denied` naming that variable
 *               (never fabricated vault statistics).
 *
 * Deliberately NOT registered:
 *   fail2ban — needs a fail2ban HTTP shim at FAIL2BAN_API_URL; none is deployed
 *              on the fleet (fail2ban has no HTTP surface of its own). Falls
 *              through to a labelled fixture.
 */
export function register(registry: Map<string, DataAdapter>): void {
  registry.set("1password", onepassword);
}
