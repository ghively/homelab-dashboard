// 1Panel server-management adapter (world adapter name: "onepanel").
//
// 1Panel v2 authenticates programmatic access with an API key, not the login
// password: every request carries
//   1Panel-Token:     md5("1panel" + apiKey + timestamp)
//   1Panel-Timestamp: <unix seconds>
// and the API must be enabled in Settings with the caller IP allow-listed.
//
// The previous version sent `Authorization: Bearer <ONEPANEL_API_KEY>` against
// /api/v1, which 1Panel v2 does not accept, so it could only ever render its
// offline/fixture branch. This version performs the real v2 handshake. When no
// key is configured (the current deployment — API access is disabled), it
// reports `denied` naming ONEPANEL_API_KEY rather than a fabricated panel.

import { createHash } from "node:crypto";
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import { AdapterHttpError, classifyError, fetchJson, makeFreshness } from "@/lib/adapter-http";

/**
 * 1Panel v2 wraps every reply in {code, message, data} and returns HTTP 200
 * even for auth failures ("API access disabled", bad key → code 401). Treat a
 * non-200 envelope code as the real status so a 200-wrapped 401 does not read
 * as healthy.
 */
interface Envelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

function unwrap<T>(env: Envelope<T>, url: string): T {
  if (env.code != null && env.code !== 200) {
    throw new AdapterHttpError(url, env.code, env.message);
  }
  return env.data as T;
}

const ONEPANEL_BASE_URL = process.env.ONEPANEL_BASE_URL || "";
const ONEPANEL_API_KEY = process.env.ONEPANEL_API_KEY || "";

interface OsData {
  os?: string;
  platform?: string;
  kernelArch?: string;
  hostname?: string;
  kernelVersion?: string;
}

interface CurrentData {
  cpuUsedPercent?: number;
  memoryUsedPercent?: number;
  load1?: number;
  uptime?: number;
  procs?: number;
}

function tokenHeaders(): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const token = createHash("md5").update(`1panel${ONEPANEL_API_KEY}${ts}`).digest("hex");
  return {
    "1Panel-Token": token,
    "1Panel-Timestamp": ts,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function freshness(start?: number): FreshnessInfo {
  return makeFreshness("onepanel", ONEPANEL_BASE_URL || "unconfigured", start);
}

export class OnePanelAdapter implements DataAdapter {
  readonly name = "onepanel";
  readonly description = "1Panel — host CPU/memory and OS via the v2 API.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return freshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) return getFixtureForState(this.name, fixtureState);

    if (!ONEPANEL_BASE_URL) {
      return {
        title: "1Panel",
        subtitle: "Not configured",
        state: "empty",
        freshness: freshness(),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set ONEPANEL_BASE_URL to connect this service.",
      };
    }

    if (!ONEPANEL_API_KEY) {
      // Service is reachable, but v2 needs an API key (login password does not
      // work for the API). Honest `denied`, naming the exact fix.
      return {
        title: "1Panel",
        subtitle: "API key required",
        state: "denied",
        freshness: freshness(),
        metrics: [{ label: "Status", value: "API KEY REQUIRED", state: "denied" }],
        summary:
          "Set ONEPANEL_API_KEY and enable the API in 1Panel → Settings (allow-list this host). The login password cannot authenticate the API.",
      };
    }

    const base = ONEPANEL_BASE_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const osUrl = `${base}/api/v2/dashboard/base/os`;
      const os = unwrap(
        await fetchJson<Envelope<OsData>>(osUrl, { method: "POST", headers: tokenHeaders() }),
        osUrl,
      );

      const curUrl = `${base}/api/v2/dashboard/current/all/all`;
      const current = await fetchJson<Envelope<CurrentData>>(curUrl, {
        method: "POST",
        headers: tokenHeaders(),
        body: JSON.stringify({ ioOption: "all", netOption: "all" }),
      })
        .then((e) => unwrap(e, curUrl))
        .catch(() => null);

      const cpu = current?.cpuUsedPercent;
      const mem = current?.memoryUsedPercent;

      const metrics: Metric[] = [];
      if (typeof cpu === "number") {
        metrics.push({ label: "CPU", value: `${cpu.toFixed(1)}%`, state: cpu > 90 ? "warning" : "healthy" });
      }
      if (typeof mem === "number") {
        metrics.push({ label: "Memory", value: `${mem.toFixed(1)}%`, state: mem > 90 ? "warning" : "healthy" });
      }
      if (typeof current?.load1 === "number") {
        metrics.push({ label: "Load (1m)", value: current.load1.toFixed(2) });
      }
      if (typeof current?.procs === "number") {
        metrics.push({ label: "Processes", value: current.procs });
      }
      if (os?.os || os?.platform) {
        metrics.push({ label: "OS", value: os.platform ?? os.os ?? "unknown" });
      }
      if (os?.hostname) {
        metrics.push({ label: "Host", value: os.hostname });
      }

      const worst = (cpu ?? 0) > 90 || (mem ?? 0) > 90 ? "warning" : "healthy";
      return {
        title: "1Panel",
        subtitle: os?.hostname
          ? `${os.hostname} • ${os.platform ?? os.os ?? ""}`.trim()
          : "Server management",
        state: worst,
        freshness: freshness(start),
        metrics: metrics.length ? metrics : [{ label: "Status", value: "OK", state: "healthy" }],
        summary: `1Panel on ${os?.hostname ?? base}: CPU ${cpu?.toFixed(0) ?? "?"}%, memory ${
          mem?.toFixed(0) ?? "?"
        }%.`,
      };
    } catch (err) {
      // "API access disabled" and a rejected key both come back as 401/403 →
      // denied; a dead host is offline. classifyError draws that line.
      if (err instanceof AdapterHttpError && (err.status === 401 || err.status === 403)) {
        return {
          title: "1Panel",
          subtitle: "API access denied",
          state: "denied",
          freshness: freshness(start),
          metrics: [{ label: "Status", value: "DENIED", state: "denied" }],
          summary:
            "1Panel rejected the API key (or the API is disabled). Check ONEPANEL_API_KEY and enable/allow-list the API in Settings.",
        };
      }
      const c = classifyError(err);
      return {
        title: "1Panel",
        subtitle: c.message,
        state: c.state,
        freshness: freshness(start),
        metrics: [{ label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state }],
        summary: `onepanel: ${c.message} (${base})`,
      };
    }
  }
}

const adapter = new OnePanelAdapter();
export { adapter as default };
