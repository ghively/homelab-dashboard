// Ollama adapter — models, loaded, GPU memory, queue.
// Host: gh-nvidia (192.168.0.10 or Tailscale)
// API: /api/tags, /api/ps, /api/show, inference metrics

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { Item, Metric, VisualQueryResult } from "../types";

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaRunning {
  name: string;
  model: string;
  size: number;
  digest: string;
  expires_at: string;
}

class OllamaAdapter implements DataAdapter {
  readonly name = "ollama";
  readonly description = "Local model inference on gh-nvidia with GPU.";
  readonly category = "ai" as const;

  async health() {
    const start = Date.now();
    try {
      // TODO: Real health check: GET http://gh-nvidia:11434/api/tags
      return {
        adapter: this.name,
        source: "ollama-mock",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    } catch (err) {
      return {
        adapter: this.name,
        source: "ollama-mock",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    const now = new Date().toISOString();
    const start = Date.now();

    try {
      // TODO: Fetch from Ollama API:
      // - GET http://gh-nvidia:11434/api/tags (available models)
      // - GET http://gh-nvidia:11434/api/ps (running models, memory)
      // - GET http://gh-nvidia:11434/api/show (model details)
      // - GPU metrics from nvidia-smi

      // Mock data for now.
      const models: OllamaModel[] = [
        { name: "llama3.3:70b", modified_at: now, size: 42400000000, digest: "abc123", details: { format: "gguf", family: "llama", families: ["llama"], parameter_size: "70B", quantization_level: "Q4_K_M" } },
        { name: "llava:7b", modified_at: now, size: 4300000000, digest: "def456", details: { format: "gguf", family: "llava", families: ["llama", "clip"], parameter_size: "7B", quantization_level: "Q4_K_M" } },
        { name: "qwen2.5:14b", modified_at: now, size: 9200000000, digest: "ghi789", details: { format: "gguf", family: "qwen2", families: ["qwen2"], parameter_size: "14B", quantization_level: "Q4_K_M" } },
      ];

      const running: OllamaRunning[] = [
        { name: "llama3.3:70b", model: "llama3.3:70b", size: 42400000000, digest: "abc123", expires_at: new Date(Date.now() + 300_000).toISOString() },
      ];

      const items: Item[] = models.map((m) => {
        const isRunning = running.some((r) => r.name === m.name);
        return {
          id: m.name,
          label: m.name,
          subtitle: `${m.details.family} ${m.details.parameter_size} ${m.details.quantization_level}`,
          state: isRunning ? ("healthy" as const) : ("stale" as const),
          value: (m.size / 1_000_000_000).toFixed(1),
          meta: { format: m.details.format, family: m.details.families.join(", "), size: m.size },
        };
      });

      const metrics: Metric[] = [
        { label: "Available Models", value: models.length, state: "healthy" as const },
        { label: "Running Models", value: running.length, state: running.length > 0 ? "healthy" as const : "empty" as const },
        { label: "GPU Memory Used", value: "16.2", unit: "GB", state: "warning" as const },
        { label: "GPU Utilization", value: 78, unit: "%", state: "healthy" as const },
        { label: "VRAM Free", value: 9.8, unit: "GB", state: "healthy" as const },
      ];

      return {
        title: "Ollama — Local Models on gh-nvidia",
        subtitle: "GPU-accelerated inference",
        state: "healthy" as const,
        freshness: {
          adapter: this.name,
          source: "ollama-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics,
        items,
      };
    } catch (err) {
      return {
        title: "Ollama — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical" as const,
        freshness: {
          adapter: this.name,
          source: "ollama-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" as const }],
      };
    }
  }
}

const adapter = new OllamaAdapter();
export { adapter as default };