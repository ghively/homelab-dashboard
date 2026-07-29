// ComfyUI adapter — workflows, queue, GPU, generation history.
// Host: gh-nvidia (192.168.0.10 or Tailscale)
// API: /system_stats, /queue, /history, GPU/VRAM

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { Event, Item, Metric, VisualQueryResult } from "../types";

interface ComfyQueueItem {
  prompt_id: string;
  number: number;
  node_left: number;
  node_finished: number;
}

interface ComfyHistoryItem {
  prompt_id: string;
  outputs: Record<string, { images: Array<{ filename: string; subfolder: string; type: string }> }>;
}

class ComfyUIAdapter implements DataAdapter {
  readonly name = "comfyui";
  readonly description = "Diffusion workflow executor on gh-nvidia.";
  readonly category = "ai" as const;

  async health() {
    const start = Date.now();
    try {
      // TODO: Real health check: GET http://gh-nvidia:8188/system_stats
      return {
        adapter: this.name,
        source: "comfyui-mock",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    } catch (err) {
      return {
        adapter: this.name,
        source: "comfyui-mock",
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
      // TODO: Fetch from ComfyUI API:
      // - GET http://gh-nvidia:8188/system_stats (queue info, system status)
      // - GET http://gh-nvidia:8188/history (generation history)
      // - GET http://gh-nvidia:8188/view (current running prompt)
      // - GPU metrics from nvidia-smi

      // Mock data for now.
      const queue: ComfyQueueItem[] = [
        { prompt_id: "queue-001", number: 1, node_left: 5, node_finished: 2 },
        { prompt_id: "queue-002", number: 2, node_left: 12, node_finished: 0 },
      ];

      const history: ComfyHistoryItem[] = [
        {
          prompt_id: "hist-001",
          outputs: {
            "1": {
              images: [{ filename: "image_00001.png", subfolder: "", type: "output" }],
            },
          },
        },
        {
          prompt_id: "hist-002",
          outputs: {
            "2": {
              images: [{ filename: "image_00002.png", subfolder: "", type: "output" }],
            },
          },
        },
      ];

      const items: Item[] = queue.map((q) => ({
        id: q.prompt_id,
        label: `Queue #${q.number}`,
        subtitle: `${q.node_finished}/${q.node_left + q.node_finished} nodes done`,
        progress: q.node_finished / (q.node_left + q.node_finished),
        state: "loading" as const,
      }));

      const events: Event[] = history.map((h, i) => ({
        id: h.prompt_id,
        at: new Date(Date.now() - (i + 1) * 300_000).toISOString(),
        title: "Generation Complete",
        detail: h.prompt_id,
        state: "healthy" as const,
      }));

      const metrics: Metric[] = [
        { label: "Queue Size", value: queue.length, state: queue.length > 5 ? "warning" : "healthy" as const },
        { label: "Active Generations", value: queue.filter((q) => q.node_finished > 0).length, state: "healthy" as const },
        { label: "History Size", value: history.length, state: "healthy" as const },
        { label: "GPU Temp", value: 72, unit: "°C", state: "healthy" as const },
        { label: "VRAM Used", value: 18.4, unit: "GB", state: "warning" as const },
      ];

      return {
        title: "ComfyUI — Diffusion Workflows",
        subtitle: "Image generation queue on gh-nvidia",
        state: "healthy" as const,
        freshness: {
          adapter: this.name,
          source: "comfyui-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics,
        items,
        events,
      };
    } catch (err) {
      return {
        title: "ComfyUI — Error",
        subtitle: err instanceof Error ? err.message : "Unknown error",
        state: "critical" as const,
        freshness: {
          adapter: this.name,
          source: "comfyui-mock",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" as const }],
      };
    }
  }
}

const adapter = new ComfyUIAdapter();
export { adapter as default };