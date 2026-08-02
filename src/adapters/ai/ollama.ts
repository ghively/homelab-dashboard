// Ollama adapter — models, loaded models, VRAM footprint.
// Host: gh-nvidia (192.168.0.10 or Tailscale)
// API: GET /api/tags (installed models), GET /api/ps (currently loaded)

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { ADAPTER_TIMEOUT_MS } from "@/lib/adapter-http";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://gh-nvidia:11434";

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaRunning {
  name: string;
  model: string;
  size: number;
  size_vram?: number;
  expires_at?: string;
}

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "ollama",
    source: OLLAMA_URL,
    queriedAt: new Date().toISOString(),
    stalenessSeconds: 0,
    cacheHit: false,
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

class OllamaAdapter implements DataAdapter {
  readonly name = "ollama";
  readonly description = "Local model inference on gh-nvidia with GPU.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) });
    } catch {
      // Unreachable — the freshness stamp still records the endpoint queried.
    }
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const [tagsRes, psRes] = await Promise.all([
        fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) }),
        fetch(`${OLLAMA_URL}/api/ps`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) }),
      ]);
      if (!tagsRes.ok) throw new Error(`HTTP ${tagsRes.status}`);

      const tags = (await tagsRes.json()) as { models?: OllamaModel[] };
      const models = tags.models ?? [];

      // /api/ps is present on newer Ollama builds only; treat absence as "none loaded"
      // rather than failing the whole query.
      let running: OllamaRunning[] = [];
      if (psRes.ok) {
        const ps = (await psRes.json()) as { models?: OllamaRunning[] };
        running = ps.models ?? [];
      }

      const diskBytes = models.reduce((acc, m) => acc + (m.size || 0), 0);
      const vramBytes = running.reduce((acc, m) => acc + (m.size_vram ?? m.size ?? 0), 0);

      const metrics: Metric[] = [
        { label: "Models", value: models.length, state: "healthy" },
        { label: "Loaded", value: running.length, state: "healthy" },
        { label: "Disk", value: formatBytes(diskBytes) },
        { label: "VRAM In Use", value: formatBytes(vramBytes) },
      ];

      const items: Item[] = [
        ...running.map((m) => ({
          id: `loaded-${m.name}`,
          label: m.name,
          subtitle: `loaded • ${formatBytes(m.size_vram ?? m.size ?? 0)} VRAM`,
          state: "healthy" as const,
          group: "loaded",
        })),
        ...models.map((m) => ({
          id: m.digest || m.name,
          label: m.name,
          subtitle: [m.details?.parameter_size, m.details?.quantization_level, formatBytes(m.size)]
            .filter(Boolean)
            .join(" • "),
          state: "healthy" as const,
          group: "installed",
        })),
      ];

      return {
        title: "Ollama — Local Inference",
        subtitle: `${models.length} models • ${running.length} loaded`,
        state: models.length > 0 ? "healthy" : "warning",
        freshness: makeFreshness(),
        metrics,
        items,
        summary: `${running.length} of ${models.length} models resident in VRAM`,
      };
    } catch {
      return {
        title: "Ollama — Local Inference",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new OllamaAdapter();
export { adapter as default };
