/**
 * Opt-in TLS relaxation for self-signed homelab endpoints.
 *
 * Several services here (Wazuh Indexer and Manager, Synology DSM over 5001)
 * present certificates signed by their own internal CA. Node rejects those, so
 * the adapter fails with a TLS error rather than anything actionable.
 *
 * The wrong fix is `NODE_TLS_REJECT_UNAUTHORIZED=0`, which disables
 * verification for the whole process — including calls to real third parties.
 * Instead this exposes a per-request undici dispatcher, so exactly one fetch
 * relaxes verification and nothing else in the process is affected.
 *
 * It is opt-in per service (e.g. WAZUH_INSECURE_TLS=1) and off by default.
 * Prefer pointing NODE_EXTRA_CA_CERTS at the internal CA where you can; this
 * exists for the cases where that is not practical.
 */

// undici is imported lazily, INSIDE the function, not at module scope.
// A top-level import makes this module unloadable in a browser bundle (undici
// pulls node:net), and module-scope imports are hoisted regardless of whether
// the function is ever called. Bundlers only ever see this on the server path.
let insecureAgent: unknown;

/**
 * Returns fetch options carrying a dispatcher that skips certificate
 * verification, or an empty object when `enabled` is false.
 *
 * Spread into a fetch call:
 *   await fetch(url, { ...insecureTls(FLAG), headers })
 */
export function insecureTls(enabled: boolean): Record<string, unknown> {
  if (!enabled) return {};
  if (!insecureAgent) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Agent } = require("undici") as typeof import("undici");
    insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
  }
  return { dispatcher: insecureAgent };
}

/** True when an env var is set to a recognised truthy value. */
export function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true" || v === "yes";
}
