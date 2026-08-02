// Stalwart Mail adapter — server liveness, readiness and advertised services.
//
// WHAT THIS PANEL DELIBERATELY DOES NOT SHOW
// ------------------------------------------
// Queue depth, deferred counts and failed-delivery counts. The previous
// version of this file fetched /api/v1/health, /api/v1/queue/stats and
// /api/v1/reports and defaulted every one of those numbers to 0 when the call
// failed — which it always did, because none of those paths exist. A panel
// reading "0 failed deliveries" from a server it never successfully queried is
// worse than no panel. This deployment answers 404 on every /api/* path, so
// there is no queue number to report and none is invented.
//
// WHAT IT DOES SHOW
// -----------------
// Only what the server actually answers, unauthenticated:
//   GET /healthz/live                              → process liveness
//   GET /healthz/ready                             → readiness to serve
//   GET /.well-known/oauth-authorization-server    → the mail domain it serves
//   GET /jmap/session                              → advertised JMAP capabilities
//   GET /api/telemetry/metrics                     → whether the management API
//                                                    is exposed at all, reported
//                                                    as the observed status code
//
// If STALWART_ADMIN_USER / STALWART_ADMIN_PASSWORD are set they are sent on the
// management probe, so a deployment that does expose the API will report
// `denied` on bad credentials instead of silently showing nothing.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchWithTimeout,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const URL_ENV = "STALWART_URL";
const USER_ENV = "STALWART_ADMIN_USER";
const PASS_ENV = "STALWART_ADMIN_PASSWORD";

/** An observed HTTP result: the status code and, when JSON, the parsed body. */
interface Observed {
  status: number;
  body: unknown;
}

async function observe(url: string, headers: Record<string, string> = {}): Promise<Observed | null> {
  try {
    const res = await fetchWithTimeout(url, { headers }, ADAPTER_FANOUT_TIMEOUT_MS);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return null;
  }
}

function hostOf(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Turn the management-API probe into a metric that states a fact, not a guess. */
function managementMetric(probe: Observed | null, authenticated: boolean): Metric {
  if (!probe) return { label: "Management API", value: "no response", state: "warning" };
  if (probe.status === 404) {
    return { label: "Management API", value: "not exposed (HTTP 404)", state: "empty" };
  }
  if (probe.status === 401 || probe.status === 403) {
    return {
      label: "Management API",
      value: authenticated ? `credentials rejected (HTTP ${probe.status})` : `needs auth (HTTP ${probe.status})`,
      state: "denied",
    };
  }
  if (probe.status === 200) return { label: "Management API", value: "available", state: "healthy" };
  return { label: "Management API", value: `HTTP ${probe.status}`, state: "warning" };
}

export class StalwartMailAdapter implements DataAdapter {
  readonly name = "stalwart-mail";
  readonly description = "Stalwart Mail — liveness, readiness and advertised mail services.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[URL_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const configured = process.env[URL_ENV];
    if (!configured) return notConfiguredResult(this.name, "Stalwart Mail", URL_ENV);

    const base = configured.replace(/\/$/, "");
    const user = process.env[USER_ENV];
    const pass = process.env[PASS_ENV];
    const adminHeaders: Record<string, string> =
      user && pass
        ? { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` }
        : {};

    const start = Date.now();
    try {
      // Liveness carries the panel — if it does not answer, nothing else is
      // worth reporting and failureResult() explains why.
      const live = await fetchWithTimeout(`${base}/healthz/live`);

      const [ready, oauth, jmap, mgmt] = await Promise.all([
        observe(`${base}/healthz/ready`),
        observe(`${base}/.well-known/oauth-authorization-server`),
        observe(`${base}/jmap/session`),
        observe(`${base}/api/telemetry/metrics`, adminHeaders),
      ]);

      const issuer = (oauth?.body as { issuer?: string } | null)?.issuer;
      const mailDomain = hostOf(issuer);
      const capabilities = Object.keys(
        (jmap?.body as { capabilities?: Record<string, unknown> } | null)?.capabilities ?? {},
      );
      const coreCaps = (jmap?.body as {
        capabilities?: { "urn:ietf:params:jmap:core"?: { maxSizeUpload?: number } };
      } | null)?.capabilities?.["urn:ietf:params:jmap:core"];

      const liveOk = live.status === 200;
      const readyOk = ready?.status === 200;

      const metrics: Metric[] = [
        { label: "Liveness", value: `HTTP ${live.status}`, state: liveOk ? "healthy" : "critical" },
        {
          label: "Readiness",
          value: ready ? `HTTP ${ready.status}` : "no response",
          state: readyOk ? "healthy" : "critical",
        },
        ...(mailDomain ? [{ label: "Mail Domain", value: mailDomain }] : []),
        {
          label: "JMAP",
          value: capabilities.length ? `${capabilities.length} capabilities` : "not advertised",
          state: capabilities.length ? "healthy" : "empty",
        },
        ...(coreCaps?.maxSizeUpload
          ? [{ label: "Max Upload", value: `${Math.round(coreCaps.maxSizeUpload / 1_000_000)} MB` }]
          : []),
        managementMetric(mgmt, Boolean(user && pass)),
        { label: "Endpoint", value: base },
      ];

      const state: VisualQueryResult["state"] = liveOk && readyOk ? "healthy" : "critical";
      const mgmtUnavailable = mgmt?.status === 404;

      return {
        title: "Stalwart Mail — Mail Server",
        subtitle:
          `${mailDomain ?? base} • live ${live.status} / ready ${ready?.status ?? "?"}` +
          (capabilities.length ? ` • JMAP ${capabilities.length} caps` : ""),
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items: capabilities.slice(0, 20).map((cap) => ({
          id: `cap:${cap}`,
          label: cap.replace(/^urn:ietf:params:jmap:/, "jmap:"),
          subtitle: "advertised JMAP capability",
          state: "healthy" as const,
          group: "capabilities",
        })),
        summary:
          `Stalwart at ${base} reports liveness HTTP ${live.status} and readiness ` +
          `HTTP ${ready?.status ?? "no response"}${mailDomain ? `, serving ${mailDomain}` : ""}. ` +
          (mgmtUnavailable
            ? `The management API is not exposed on this deployment (HTTP 404 on /api/telemetry/metrics), ` +
              `so queue depth and delivery counts are unavailable and are not shown.`
            : `Management API probe returned HTTP ${mgmt?.status ?? "no response"}.`),
      };
    } catch (err) {
      return failureResult(this.name, "Stalwart Mail", base, err, start);
    }
  }
}

const adapter = new StalwartMailAdapter();
export { adapter as default };
