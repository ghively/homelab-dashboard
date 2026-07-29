// Wazuh Manager adapter — agents, alerts, rules, cluster status.
// Host: gh-vps (Tailscale: 100.92.162.32)
// API: https://wazuh.hively.dev (55000)
import type { DataAdapter, HealthCheck } from "./adapter-base";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";
import type { Event, Item, Metric, VisualQueryResult } from "./types";

const WAZUH_API_URL = process.env.WAZUH_API_URL || "https://wazuh.hively.dev";
const WAZUH_USER = process.env.WAZUH_USER || "wazuh";
const WAZUH_PASS = process.env.WAZUH_PASS || "";

interface WazuhAgent {
  id: string;
  name: string;
  ip: string;
  status: string;
  version: string;
  os: { name: string; version: string };
  last_keepalive: string;
  date_add: string;
}

interface WazuhAlert {
  id: string;
  timestamp: string;
  rule: { level: number; description: string; groups: string[] };
  agent: { name: string; id: string };
  data: Record<string, unknown>;
}

async function wazuhFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${WAZUH_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Wazuh ${response.status}: ${response.statusText}`);
  const json = await response.json() as { data?: T; error?: number; message?: string };
  if (json.error) throw new Error(`Wazuh API error: ${json.message}`);
  return json.data as T;
}

async function getWazuhToken(): Promise<string> {
  const response = await fetch(`${WAZUH_API_URL}/security/user/authenticate`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${WAZUH_USER}:${WAZUH_PASS}`)}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Wazuh auth failed: ${response.statusText}`);
  const json = await response.json() as { data?: { token: string }; error?: number };
  if (json.error || !json.data) throw new Error("Wazuh auth returned no token");
  return json.data.token;
}

class WazuhManagerAdapter implements DataAdapter {
  readonly name = "wazuh-manager";
  readonly description = "Wazuh SIEM — agents, alerts, and rule engine.";
  readonly category = "security" as const;

  async health(): Promise<HealthCheck> {
    const now = new Date().toISOString();
    try {
      const token = await getWazuhToken();
      await wazuhFetch<{ affected_items: unknown[] }>("/agents?limit=1", token);
      return { adapter: this.name, source: "wazuh-manager", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    } catch {
      return { adapter: this.name, source: "wazuh-manager", queriedAt: now, stalenessSeconds: 0, cacheHit: false };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fs = getFixtureState();
    if (fs) return getFixtureForState(this.name, fs);

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      const token = await getWazuhToken();

      const [summaryResp, agentsResp, alertsResp] = await Promise.all([
        wazuhFetch<{ affected_items: Record<string, number>[] }>("/agents/summary/status", token).catch(() => null),
        wazuhFetch<{ affected_items: WazuhAgent[] }>("/agents?limit=20&sort=-date_add", token).catch(() => null),
        wazuhFetch<{ affected_items: WazuhAlert[] }>("/alerts?limit=10&sort=-timestamp", token).catch(() => null),
      ]);

      const summary = summaryResp?.affected_items?.[0] ?? {};
      const agents = agentsResp?.affected_items ?? [];
      const alerts = alertsResp?.affected_items ?? [];

      const activeAgents = summary.active ?? agents.filter((a) => a.status === "active").length;
      const disconnected = summary.disconnected ?? 0;
      const pending = summary.pending ?? 0;
      const totalAgents = (summary.total ?? (summary.active ?? 0) + disconnected + pending) || agents.length;

      const criticalAlerts = alerts.filter((a) => a.rule.level >= 12);
      const state: VisualQueryResult["state"] =
        criticalAlerts.length > 0 ? "critical" : alerts.some((a) => a.rule.level >= 7) ? "warning" : "healthy";

      const metrics: Metric[] = [
        { label: "Total Agents", value: totalAgents, state: "healthy" },
        { label: "Active", value: activeAgents, state: "healthy" },
        { label: "Disconnected", value: disconnected, state: disconnected > 0 ? "warning" : "healthy" },
        { label: "Pending", value: pending, state: pending > 0 ? "warning" : "healthy" },
        { label: "Critical Alerts", value: criticalAlerts.length, state: criticalAlerts.length > 0 ? "critical" : "healthy" },
      ];

      const items: Item[] = agents.slice(0, 12).map((a) => ({
        id: a.id,
        label: a.name,
        subtitle: `${a.ip} · ${a.os?.name || "unknown OS"}`,
        state: a.status === "active" ? "healthy" : a.status === "disconnected" ? "offline" : "warning",
        group: a.status,
        meta: { version: a.version, lastSeen: a.last_keepalive },
      }));

      const events: Event[] = alerts.slice(0, 8).map((a) => ({
        id: a.id,
        at: a.timestamp,
        title: a.rule.description,
        detail: `Level ${a.rule.level} · ${a.agent?.name || "manager"}`,
        state: a.rule.level >= 12 ? "critical" : a.rule.level >= 7 ? "warning" : "healthy",
      }));

      return {
        title: "Wazuh Manager",
        subtitle: `${totalAgents} agents · ${alerts.length} recent alerts`,
        state,
        freshness: { adapter: this.name, source: "wazuh-manager", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics,
        items,
        events,
        summary: `${activeAgents}/${totalAgents} agents active, ${criticalAlerts.length} critical alerts`,
      };
    } catch (error) {
      return {
        title: "Wazuh Manager",
        subtitle: error instanceof Error ? error.message : "Connection failed",
        state: "offline",
        freshness: { adapter: this.name, source: "wazuh-manager", queriedAt: now, stalenessSeconds: Math.floor((Date.now() - start) / 1000), cacheHit: false },
        metrics: [{ label: "Status", value: "OFFLINE", state: "offline" }],
        summary: "Wazuh Manager API unreachable or auth failed",
      };
    }
  }
}

const adapter = new WazuhManagerAdapter();
export { adapter as default };
