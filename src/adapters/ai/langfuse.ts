// Langfuse adapter — LLM observability service health.
//
// /api/public/health answers anonymously with {"status":"OK","version":"..."}
// and is the only endpoint that does; traces and projects require a
// project-scoped key pair. The panel therefore reports availability and
// version, and says so, rather than showing trace counts it cannot read.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { failureResult, fetchJson, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const LANGFUSE_URL = process.env.LANGFUSE_URL || "";

class LangfuseAdapter implements DataAdapter {
  readonly name = "langfuse";
  readonly description = "Langfuse — LLM observability service health.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, LANGFUSE_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!LANGFUSE_URL) {
      return notConfiguredResult(this.name, "Langfuse", "LANGFUSE_URL");
    }

    const base = LANGFUSE_URL.replace(/\/$/, "");
    const url = `${base}/api/public/health`;
    const start = Date.now();
    try {
      const health = await fetchJson<{ status?: string; version?: string }>(url);
      const ok = (health.status ?? "").toUpperCase() === "OK";

      const metrics: Metric[] = [
        { label: "Status", value: health.status ?? "unknown", state: ok ? "healthy" : "critical" },
        { label: "Version", value: health.version ?? "unknown" },
      ];

      return {
        title: "Langfuse — LLM Observability",
        subtitle: `v${health.version ?? "?"} • ${health.status ?? "?"}`,
        state: ok ? "healthy" : "critical",
        freshness: makeFreshness(this.name, url, start),
        metrics,
        summary: `Langfuse ${health.version ?? "?"} reports ${health.status ?? "unknown"}. Trace and project counts need a project key pair and are not read here.`,
      };
    } catch (err) {
      return failureResult(this.name, "Langfuse", url, err, start);
    }
  }
}

const adapter = new LangfuseAdapter();
export { adapter as default };
