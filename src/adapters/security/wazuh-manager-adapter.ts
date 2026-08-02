// Wazuh Manager adapter — agent status from the manager REST API.
// Host: gh-arm (Tailscale 100.65.126.126)
// API: REST over HTTPS (default 55000)
//
// Two corrections over the previous version:
//
//  1. It sent no credentials at all. Every Wazuh API route except
//     /security/user/authenticate requires a bearer JWT, and that JWT is
//     minted by calling the authenticate route with HTTP Basic. The old code
//     went straight to /agents/summary/status, got 401 every time, and fell
//     into its catch block.
//  2. That catch block rendered "API unreachable — showing cached data". The
//     manager was reachable (it answered 401), and there was no cached data —
//     the panel showed zeros under a caption claiming they were cached. A
//     rejected credential and an unreachable host are different problems and
//     now render as different states (`denied` vs `offline`).

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import {
  ADAPTER_TIMEOUT_MS,
  AdapterHttpError,
  failureResult,
  makeFreshness,
} from "@/lib/adapter-http";
import { insecureTls, envFlag } from "../tls";

const WAZUH_MANAGER_URL =
  process.env.WAZUH_MANAGER_URL || "https://100.65.126.126:55000";

// The manager presents the same internal-CA cert as the indexer/dashboard, so
// it honours the same opt-in flag.
const WAZUH_TLS = envFlag("WAZUH_INSECURE_TLS");

// The manager API user is not the dashboard/indexer user. Wazuh ships them
// separately (`wazuh-wui` for the dashboard, `wazuh` for the API), so these
// have their own env vars and only fall back to the shared pair.
const WAZUH_API_USER = process.env.WAZUH_API_USER || process.env.WAZUH_USER || "";
const WAZUH_API_PASSWORD = process.env.WAZUH_API_PASSWORD || process.env.WAZUH_PASSWORD || "";

interface AgentSummary {
  data?: {
    affected_items?: Array<Record<string, number>>;
    connection?: {
      active?: number;
      disconnected?: number;
      never_connected?: number;
      pending?: number;
      total?: number;
    };
    active?: number;
    total?: number;
    disconnected?: number;
    never_connected?: number;
    pending?: number;
  };
}

async function authenticate(): Promise<string> {
  const url = `${WAZUH_MANAGER_URL}/security/user/authenticate`;
  const basic = Buffer.from(`${WAZUH_API_USER}:${WAZUH_API_PASSWORD}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
    cache: "no-store",
    ...insecureTls(WAZUH_TLS),
  });
  if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);
  const body = (await res.json()) as { data?: { token?: string } };
  const token = body.data?.token;
  if (!token) throw new Error("authenticate succeeded but returned no token");
  return token;
}

class WazuhManagerAdapter implements DataAdapter {
  readonly name = "wazuh-manager";
  readonly description =
    "Wazuh Manager — intrusion detection agent enrolment and connection state.";
  readonly category = "security" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, WAZUH_MANAGER_URL);
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const start = Date.now();

    if (!WAZUH_API_USER || !WAZUH_API_PASSWORD) {
      return {
        title: "Wazuh Manager — Agent Status",
        subtitle: "No manager API credentials configured",
        state: "denied",
        freshness: makeFreshness(this.name, WAZUH_MANAGER_URL, start),
        metrics: [
          { label: "Status", value: "NO CREDENTIALS", state: "denied" },
          { label: "Endpoint", value: WAZUH_MANAGER_URL },
        ],
        summary:
          "Set WAZUH_API_USER / WAZUH_API_PASSWORD (the manager API user, not the dashboard user) to read agent status.",
      };
    }

    try {
      const token = await authenticate();
      const url = `${WAZUH_MANAGER_URL}/agents/summary/status`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        cache: "no-store",
        ...insecureTls(WAZUH_TLS),
      });
      if (!res.ok) throw new AdapterHttpError(url, res.status, res.statusText);

      const raw = (await res.json()) as AgentSummary;
      // Wazuh 4.4 nests the counts under data.connection; older builds put them
      // directly on data. Read both rather than assuming a version.
      const c = raw.data?.connection ?? raw.data ?? {};
      const active = c.active ?? 0;
      const total = c.total ?? 0;
      const disconnected = c.disconnected ?? 0;
      const neverConnected = c.never_connected ?? 0;
      const pending = c.pending ?? 0;

      // Only values the API actually returned. The previous version padded this
      // out with invented alert counts and three fabricated security events
      // (a named brute-force source IP, an /etc/passwd modification). Inventing
      // security findings is worse than showing none — do not reintroduce them.
      // Alerts live in the Indexer, not this endpoint; see wazuh-indexer.
      return {
        title: "Wazuh Manager — Agent Status",
        subtitle: `${active} of ${total} agents active`,
        state: disconnected > 0 ? "warning" : "healthy",
        freshness: makeFreshness(this.name, WAZUH_MANAGER_URL, start),
        metrics: [
          { label: "Active Agents", value: active, state: "healthy" },
          { label: "Total Agents", value: total, state: "healthy" },
          {
            label: "Disconnected",
            value: disconnected,
            state: disconnected > 0 ? "warning" : "healthy",
          },
          { label: "Never Connected", value: neverConnected, state: "healthy" },
          { label: "Pending", value: pending, state: "healthy" },
        ],
        summary: `${active} of ${total} agents active, ${disconnected} disconnected.`,
      };
    } catch (err) {
      return failureResult(this.name, "Wazuh Manager — Agent Status", WAZUH_MANAGER_URL, err, start);
    }
  }
}

const adapter = new WazuhManagerAdapter();
export { adapter as default };
