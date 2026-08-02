// Hermes MCP bridge — the `hermes-mcp serve` HTTP endpoint.
//
// Replaces the /health probe in src/adapters/hermes/hermes-mcp-bridge.ts,
// which reported HTTP 404 as a warning because this service has no /health
// route at all. What it actually exposes (verified against the running
// process on gh-ai, uvicorn bound to 127.0.0.1:8766):
//
//   GET  /.well-known/oauth-protected-resource/mcp   open. Real payload:
//        {"resource": "...", "authorization_servers": [...],
//         "bearer_methods_supported": ["header"]}
//   POST /mcp                                        OAuth bearer required.
//        Without one: 401 {"error":"invalid_token"} plus a WWW-Authenticate
//        header pointing at the resource metadata above.
//   Everything else 404s.
//
// So liveness and the OAuth topology are measurable anonymously, and the MCP
// surface itself is not. With no token the panel is `denied` and names
// HERMES_MCP_BRIDGE_TOKEN. Note the authenticated branch is written
// defensively: only the 401 path could be verified here, so it reports the
// handshake result and whatever serverInfo the response carries, and claims
// nothing else.

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import {
  AdapterHttpError,
  ADAPTER_FANOUT_TIMEOUT_MS,
  classifyError,
  failureResult,
  fetchJson,
  fetchWithTimeout,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const BASE_URL = process.env.HERMES_MCP_BRIDGE_URL || "";
const TOKEN = process.env.HERMES_MCP_BRIDGE_TOKEN || "";

interface ResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  bearer_methods_supported?: string[];
  scopes_supported?: string[];
}

interface McpInitResult {
  result?: {
    protocolVersion?: string;
    serverInfo?: { name?: string; version?: string };
    capabilities?: Record<string, unknown>;
  };
}

/**
 * Streamable-HTTP MCP replies with either JSON or an SSE stream depending on
 * what the server prefers, so the body is read as text and the first `data:`
 * line is unwrapped when present.
 */
function parseMcpBody(text: string): McpInitResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith("{")
    ? trimmed
    : (trimmed.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim() ?? "");
  if (!payload) return null;
  try {
    return JSON.parse(payload) as McpInitResult;
  } catch {
    return null;
  }
}

class HermesMcpBridgeLiveAdapter implements DataAdapter {
  readonly name = "hermes-mcp-bridge";
  readonly description = "Hermes MCP bridge — endpoint liveness and OAuth posture.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, BASE_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!BASE_URL) {
      return notConfiguredResult(this.name, "Hermes MCP bridge", "HERMES_MCP_BRIDGE_URL");
    }

    const base = BASE_URL.replace(/\/$/, "");
    const start = Date.now();

    let meta: ResourceMetadata;
    try {
      meta = await fetchJson<ResourceMetadata>(`${base}/.well-known/oauth-protected-resource/mcp`);
    } catch (err) {
      return failureResult(this.name, "Hermes MCP bridge", base, err, start);
    }

    // The MCP handshake itself. Issued with or without a token — the 401 is
    // the evidence that the endpoint is alive and gated, which is the whole
    // point of the panel when no credential is configured.
    let mcpStatus: number | null = null;
    let init: McpInitResult | null = null;
    let mcpError: unknown = null;
    try {
      const res = await fetchWithTimeout(
        `${base}/mcp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "homelab-dashboard", version: "1" },
            },
          }),
        },
        ADAPTER_FANOUT_TIMEOUT_MS,
      );
      mcpStatus = res.status;
      if (res.ok) init = parseMcpBody(await res.text());
      else mcpError = new AdapterHttpError(`${base}/mcp`, res.status, res.statusText);
    } catch (err) {
      mcpError = err;
    }

    const denied = mcpStatus === 401 || mcpStatus === 403;
    const server = init?.result?.serverInfo;
    const capabilities = Object.keys(init?.result?.capabilities ?? {});

    const metrics: Metric[] = [
      { label: "Endpoint", value: "UP", state: "healthy" },
      {
        label: "MCP Handshake",
        value: mcpStatus === null ? "NO RESPONSE" : `HTTP ${mcpStatus}`,
        state: init ? "healthy" : denied ? "denied" : "warning",
      },
      { label: "Auth", value: (meta.bearer_methods_supported ?? []).join(", ") || "bearer" },
    ];
    if (server?.name) metrics.push({ label: "Server", value: server.name });
    if (server?.version) metrics.push({ label: "Version", value: server.version });
    if (init?.result?.protocolVersion) {
      metrics.push({ label: "Protocol", value: init.result.protocolVersion });
    }
    if (capabilities.length) metrics.push({ label: "Capabilities", value: capabilities.length });

    const items: Item[] = [
      ...(meta.resource
        ? [{ id: "resource", label: "Protected resource", subtitle: meta.resource, state: "healthy" as const }]
        : []),
      ...(meta.authorization_servers ?? []).map((s, i) => ({
        id: `authsrv:${i}`,
        label: "Authorization server",
        subtitle: s,
        state: "healthy" as const,
      })),
      ...capabilities.map((c) => ({
        id: `cap:${c}`,
        label: c,
        subtitle: "capability",
        state: "healthy" as const,
        group: "capabilities",
      })),
    ];

    if (init) {
      return {
        title: "Hermes MCP bridge",
        subtitle: `${server?.name ?? "MCP"} ${server?.version ?? ""} • handshake OK`.trim(),
        state: "healthy",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `MCP bridge authenticated; ${capabilities.length} capability group(s) advertised.`,
      };
    }

    if (denied) {
      return {
        title: "Hermes MCP bridge",
        subtitle: `Endpoint up • MCP handshake rejected (HTTP ${mcpStatus})`,
        state: "denied",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary:
          "The bridge is listening and publishes OAuth resource metadata, but POST /mcp requires a bearer token. Set HERMES_MCP_BRIDGE_TOKEN to read the MCP surface.",
      };
    }

    const c = classifyError(mcpError);
    return {
      title: "Hermes MCP bridge",
      subtitle: `Endpoint up • MCP handshake failed: ${c.message}`,
      state: "warning",
      freshness: makeFreshness(this.name, base, start),
      metrics,
      items,
      summary: `OAuth metadata served, but the initialize handshake failed: ${c.message}`,
    };
  }
}

const adapter = new HermesMcpBridgeLiveAdapter();
export { adapter as default };
