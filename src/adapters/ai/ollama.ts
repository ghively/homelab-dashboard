// Ollama adapter — installed models, resident models, VRAM footprint.
//
// API: GET /api/tags (installed), GET /api/ps (currently loaded).
//
// Rewritten to go through adapter-http. The previous version used bare
// AbortSignal.timeout and collapsed every failure into "API unreachable",
// which hid the difference that matters: on this fleet Ollama IS running on
// gh-nvidia (systemd unit active) but bound to 127.0.0.1:11434, so the
// dashboard host gets ECONNREFUSED. "Connection refused — service not
// listening" points at that; "unreachable" does not.

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const OLLAMA_URL = process.env.OLLAMA_URL || "";

interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaRunning {
  name: string;
  model?: string;
  size?: number;
  size_vram?: number;
  expires_at?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

class OllamaAdapter implements DataAdapter {
  readonly name = "ollama";
  readonly description = "Ollama — local model inference.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, OLLAMA_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!OLLAMA_URL) {
      return notConfiguredResult(this.name, "Ollama — Local Inference", "OLLAMA_URL");
    }

    const base = OLLAMA_URL.replace(/\/$/, "");
    const start = Date.now();

    let models: OllamaModel[];
    try {
      const tags = await fetchJson<{ models?: OllamaModel[] }>(`${base}/api/tags`);
      models = tags.models ?? [];
    } catch (err) {
      return failureResult(this.name, "Ollama — Local Inference", base, err, start);
    }

    // /api/ps only exists on newer builds; absence means "none resident",
    // not a failed query.
    const ps = await fetchJson<{ models?: OllamaRunning[] }>(
      `${base}/api/ps`,
      {},
      ADAPTER_FANOUT_TIMEOUT_MS,
    ).catch(() => null);
    const running = ps?.models ?? [];

    const diskBytes = models.reduce((acc, m) => acc + (m.size ?? 0), 0);
    const vramBytes = running.reduce((acc, m) => acc + (m.size_vram ?? m.size ?? 0), 0);

    const metrics: Metric[] = [
      { label: "Models", value: models.length, state: models.length ? "healthy" : "warning" },
      { label: "Loaded", value: running.length },
      { label: "Disk", value: formatBytes(diskBytes) },
      { label: "VRAM In Use", value: formatBytes(vramBytes) },
    ];

    const items: Item[] = [
      ...running.map((m) => ({
        id: `loaded:${m.name}`,
        label: m.name,
        subtitle: `resident • ${formatBytes(m.size_vram ?? m.size ?? 0)} VRAM`,
        state: "healthy" as const,
        group: "loaded",
      })),
      ...models.map((m) => ({
        id: `model:${m.digest || m.name}`,
        label: m.name,
        subtitle: [m.details?.parameter_size, m.details?.quantization_level, formatBytes(m.size ?? 0)]
          .filter(Boolean)
          .join(" • "),
        state: "healthy" as const,
        group: "installed",
      })),
    ];

    return {
      title: "Ollama — Local Inference",
      subtitle: `${models.length} models • ${running.length} loaded • ${formatBytes(vramBytes)} VRAM`,
      state: models.length > 0 ? "healthy" : "warning",
      freshness: makeFreshness(this.name, base, start),
      metrics,
      items,
      summary: `${running.length} of ${models.length} installed models resident in VRAM (${formatBytes(vramBytes)}).`,
    };
  }
}

const adapter = new OllamaAdapter();
export { adapter as default };
