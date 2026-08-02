// ComfyUI adapter — queue depth, VRAM, recent generations.
// Host: gh-nvidia (192.168.0.10 or Tailscale)
// API: GET /system_stats (devices/VRAM), GET /queue (running + pending)

import type { DataAdapter } from "../adapter-base";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { ADAPTER_TIMEOUT_MS } from "@/lib/adapter-http";

const COMFYUI_URL = process.env.COMFYUI_URL || "http://gh-nvidia:8188";

interface ComfyDevice {
  name?: string;
  type?: string;
  vram_total?: number;
  vram_free?: number;
}

interface ComfySystemStats {
  system?: { comfyui_version?: string; python_version?: string };
  devices?: ComfyDevice[];
}

function makeFreshness(): FreshnessInfo {
  return {
    adapter: "comfyui",
    source: COMFYUI_URL,
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

class ComfyUIAdapter implements DataAdapter {
  readonly name = "comfyui";
  readonly description = "Diffusion workflow executor on gh-nvidia.";
  readonly category = "ai" as const;

  async health(): Promise<FreshnessInfo> {
    try {
      await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) });
    } catch {
      // Unreachable — freshness still records the endpoint queried.
    }
    return makeFreshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) {
      return getFixtureForState(this.name, fixtureStateValue);
    }

    try {
      const [statsRes, queueRes] = await Promise.all([
        fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) }),
        fetch(`${COMFYUI_URL}/queue`, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) }),
      ]);
      if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);

      const stats = (await statsRes.json()) as ComfySystemStats;
      const devices = stats.devices ?? [];

      // ComfyUI returns queue entries as positional tuples; only the count and
      // the prompt id (index 1) are relied on here.
      let running: unknown[] = [];
      let pending: unknown[] = [];
      if (queueRes.ok) {
        const q = (await queueRes.json()) as {
          queue_running?: unknown[];
          queue_pending?: unknown[];
        };
        running = q.queue_running ?? [];
        pending = q.queue_pending ?? [];
      }

      const vramTotal = devices.reduce((acc, d) => acc + (d.vram_total ?? 0), 0);
      const vramFree = devices.reduce((acc, d) => acc + (d.vram_free ?? 0), 0);
      const vramUsed = vramTotal - vramFree;

      const metrics: Metric[] = [
        { label: "Running", value: running.length, state: running.length > 0 ? "warning" : "healthy" },
        { label: "Pending", value: pending.length, state: pending.length > 0 ? "warning" : "healthy" },
        { label: "Devices", value: devices.length, state: "healthy" },
      ];
      if (vramTotal > 0) {
        metrics.push(
          { label: "VRAM Used", value: formatBytes(vramUsed) },
          { label: "VRAM Total", value: formatBytes(vramTotal) },
        );
      }

      const items: Item[] = devices.map((d, i) => ({
        id: `dev-${i}`,
        label: d.name ?? d.type ?? `device ${i}`,
        subtitle:
          d.vram_total != null
            ? `${formatBytes((d.vram_total ?? 0) - (d.vram_free ?? 0))} / ${formatBytes(d.vram_total)}`
            : (d.type ?? ""),
        ...(d.vram_total ? { progress: 1 - (d.vram_free ?? 0) / d.vram_total } : {}),
        state: "healthy" as const,
        group: "devices",
      }));

      const busy = running.length + pending.length;
      return {
        title: "ComfyUI — Diffusion Workflows",
        subtitle: `${running.length} running • ${pending.length} pending`,
        state: busy > 0 ? "warning" : "healthy",
        freshness: makeFreshness(),
        metrics,
        items,
        summary: stats.system?.comfyui_version
          ? `ComfyUI ${stats.system.comfyui_version}, ${busy} job(s) in flight`
          : `${busy} job(s) in flight`,
      };
    } catch {
      return {
        title: "ComfyUI — Diffusion Workflows",
        subtitle: "API unreachable",
        state: "offline",
        freshness: makeFreshness(),
        metrics: [{ label: "Status", value: "UNREACHABLE", state: "offline" }],
      };
    }
  }
}

const adapter = new ComfyUIAdapter();
export { adapter as default };
