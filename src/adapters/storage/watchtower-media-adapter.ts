// watchtower-media adapter — Docker container fleet for gh-media.
//
// NOTE ON THE DATA SOURCE. This previously queried Watchtower at
// `/v1/containers`. That endpoint does not exist. Watchtower's HTTP API is only
// `POST /v1/update` (trigger a scan) plus an optional `/v1/metrics`, both
// token-gated, and neither returns a container list — so the adapter could only
// ever render offline. Verified against the live host: every Watchtower path
// returns 404.
//
// Container inventory comes from the Docker Engine API instead, which is the
// real source for it: GET /containers/json?all=1. Point WATCHTOWER_MEDIA_URL
// at a Docker API endpoint or a socket-proxy (e.g. tecnativa/docker-socket-proxy)
// exposing it read-only. Watchtower's update state is not exposed by any API, so
// no "updates available" metric is reported rather than inventing one.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";

const WATCHTOWER_MEDIA_URL = process.env.WATCHTOWER_MEDIA_URL || "";

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "watchtower-media",
    source: WATCHTOWER_MEDIA_URL || "unconfigured",
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

/** Subset of Docker's /containers/json entries this adapter reads. */
interface DockerContainer {
  Id?: string;
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
}

class WatchtowerMediaAdapter implements DataAdapter {
  readonly name = "watchtower-media";
  readonly description = "Docker container fleet on gh-media — running state and images.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    if (WATCHTOWER_MEDIA_URL) {
      try {
        await fetch(`${WATCHTOWER_MEDIA_URL}/containers/json?all=1`, { signal: AbortSignal.timeout(5000) });
      } catch {
        // Unreachable — freshness still records the endpoint queried.
      }
    }
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    if (!WATCHTOWER_MEDIA_URL) {
      return {
        title: "Docker — gh-media",
        subtitle: "Endpoint not configured",
        state: "empty",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set WATCHTOWER_MEDIA_URL to a Docker Engine API or socket-proxy endpoint.",
      };
    }

    try {
      const res = await fetch(`${WATCHTOWER_MEDIA_URL}/containers/json?all=1`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const containers = (await res.json()) as DockerContainer[];
      const running = containers.filter((c) => c.State === "running");
      const stopped = containers.filter((c) => c.State === "exited" || c.State === "created");
      const unhealthy = containers.filter((c) => (c.Status ?? "").includes("unhealthy"));

      const metrics: Metric[] = [
        { label: "Containers", value: containers.length, state: "healthy" },
        { label: "Running", value: running.length, state: "healthy" },
        {
          label: "Stopped",
          value: stopped.length,
          state: stopped.length > 0 ? "warning" : "healthy",
        },
        {
          label: "Unhealthy",
          value: unhealthy.length,
          state: unhealthy.length > 0 ? "critical" : "healthy",
        },
      ];

      const items: Item[] = containers.map((c, i) => ({
        id: c.Id?.slice(0, 12) ?? `container-${i}`,
        label: (c.Names?.[0] ?? "").replace(/^\//, "") || (c.Id?.slice(0, 12) ?? "container"),
        subtitle: [c.Image, c.Status].filter(Boolean).join(" • "),
        state: (c.Status ?? "").includes("unhealthy")
          ? ("critical" as const)
          : c.State === "running"
            ? ("healthy" as const)
            : ("warning" as const),
        group: c.State === "running" ? "running" : "stopped",
      }));

      return {
        title: "Docker — gh-media",
        subtitle: `${running.length}/${containers.length} running`,
        state: unhealthy.length > 0 ? "critical" : stopped.length > 0 ? "warning" : "healthy",
        freshness: makeFreshness(),
        metrics,
        items,
        summary: `${running.length} of ${containers.length} containers running`,
      };
    } catch {
      return {
        title: "Docker — gh-media",
        subtitle: "Docker API unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new WatchtowerMediaAdapter();
export { adapter as default };
