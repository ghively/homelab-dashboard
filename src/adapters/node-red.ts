// Node-RED adapter — deployed flows, runtime state, host footprint.
//
// Everything here comes from the Node-RED admin API on the configured server:
//   GET /settings     → version, editor configuration
//   GET /flows        → the deployed flow config (tabs, subflows, nodes)
//   GET /diagnostics  → runtime start state, Node.js version, host memory
//
// This instance answers all three anonymously. When adminAuth is switched on
// they return 401 and classifyError() renders `denied`, which names the
// problem — so no token is required for the adapter to be honest either way.
//
// The old version counted every object in /flows as a "node", including the
// tab and subflow records, and reported that alongside a separate tab count.
// Tabs are now excluded from the node count so the two numbers do not overlap.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, fetchJson, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const URL_ENV = "NODE_RED_URL";
const TOKEN_ENV = "NODE_RED_TOKEN";

interface NodeRedNode {
  id?: string;
  type?: string;
  label?: string;
  name?: string;
  z?: string;
  disabled?: boolean;
  d?: boolean;
}

interface NodeRedSettings {
  version?: string;
  httpNodeRoot?: string;
  context?: { default?: string; stores?: string[] };
  flowEncryptionType?: string;
}

interface NodeRedDiagnostics {
  nodejs?: { version?: string; memoryUsage?: { rss?: number } };
  os?: { totalmem?: number; freemem?: number; loadavg?: number[]; containerised?: boolean };
  runtime?: { version?: string; isStarted?: boolean; flows?: { state?: string; started?: boolean } };
}

/**
 * /flows answers with a bare array (v1) or {flows, rev} (v2) depending on the
 * Node-RED-API-Version request header and the server version. Accept both.
 */
function normaliseFlows(body: unknown): NodeRedNode[] {
  if (Array.isArray(body)) return body as NodeRedNode[];
  const wrapped = (body as { flows?: unknown } | null)?.flows;
  return Array.isArray(wrapped) ? (wrapped as NodeRedNode[]) : [];
}

function mib(bytes: number | undefined): string {
  return Number.isFinite(bytes) ? `${Math.round((bytes as number) / 1024 / 1024)} MiB` : "unknown";
}

export class NodeRedAdapter implements DataAdapter {
  readonly name = "node-red";
  readonly description = "Node-RED — deployed flows and runtime state.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[URL_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const configured = process.env[URL_ENV];
    if (!configured) return notConfiguredResult(this.name, "Node-RED", URL_ENV);

    const base = configured.replace(/\/$/, "");
    const token = process.env[TOKEN_ENV];
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const start = Date.now();
    try {
      // /flows carries the panel; the other two are enrichment on a shorter
      // budget so a slow diagnostics call cannot take the panel down.
      const flowBody = await fetchJson<unknown>(`${base}/flows`, { headers });
      const flows = normaliseFlows(flowBody);

      const [settings, diagnostics] = await Promise.all([
        fetchJson<NodeRedSettings>(`${base}/settings`, { headers }, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => null),
        fetchJson<NodeRedDiagnostics>(`${base}/diagnostics`, { headers }, ADAPTER_FANOUT_TIMEOUT_MS).catch(
          () => null,
        ),
      ]);

      const tabs = flows.filter((f) => f.type === "tab");
      const subflows = flows.filter((f) => f.type === "subflow");
      // Everything that is not a container record is an actual wired node.
      const nodes = flows.filter((f) => f.type !== "tab" && f.type !== "subflow");
      const disabledTabs = tabs.filter((t) => t.disabled === true);
      const disabledNodes = nodes.filter((n) => n.d === true);

      const runtimeStarted = diagnostics?.runtime?.isStarted;
      const flowState = diagnostics?.runtime?.flows?.state;

      const metrics: Metric[] = [
        { label: "Version", value: settings?.version ?? diagnostics?.runtime?.version ?? "unknown" },
        { label: "Flow Tabs", value: tabs.length },
        { label: "Subflows", value: subflows.length },
        { label: "Nodes", value: nodes.length },
        {
          label: "Disabled",
          value: disabledTabs.length + disabledNodes.length,
          state: disabledTabs.length + disabledNodes.length > 0 ? "warning" : "healthy",
        },
        ...(flowState
          ? [
              {
                label: "Runtime",
                value: flowState,
                state: (flowState === "start" ? "healthy" : "warning") as "healthy" | "warning",
              },
            ]
          : []),
        ...(diagnostics?.nodejs?.version ? [{ label: "Node.js", value: diagnostics.nodejs.version }] : []),
        ...(diagnostics?.nodejs?.memoryUsage?.rss
          ? [{ label: "RSS", value: mib(diagnostics.nodejs.memoryUsage.rss) }]
          : []),
      ];

      const items: Item[] = tabs.slice(0, 40).map((t) => ({
        id: `tab:${t.id ?? t.label ?? "tab"}`,
        label: t.label || t.id || "unnamed flow",
        subtitle: `${nodes.filter((n) => n.z === t.id).length} nodes`,
        value: t.disabled ? "disabled" : "enabled",
        state: (t.disabled ? "empty" : "healthy") as "empty" | "healthy",
        group: "flows",
      }));

      // Zero deployed flows is an honest `empty`, not a failure: the runtime is
      // up and answering, there is simply nothing deployed on it yet.
      const state: VisualQueryResult["state"] =
        runtimeStarted === false ? "critical" : flows.length === 0 ? "empty" : "healthy";

      return {
        title: "Node-RED — Flow Automation",
        subtitle:
          flows.length === 0
            ? `${base} • runtime up, no flows deployed`
            : `${tabs.length} flows • ${nodes.length} nodes • v${settings?.version ?? "?"}`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary:
          flows.length === 0
            ? `Node-RED ${settings?.version ?? ""} at ${base} is running with an empty flow config ` +
              `(0 tabs, 0 nodes).`
            : `Node-RED ${settings?.version ?? ""} at ${base}: ${tabs.length} flow tabs, ` +
              `${subflows.length} subflows, ${nodes.length} nodes, ` +
              `${disabledTabs.length + disabledNodes.length} disabled.`,
      };
    } catch (err) {
      return failureResult(this.name, "Node-RED", base, err, start);
    }
  }
}

const adapter = new NodeRedAdapter();
export { adapter as default };
