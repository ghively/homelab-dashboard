/**
 * Shared HTTP plumbing for adapters: one timeout knob, one AbortController
 * wiring, and one honest classification of why a call failed.
 *
 * Why this exists
 * ---------------
 * Adapters used to call bare `fetch()` with no signal. Node's fetch has no
 * default timeout, so a request to a host that accepts the SYN but never
 * answers — or a tailnet peer that is idle — hangs until the kernel gives up
 * (~130s on Linux). `/api/fleet` awaits every adapter in a world, so a single
 * hung adapter pinned the whole endpoint, and the world tile sat on LOADING
 * for minutes. Every adapter fetch must carry a signal, and the budget must be
 * small enough that a dead service costs a few seconds, not a page load.
 *
 * The other half is honesty. "Unreachable", "credentials rejected" and "the
 * service answered but is unhealthy" are three different facts, and collapsing
 * them into one `offline` badge hides the only thing that tells you what to do
 * next. classifyError() maps a failure onto the VisualStateValue that matches
 * what actually happened.
 */

import type { FreshnessInfo, Metric, VisualQueryResult, VisualStateValue } from "@/adapters/types";

/**
 * Per-request budget for a live adapter call.
 *
 * Deliberately small. An adapter is one panel on a dashboard; a service that
 * cannot answer in this window is not going to produce a useful panel, and
 * waiting longer only delays the honest "offline" the user needs to see.
 * Override with ADAPTER_TIMEOUT_MS when a genuinely slow service (Synology DSM
 * login is ~5s) needs more room.
 */
export const ADAPTER_TIMEOUT_MS = (() => {
  const raw = Number(process.env.ADAPTER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
})();

/** Shorter budget for fan-out calls made in a loop (per-host, per-model). */
export const ADAPTER_FANOUT_TIMEOUT_MS = Math.max(1500, Math.round(ADAPTER_TIMEOUT_MS / 2));

export type FailureKind =
  | "timeout"
  | "unreachable"
  | "unauthorized"
  | "http-error"
  | "bad-payload"
  | "not-configured";

export interface Classified {
  kind: FailureKind;
  /** The visual state this failure should render as. */
  state: VisualStateValue;
  /** Short human-readable cause, safe to show in a subtitle. */
  message: string;
}

/**
 * An HTTP call that completed but returned a status the adapter cannot use.
 * Carried separately from transport errors so 401 does not read as "offline".
 */
export class AdapterHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number, statusText?: string) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ""} from ${url}`);
    this.name = "AdapterHttpError";
    this.status = status;
    this.url = url;
  }
}

/**
 * fetch() with a hard deadline.
 *
 * AbortSignal.timeout() alone is enough for the abort itself, but combining it
 * with any caller-supplied signal is not expressible without AbortSignal.any(),
 * which is why the controller is explicit here.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = ADAPTER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** fetch + status check + JSON parse, with the timeout already wired. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = ADAPTER_TIMEOUT_MS,
): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
  return (await res.json()) as T;
}

/** fetch + status check, returning the raw body (Prometheus exposition format). */
export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = ADAPTER_TIMEOUT_MS,
): Promise<string> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
  return await res.text();
}

function causeChain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur instanceof Error; i++) {
    parts.push(cur.message);
    const code = (cur as NodeJS.ErrnoException).code;
    if (code) parts.push(code);
    cur = cur.cause;
  }
  return parts.join(" ");
}

/**
 * Turn a thrown value into the state + wording the panel should show.
 *
 * The distinction that matters most: `denied` (the service is up, it rejected
 * us) versus `offline` (nothing answered). One is a credential to fix, the
 * other is a host to bring back.
 */
export function classifyError(err: unknown): Classified {
  if (err instanceof AdapterHttpError) {
    if (err.status === 401 || err.status === 403) {
      return { kind: "unauthorized", state: "denied", message: `Credentials rejected (HTTP ${err.status})` };
    }
    if (err.status === 404) {
      return { kind: "http-error", state: "warning", message: `Endpoint not found (HTTP 404)` };
    }
    if (err.status >= 500) {
      return { kind: "http-error", state: "critical", message: `Service error (HTTP ${err.status})` };
    }
    return { kind: "http-error", state: "warning", message: `Unexpected HTTP ${err.status}` };
  }

  const text = causeChain(err) || String(err);

  if (/timeout|aborted|AbortError|TimeoutError/i.test(text)) {
    return { kind: "timeout", state: "offline", message: `No response within ${ADAPTER_TIMEOUT_MS}ms` };
  }
  if (/ECONNREFUSED/i.test(text)) {
    return { kind: "unreachable", state: "offline", message: "Connection refused — service not listening" };
  }
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN/i.test(text)) {
    return { kind: "unreachable", state: "offline", message: "Host unreachable" };
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) {
    return { kind: "unreachable", state: "offline", message: "Hostname does not resolve" };
  }
  if (/ECONNRESET|EPIPE|socket hang up/i.test(text)) {
    return { kind: "unreachable", state: "offline", message: "Connection reset by peer" };
  }
  if (/certificate|SSL|TLS|self.signed/i.test(text)) {
    return { kind: "unreachable", state: "offline", message: "TLS handshake failed" };
  }
  if (/JSON|Unexpected token|is not valid/i.test(text)) {
    return { kind: "bad-payload", state: "warning", message: "Response was not valid JSON" };
  }
  return { kind: "unreachable", state: "offline", message: text.slice(0, 160) };
}

export function makeFreshness(adapter: string, source: string, startedAt?: number): FreshnessInfo {
  return {
    adapter,
    source,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    cacheHit: false,
  };
}

/**
 * The panel a failed live call should render.
 *
 * Never a healthy-looking fixture: a configured service that cannot be reached
 * has to look wrong, and it has to say why in words a person can act on.
 */
export function failureResult(
  adapter: string,
  title: string,
  source: string,
  err: unknown,
  startedAt?: number,
): VisualQueryResult {
  const c = classifyError(err);
  const metrics: Metric[] = [
    { label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state },
    { label: "Endpoint", value: source },
  ];
  return {
    title,
    subtitle: c.message,
    state: c.state,
    freshness: makeFreshness(adapter, source, startedAt),
    metrics,
    summary: `${adapter}: ${c.message} (${source})`,
  };
}

/**
 * The panel an adapter should render when its env vars are absent.
 *
 * `empty`, not `offline` — nothing is broken, the dashboard was simply never
 * told where the service lives.
 */
export function notConfiguredResult(
  adapter: string,
  title: string,
  envVar: string,
): VisualQueryResult {
  return {
    title,
    subtitle: "Not configured",
    state: "empty",
    freshness: makeFreshness(adapter, "unconfigured"),
    metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
    summary: `Set ${envVar} to connect this service.`,
  };
}
