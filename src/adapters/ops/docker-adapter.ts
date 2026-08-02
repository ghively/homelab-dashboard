// Docker adapter — container fleet, read through Prometheus + cAdvisor.
//
// WHY NOT THE DOCKER ENGINE API. The dashboard runs as a systemd *user* unit;
// shelling out to `docker ps` from a Next.js route handler is fragile, and the
// Docker socket is a unix socket, which Node's global fetch cannot address —
// so it cannot go through adapter-http's timeout wrapper. No host on this
// fleet publishes the Engine API or a socket-proxy over TCP (2375 is closed
// everywhere, verified 2026-08-02). cAdvisor is the one real HTTP source for
// container state, and Prometheus already scrapes it.
//
// WHY NOT cAdvisor DIRECTLY. cAdvisor's /api/v1.3/docker is ~6.8 MB on this
// fleet because it emits every container label; see the cost note in
// cadvisor-adapter.ts. Prometheus answers the same questions in a few KB when
// the query aggregates the labels away, and it covers every cAdvisor instance
// at once instead of one host per URL.
//
// Queries (all instant, all against the configured Prometheus):
//   max by (name, instance, image) (container_last_seen{name!=""})
//   max by (name) (container_start_time_seconds{name!=""})
//   sum by (name) (container_memory_usage_bytes{name!=""})
//   sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m]))
//   up{job="cadvisor"}
//
// HONESTY LIMIT, stated in the panel itself: cAdvisor only reports containers
// that are RUNNING. There is no stopped/exited/unhealthy count available from
// this source, so none is reported — the fixture this replaces invented all
// three. Coverage is likewise limited to hosts running a scraped cAdvisor; the
// panel names them rather than implying fleet-wide truth.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";
import { formatBytes } from "./prom-text";

// Falls back to PROMETHEUS_URL because the data lives in the same Prometheus.
// The dedicated var exists so a separate metrics backend can be pointed at
// without moving the whole ops world.
const DOCKER_PROMETHEUS_URL = process.env.DOCKER_PROMETHEUS_URL || process.env.PROMETHEUS_URL || "";

/** A container has gone stale if cAdvisor has not seen it in this long. */
const STALE_AFTER_SECONDS = 300;

interface PromVector {
  data?: {
    result?: Array<{ metric?: Record<string, string>; value?: [number, string] }>;
  };
}

async function instantQuery(base: string, query: string, timeoutMs?: number): Promise<PromVector> {
  const url = `${base}/api/v1/query?query=${encodeURIComponent(query)}`;
  return timeoutMs === undefined ? fetchJson<PromVector>(url) : fetchJson<PromVector>(url, {}, timeoutMs);
}

/** name → numeric value, for the single-label aggregations below. */
function byName(v: PromVector | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of v?.data?.result ?? []) {
    const name = r.metric?.name;
    const value = Number(r.value?.[1]);
    if (name && Number.isFinite(value)) out.set(name, value);
  }
  return out;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `up ${d}d ${h}h`;
  if (h > 0) return `up ${h}h ${m}m`;
  return `up ${m}m`;
}

