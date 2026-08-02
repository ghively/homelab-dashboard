/**
 * Shared reachability probe for the Hermes surfaces.
 *
 * The five Hermes adapters used to fetch the bare origin and grade "any status
 * below 500" as healthy. Every one of them therefore reported UP with a green
 * badge while actually receiving `404: Not Found` — the origin has no route,
 * the API lives under /health. A panel that says "Responded 404 in 5ms" next
 * to a healthy badge is worse than no panel: it tells you the service is fine
 * using the evidence that it is not answering.
 *
 * This probe hits a named health path and grades the response for what it is.
 */

import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { ADAPTER_TIMEOUT_MS, failureResult, makeFreshness } from "@/lib/adapter-http";

export interface ProbeOpts {
  adapter: string;
  title: string;
  baseUrl: string;
  /** Path that actually answers, e.g. "/health". */
  healthPath: string;
  envVar: string;
}

export function hermesFreshness(adapter: string, baseUrl: string): FreshnessInfo {
  return makeFreshness(adapter, baseUrl || "unconfigured");
}

export async function probeHermesEndpoint(opts: ProbeOpts): Promise<VisualQueryResult> {
  const { adapter, title, baseUrl, healthPath, envVar } = opts;

  if (!baseUrl) {
    return {
      title,
      subtitle: "Endpoint not configured",
      state: "empty",
      freshness: hermesFreshness(adapter, ""),
      metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
      summary: `Set ${envVar} to probe this service.`,
    };
  }

  const url = `${baseUrl.replace(/\/$/, "")}${healthPath}`;
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS), cache: "no-store" });
    const latency = Date.now() - start;

    // Grade honestly. A 404 on the health path means this is not the service
    // we think it is (or the path moved) — that is a configuration fault, and
    // it must not read as UP.
    let state: VisualQueryResult["state"];
    let note: string;
    if (res.ok) {
      state = latency > 2000 ? "warning" : "healthy";
      note = `Healthy (HTTP ${res.status}) in ${latency}ms`;
    } else if (res.status === 401 || res.status === 403) {
      state = "denied";
      note = `Reachable but rejected our credentials (HTTP ${res.status})`;
    } else if (res.status === 404) {
      state = "warning";
      note = `No health route at ${healthPath} (HTTP 404) — wrong port or path`;
    } else if (res.status >= 500) {
      state = "critical";
      note = `Service reported an error (HTTP ${res.status})`;
    } else {
      state = "warning";
      note = `Unexpected HTTP ${res.status}`;
    }

    let payload: Record<string, unknown> | null = null;
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    }

    const metrics: Metric[] = [
      { label: "Status", value: state === "healthy" ? "UP" : state.toUpperCase(), state },
      { label: "HTTP", value: res.status, state },
      { label: "Latency", value: latency, unit: "ms", state: latency > 2000 ? "warning" : "healthy" },
    ];
    if (payload && typeof payload.version === "string") {
      metrics.push({ label: "Version", value: payload.version });
    }
    if (payload && typeof payload.platform === "string") {
      metrics.push({ label: "Platform", value: payload.platform });
    }

    return {
      title,
      subtitle: url,
      state,
      freshness: hermesFreshness(adapter, baseUrl),
      metrics,
      summary: note,
    };
  } catch (err) {
    return failureResult(adapter, title, url, err, start);
  }
}
