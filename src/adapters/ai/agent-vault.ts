// Agent Vault adapter — the document wiki Hermes stores structured entities in.
//
// Real service: a FastAPI app (uvicorn) bound to 127.0.0.1:7778 on gh-ai,
// self-described by /openapi.json as "Agent Vault API" v0.2.0.
//
//   GET /api/health    open, liveness only  -> {"ok": true}
//   GET /api/entities  HTTPBearer           -> {"rows": [...], "total": N}
//
// The entity list is the panel: counts and the breakdown by type and review
// status are all derived from `rows`. Without AGENT_VAULT_TOKEN the entities
// call 401s and the panel renders `denied` naming the variable — the vault is
// up, we simply are not allowed to read it.

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
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const AGENT_VAULT_URL = process.env.AGENT_VAULT_URL || "";
const AGENT_VAULT_TOKEN = process.env.AGENT_VAULT_TOKEN || "";

interface VaultEntity {
  slug?: string;
  ts?: string;
  type?: string;
  subtype?: string;
  status?: string;
  confidence?: number;
  tags?: string[];
}

interface VaultEntityList {
  rows?: VaultEntity[];
  total?: number;
}

function stateForStatus(status: string | undefined): "healthy" | "warning" {
  return (status ?? "").toLowerCase() === "compiled" ? "healthy" : "warning";
}

class AgentVaultAdapter implements DataAdapter {
  readonly name = "agent-vault";
  readonly description = "Agent Vault — document wiki entity store.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, AGENT_VAULT_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!AGENT_VAULT_URL) {
      return notConfiguredResult(this.name, "Agent Vault", "AGENT_VAULT_URL");
    }

    const base = AGENT_VAULT_URL.replace(/\/$/, "");
    const start = Date.now();

    // Liveness is open; if this fails the service is genuinely unreachable and
    // no credential would have helped.
    let ok = false;
    try {
      const health = await fetchJson<{ ok?: boolean }>(`${base}/api/health`);
      ok = health.ok === true;
    } catch (err) {
      return failureResult(this.name, "Agent Vault", base, err, start);
    }

    let list: VaultEntityList | null = null;
    let listError: unknown = null;
    try {
      list = await fetchJson<VaultEntityList>(
        `${base}/api/entities`,
        AGENT_VAULT_TOKEN ? { headers: { Authorization: `Bearer ${AGENT_VAULT_TOKEN}` } } : {},
        ADAPTER_FANOUT_TIMEOUT_MS,
      );
    } catch (err) {
      listError = err;
    }

    if (!list) {
      const unauthorized =
        listError instanceof AdapterHttpError && (listError.status === 401 || listError.status === 403);
      const c = classifyError(listError);
      return {
        title: "Agent Vault",
        subtitle: unauthorized
          ? `Vault up • entity index rejected (HTTP ${(listError as AdapterHttpError).status})`
          : `Vault up • entity index unreadable: ${c.message}`,
        state: unauthorized ? "denied" : "warning",
        freshness: makeFreshness(this.name, base, start),
        metrics: [
          { label: "Service", value: ok ? "UP" : "DEGRADED", state: ok ? "healthy" : "warning" },
          { label: "Entities", value: unauthorized ? "NEEDS TOKEN" : c.kind.toUpperCase().replace(/-/g, " "), state: c.state },
        ],
        summary: unauthorized
          ? "Agent Vault answered /api/health but rejected /api/entities. Set AGENT_VAULT_TOKEN to read the entity index."
          : `Agent Vault is up; /api/entities failed: ${c.message}`,
      };
    }

    const rows = list.rows ?? [];
    const total = typeof list.total === "number" ? list.total : rows.length;
    const types = new Set(rows.map((r) => r.type).filter(Boolean));
    const needsReview = rows.filter((r) => (r.status ?? "").toLowerCase() === "needs-review");
    const tagged = rows.filter((r) => (r.tags ?? []).length > 0);

    const metrics: Metric[] = [
      { label: "Service", value: ok ? "UP" : "DEGRADED", state: ok ? "healthy" : "warning" },
      { label: "Entities", value: total, state: "healthy" },
      { label: "Types", value: types.size },
      { label: "Needs Review", value: needsReview.length, state: needsReview.length ? "warning" : "healthy" },
      { label: "Tagged", value: tagged.length },
    ];

    const items: Item[] = rows.slice(0, 60).map((r, i) => ({
      id: `entity:${r.slug ?? i}`,
      label: r.slug ?? `entity ${i}`,
      subtitle: [r.ts, r.status].filter(Boolean).join(" • "),
      value: typeof r.confidence === "number" ? r.confidence.toFixed(2) : undefined,
      state: stateForStatus(r.status),
      group: r.type ?? "entity",
    }));

    return {
      title: "Agent Vault — Entity Store",
      subtitle: `${total} entities • ${types.size} types • ${needsReview.length} need review`,
      // Panel state tracks the SERVICE, not the contents. An entity flagged
      // needs-review is a curation task, not an outage, and letting it set the
      // panel to `warning` would drag the whole AI world tile down forever for
      // something no operator can "fix" by touching the service. It stays a
      // warning-coloured metric instead.
      state: ok ? "healthy" : "warning",
      freshness: makeFreshness(this.name, base, start),
      metrics,
      items,
      summary: `Agent Vault holds ${total} entities across ${types.size} types; ${needsReview.length} flagged needs-review.`,
    };
  }
}

const adapter = new AgentVaultAdapter();
export { adapter as default };
