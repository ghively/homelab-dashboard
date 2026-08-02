// Open WebUI — RAG / vector store view.
//
// The second view of the same Open WebUI container as openwebui-api. This one
// answers "what is the retrieval stack configured to do, and how much is in
// it": embedding engine and model, vector database, chunking, and the
// knowledge-base collections.
//
// Reality check (Open WebUI 0.9.5, verified live): every retrieval route is
// behind auth — /api/v1/retrieval/config and /api/v1/knowledge/ both answer
// 401 {"detail":"Not authenticated"}. Only /health/db is open. So this panel
// proves the service is up from the open endpoint and then renders `denied`
// naming OPENWEBUI_TOKEN. It does not invent an embedding model or a document
// count; a number here would be pure fiction.

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

const OPENWEBUI_URL = process.env.OPENWEBUI_URL || "";
const OPENWEBUI_TOKEN = process.env.OPENWEBUI_TOKEN || "";

/**
 * Open WebUI's retrieval config payload. Every field is optional on purpose:
 * the shape has moved between releases and this adapter has only been verified
 * against the 401, so it emits a metric only for the fields that are actually
 * present in the response rather than defaulting anything.
 */
interface RetrievalConfig {
  status?: boolean;
  embedding_engine?: string;
  embedding_model?: string;
  reranking_model?: string;
  chunk?: { chunk_size?: number; chunk_overlap?: number };
  content_extraction?: { engine?: string };
  web?: { search?: { enabled?: boolean; engine?: string } };
  RAG_EMBEDDING_ENGINE?: string;
  RAG_EMBEDDING_MODEL?: string;
  VECTOR_DB?: string;
  [k: string]: unknown;
}

interface KnowledgeItem {
  id?: string;
  name?: string;
  description?: string;
  files?: unknown[];
}

function pick(cfg: RetrievalConfig, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = cfg[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

class OpenWebUiVectorAdapter implements DataAdapter {
  readonly name = "openwebui-vector";
  readonly description = "Open WebUI — retrieval config and knowledge collections.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, OPENWEBUI_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!OPENWEBUI_URL) {
      return notConfiguredResult(this.name, "Open WebUI — Vector", "OPENWEBUI_URL");
    }

    const base = OPENWEBUI_URL.replace(/\/$/, "");
    const start = Date.now();

    // The one open endpoint. If the datastore behind Open WebUI is down there
    // is no retrieval to report on, so this gates the rest.
    let dbOk = false;
    try {
      const db = await fetchJson<{ status?: boolean }>(`${base}/health/db`);
      dbOk = db.status === true;
    } catch (err) {
      return failureResult(this.name, "Open WebUI — Vector", base, err, start);
    }

    const headers: Record<string, string> = OPENWEBUI_TOKEN
      ? { Authorization: `Bearer ${OPENWEBUI_TOKEN}` }
      : {};

    // Issued unconditionally, token or not: the 401 IS the measurement. It is
    // what proves the endpoint exists and that the only thing missing is a
    // credential, which is a more useful panel than "not configured".
    const [cfgRes, knowledgeRes] = await Promise.all([
      fetchJson<RetrievalConfig>(`${base}/api/v1/retrieval/config`, { headers }, ADAPTER_FANOUT_TIMEOUT_MS).catch(
        (e: unknown) => e,
      ),
      fetchJson<KnowledgeItem[]>(`${base}/api/v1/knowledge/`, { headers }, ADAPTER_FANOUT_TIMEOUT_MS).catch(
        (e: unknown) => e,
      ),
    ]);

    const cfg = cfgRes instanceof Error ? null : (cfgRes as RetrievalConfig);
    const knowledge = Array.isArray(knowledgeRes) ? (knowledgeRes as KnowledgeItem[]) : null;

    if (!cfg) {
      const err = cfgRes as unknown;
      const unauthorized = err instanceof AdapterHttpError && (err.status === 401 || err.status === 403);
      const c = classifyError(err);
      return {
        title: "Open WebUI — Vector",
        subtitle: unauthorized
          ? `Service up • retrieval config requires auth (HTTP ${(err as AdapterHttpError).status})`
          : `Service up • retrieval config unreadable: ${c.message}`,
        state: unauthorized ? "denied" : "warning",
        freshness: makeFreshness(this.name, base, start),
        metrics: [
          { label: "Database", value: dbOk ? "OK" : "NOT OK", state: dbOk ? "healthy" : "critical" },
          {
            label: "Retrieval Config",
            value: unauthorized ? "NEEDS TOKEN" : c.kind.toUpperCase().replace(/-/g, " "),
            state: c.state,
          },
          { label: "Embedding Model", value: "UNREADABLE", state: "denied" },
          { label: "Collections", value: "UNREADABLE", state: "denied" },
        ],
        summary: unauthorized
          ? "Open WebUI is up but every retrieval route (/api/v1/retrieval/config, /api/v1/knowledge/) requires a bearer token. Set OPENWEBUI_TOKEN to read the embedding model, vector DB and knowledge collections."
          : `Open WebUI is up; /api/v1/retrieval/config failed: ${c.message}`,
      };
    }

    const engine = pick(cfg, "embedding_engine", "RAG_EMBEDDING_ENGINE");
    const model = pick(cfg, "embedding_model", "RAG_EMBEDDING_MODEL");
    const vectorDb = pick(cfg, "VECTOR_DB", "vector_db");
    const reranker = pick(cfg, "reranking_model", "RAG_RERANKING_MODEL");
    const chunkSize = cfg.chunk?.chunk_size;
    const chunkOverlap = cfg.chunk?.chunk_overlap;

    const metrics: Metric[] = [
      { label: "Database", value: dbOk ? "OK" : "NOT OK", state: dbOk ? "healthy" : "critical" },
    ];
    if (engine) metrics.push({ label: "Embedding Engine", value: engine });
    if (model) metrics.push({ label: "Embedding Model", value: model });
    if (vectorDb) metrics.push({ label: "Vector DB", value: vectorDb });
    if (reranker) metrics.push({ label: "Reranker", value: reranker });
    if (typeof chunkSize === "number") metrics.push({ label: "Chunk Size", value: chunkSize });
    if (typeof chunkOverlap === "number") metrics.push({ label: "Chunk Overlap", value: chunkOverlap });
    metrics.push({
      label: "Collections",
      value: knowledge ? knowledge.length : "UNREADABLE",
      state: knowledge ? "healthy" : "denied",
    });

    const items: Item[] = (knowledge ?? []).slice(0, 40).map((k, i) => ({
      id: `kb:${k.id ?? i}`,
      label: k.name ?? `collection ${i}`,
      subtitle: k.description ?? "",
      value: Array.isArray(k.files) ? `${k.files.length} files` : undefined,
      state: "healthy" as const,
      group: "collections",
    }));

    return {
      title: "Open WebUI — Vector",
      subtitle: [model ?? "embedding model unreported", vectorDb, knowledge ? `${knowledge.length} collections` : null]
        .filter(Boolean)
        .join(" • "),
      state: dbOk ? "healthy" : "critical",
      freshness: makeFreshness(this.name, base, start),
      metrics,
      items,
      summary: `Open WebUI retrieval: ${engine ?? "engine unreported"}${model ? ` / ${model}` : ""}${
        knowledge ? `, ${knowledge.length} knowledge collections` : ""
      }.`,
    };
  }
}

const adapter = new OpenWebUiVectorAdapter();
export { adapter as default };