class DockerAdapter implements DataAdapter {
  readonly name = "docker";
  readonly description = "Docker container fleet — running containers via cAdvisor/Prometheus.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, DOCKER_PROMETHEUS_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!DOCKER_PROMETHEUS_URL) {
      return notConfiguredResult(this.name, "Docker", "DOCKER_PROMETHEUS_URL");
    }

    const base = DOCKER_PROMETHEUS_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      // The inventory query carries the panel; the rest is enrichment on the
      // short budget so one slow evaluation cannot take the panel down.
      const inventory = await instantQuery(base, 'max by (name, instance, image) (container_last_seen{name!=""})');

      const [startedBody, memBody, cpuBody, exportersBody] = await Promise.all([
        instantQuery(base, 'max by (name) (container_start_time_seconds{name!=""})', ADAPTER_FANOUT_TIMEOUT_MS).catch(
          () => null,
        ),
        instantQuery(base, 'sum by (name) (container_memory_usage_bytes{name!=""})', ADAPTER_FANOUT_TIMEOUT_MS).catch(
          () => null,
        ),
        instantQuery(
          base,
          'sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[5m]))',
          ADAPTER_FANOUT_TIMEOUT_MS,
        ).catch(() => null),
        instantQuery(base, 'up{job="cadvisor"}', ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
      ]);

      const rows = inventory.data?.result ?? [];
      const startedAt = byName(startedBody);
      const memory = byName(memBody);
      const cpu = byName(cpuBody);

      const exporters = exportersBody?.data?.result ?? [];
      const exportersUp = exporters.filter((r) => Number(r.value?.[1]) === 1);
      const exporterNames = exporters.map((r) => r.metric?.instance ?? "unknown");

      const nowSeconds = Date.now() / 1000;
      const hosts = new Set<string>();
      const stale: string[] = [];

      const items: Item[] = rows.map((r, i) => {
        const name = r.metric?.name ?? `container-${i}`;
        const host = r.metric?.instance ?? "unknown";
        hosts.add(host);
        const lastSeen = Number(r.value?.[1]);
        const age = Number.isFinite(lastSeen) ? nowSeconds - lastSeen : Number.NaN;
        const isStale = Number.isFinite(age) && age > STALE_AFTER_SECONDS;
        if (isStale) stale.push(name);

        const started = startedAt.get(name);
        const mem = memory.get(name);
        const cpuCores = cpu.get(name);

        return {
          id: `container:${host}:${name}`,
          label: name,
          subtitle: [
            r.metric?.image,
            started !== undefined ? formatUptime(nowSeconds - started) : "",
            isStale ? `last seen ${Math.round(age / 60)}m ago` : "",
          ]
            .filter(Boolean)
            .join(" • "),
          value: mem !== undefined ? formatBytes(mem) : "",
          state: (isStale ? "stale" : "healthy") as "stale" | "healthy",
          group: host,
          meta: {
            host,
            ...(r.metric?.image ? { image: r.metric.image } : {}),
            ...(mem !== undefined ? { memoryBytes: mem } : {}),
            ...(cpuCores !== undefined ? { cpuCores: Number(cpuCores.toFixed(3)) } : {}),
          },
        };
      });

      const totalMemory = [...memory.values()].reduce((a, b) => a + b, 0);
      const totalCpu = [...cpu.values()].reduce((a, b) => a + b, 0);

      const metrics: Metric[] = [
        { label: "Running Containers", value: rows.length, state: rows.length ? "healthy" : "empty" },
        { label: "Hosts Covered", value: hosts.size },
        {
          label: "cAdvisor Exporters",
          value: `${exportersUp.length}/${exporters.length}`,
          state: exporters.length && exportersUp.length < exporters.length ? "critical" : "healthy",
        },
        ...(stale.length
          ? [{ label: "Stale (not seen 5m)", value: stale.length, state: "stale" as const }]
          : []),
        ...(memory.size ? [{ label: "Container Memory", value: formatBytes(totalMemory) }] : []),
        ...(cpu.size ? [{ label: "Container CPU", value: `${totalCpu.toFixed(2)} cores` }] : []),
      ];

      const state: VisualQueryResult["state"] =
        exporters.length > 0 && exportersUp.length < exporters.length
          ? "critical"
          : stale.length > 0
            ? "stale"
            : rows.length === 0
              ? "empty"
              : "healthy";

      const coverage = exporterNames.length ? exporterNames.join(", ") : [...hosts].join(", ");

      return {
        title: "Docker — Running Containers",
        subtitle: `${rows.length} running on ${hosts.size} host${hosts.size === 1 ? "" : "s"} • via cAdvisor (${coverage})`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `${rows.length} running container(s) across ${hosts.size} cAdvisor-monitored host(s) [${coverage}], using ${formatBytes(totalMemory)} of memory and ${totalCpu.toFixed(2)} CPU cores. Stopped containers are not visible to cAdvisor and are not counted.`,
      };
    } catch (err) {
      return failureResult(this.name, "Docker", base, err, start);
    }
  }
}

const adapter = new DockerAdapter();
export { adapter as default };
