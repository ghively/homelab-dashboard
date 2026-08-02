/**
 * Live-adapter registration for the `ai` world.
 *
 * One module per world so that wiring several worlds in parallel never
 * contends on a single file. Called from initAdapters() in adapter-runtime.
 *
 * The rule from adapter-runtime applies unchanged here: register an adapter
 * ONLY when its query() derives every displayed value from a real fetch, and
 * only when its env var is set. An unconfigured service must fall through to a
 * labelled fixture rather than probing a hardcoded default host and rendering
 * a misleading `offline`.
 *
 * Ground truth for this world, established by probing gh-ai, gh-arm and
 * gh-nvidia on 2026-08-02:
 *
 *   REGISTERED — a real service answers and the adapter reads it
 *     omniroute          gh-arm :20128 (management) + :20129 (OpenAI API).
 *                        Up; every route needs the OmniRoute Manage Key.
 *     ollama             gh-nvidia, systemd unit active but bound to
 *                        127.0.0.1:11434 — refused from here. Renders offline.
 *     openwebui-api      gh-ai :3001, /api/config + /health/db are anonymous.
 *     openwebui-vector   same container; all retrieval routes need a token.
 *     agent-vault        gh-ai 127.0.0.1:7778, FastAPI "Agent Vault API" 0.2.0.
 *     hermes-api-server  gh-ai :8642, hermes-agent 0.19.1.
 *     hermes-mcp-bridge  gh-ai 127.0.0.1:8766, `hermes-mcp serve`, OAuth-gated.
 *
 *   NOT REGISTERED — no service exists behind the name, so a live adapter
 *   would be a fabrication. These keep serving a labelled fixture and should
 *   come out of the world inventory:
 *     honcho    decommissioned 2026-07-30 (containers stopped, hermes
 *               config.yaml has `honcho: api_url: ''`, nothing on :8000).
 *     cognee    never deployed here. The only occurrences anywhere on this
 *               host are inside a third-party README in the Hermes wiki.
 *     opencode  no server and no binary. `opencode` exists only as a Hermes
 *               *stdio* MCP wrapper (mcp-servers/gh-tools/opencode) that would
 *               drive `opencode serve` on 127.0.0.1:4096 — which is not
 *               running, and the `opencode` binary is not installed.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import omniroute from "@/adapters/ai/omniroute";
import ollama from "@/adapters/ai/ollama";
import openwebuiApi from "@/adapters/ai/openwebui-api";
import openwebuiVector from "@/adapters/ai/openwebui-vector";
import agentVault from "@/adapters/ai/agent-vault";
import hermesApiServer from "@/adapters/ai/hermes-api-server";
import hermesMcpBridge from "@/adapters/ai/hermes-mcp-bridge";

/**
 * name -> [env var that must be set, adapter].
 *
 * The gate is the *endpoint* variable, never the credential: a reachable
 * service we cannot authenticate against must render `denied` naming the
 * missing key, which is actionable. Gating on the key instead would hide a
 * running service behind a healthy-looking fixture — the exact failure this
 * whole registration split exists to prevent.
 */
const AI_ADAPTERS: Array<[name: string, envVar: string, adapter: DataAdapter]> = [
  ["omniroute", "OMNIROUTE_URL", omniroute],
  ["ollama", "OLLAMA_URL", ollama],
  ["openwebui-api", "OPENWEBUI_URL", openwebuiApi],
  ["openwebui-vector", "OPENWEBUI_URL", openwebuiVector],
  ["agent-vault", "AGENT_VAULT_URL", agentVault],
  ["hermes-api-server", "HERMES_API_SERVER_URL", hermesApiServer],
  ["hermes-mcp-bridge", "HERMES_MCP_BRIDGE_URL", hermesMcpBridge],
];

export function register(registry: Map<string, DataAdapter>): void {
  for (const [name, envVar, adapter] of AI_ADAPTERS) {
    if (process.env[envVar]) registry.set(name, adapter);
  }
}
