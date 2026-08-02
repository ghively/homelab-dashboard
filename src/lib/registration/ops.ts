/**
 * Live-adapter registration for the `ops` world.
 *
 * One module per world so that wiring several worlds in parallel never
 * contends on a single file. Called from initAdapters() in adapter-runtime.
 *
 * The rule from adapter-runtime applies unchanged here: register an adapter
 * ONLY when its query() derives every displayed value from a real fetch, and
 * only when its env var is set. An unconfigured service must fall through to a
 * labelled fixture rather than probing a hardcoded default host and rendering
 * a misleading `offline`.
 *
 * GROUND TRUTH, 2026-08-02 — what was probed and what it proved.
 *
 *   alertmanager  Real: prom/alertmanager v0.28.1 runs as `monitoring-alertmanager`
 *                 on gh-arm. Its published port is 127.0.0.1:9093, so it is
 *                 unreachable from this host. Registered anyway: with
 *                 ALERTMANAGER_URL set to the true address the panel renders
 *                 `offline — Connection refused`, which names a real host to fix.
 *                 That beats a fixture inventing "3 firing alerts". The parse
 *                 path was verified against the live instance through a
 *                 temporary SSH port-forward (1 active alert, 0 silences, 2
 *                 receivers, cluster ready).
 *
 *   alloy         Real and reachable: Grafana Alloy v1.18.0 on THIS host,
 *                 127.0.0.1:12345 (loopback-bound, which is fine — the
 *                 dashboard runs on the same host). Registered live.
 *                 gh-arm also runs an Alloy (v1.7.4) but likewise on loopback
 *                 only, so it is not reachable and not represented here.
 *
 *   docker        No Engine API over TCP anywhere on the fleet (2375 closed on
 *                 every host) and no socket-proxy. cAdvisor via Prometheus is
 *                 the only honest HTTP source; see the header of
 *                 docker-adapter.ts for the whole argument. Registered live,
 *                 with the "running containers only" limit stated in the panel.
 *
 *   systemd       NOT REGISTERED. There is no queryable surface. node_exporter's
 *                 systemd collector is disabled on every exporter in
 *                 NODE_EXPORTER_URLS (`grep -c '^node_systemd' /metrics` = 0 on
 *                 gh-ai, gh-arm, gh-media, gh-git), Prometheus holds zero
 *                 metrics matching /systemd/, and Loki's label set is
 *                 filename/host/job/service_name with no unit label. Any
 *                 systemd adapter would have to invent its numbers. Leave it as
 *                 a labelled fixture, or drop it from WORLDS.
 *
 *   watchtower-*  NOT REGISTERED — and the missing WATCHTOWER_*_URL vars are not
 *                 the reason. Watchtower has no container-listing API at all
 *                 (see the note atop watchtower-vps-adapter.ts), so those three
 *                 adapters actually want a Docker Engine API endpoint, which
 *                 does not exist on this fleet:
 *                   vps/gh-ai   containrrr/watchtower, cmd
 *                               `--schedule --cleanup --label-enable`; no
 *                               --http-api-*, no port bindings, no API token.
 *                   gh-media    identical: no port bindings, no token.
 *                   gh-storage  is a Synology (GH-Storage); `docker` is not
 *                               installed and no watchtower exists.
 *                 Setting the env vars would point them at nothing. Left
 *                 unregistered on purpose.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import alertmanager from "@/adapters/ops/alertmanager-adapter";
import alloy from "@/adapters/ops/alloy-adapter";
import docker from "@/adapters/ops/docker-adapter";

/**
 * Env var that must be set for each adapter to count as configured. Without it
 * the adapter stays out of the registry and queryAdapter() serves a labelled
 * fixture.
 *
 * `docker` accepts either DOCKER_PROMETHEUS_URL or the shared PROMETHEUS_URL,
 * matching the fallback inside the adapter — gating on the dedicated var alone
 * would leave the adapter permanently unregistered on a fleet that only sets
 * PROMETHEUS_URL, while gating on PROMETHEUS_URL alone would ignore an explicit
 * override.
 */
const ENV_GATED: Array<[name: string, envVars: string[], adapter: DataAdapter]> = [
  ["alertmanager", ["ALERTMANAGER_URL"], alertmanager],
  ["alloy", ["ALLOY_URL"], alloy],
  ["docker", ["DOCKER_PROMETHEUS_URL", "PROMETHEUS_URL"], docker],
];

export function register(registry: Map<string, DataAdapter>): void {
  for (const [name, envVars, adapter] of ENV_GATED) {
    if (envVars.some((v) => process.env[v])) registry.set(name, adapter);
  }
}
