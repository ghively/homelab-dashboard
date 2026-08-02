// GPU adapter — real NVIDIA device telemetry.
//
// There is no DCGM / nvidia_gpu_exporter reachable on the fleet (no GPU job in
// Prometheus, ports 9400/9835 closed on gh-nvidia over the tailnet). The one
// HTTP surface that reports genuine CUDA device state is ComfyUI's
// /system_stats endpoint, which calls torch.cuda.mem_get_info() — so the device
// name and the device-wide VRAM total/free are real measurements, not a
// process-local guess.
//
// Every displayed value here comes from that fetch. Point GPU_STATS_URL at a
// ComfyUI instance (gh-nvidia :8188). Absent → labelled fixture, never a probe
// of a hardcoded host.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureForState } from "../fixtures";
import { getFixtureState } from "../registry";
import { failureResult, fetchJson, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const GPU_STATS_URL = process.env.GPU_STATS_URL || "";

interface ComfyDevice {
  name?: string;
  type?: string;
  index?: number;
  vram_total?: number;
  vram_free?: number;
}

interface ComfySystemStats {
  system?: { comfyui_version?: string };
  devices?: ComfyDevice[];
}

/** "cuda:0 NVIDIA GeForce RTX 3060 : cudaMallocAsync" → "NVIDIA GeForce RTX 3060". */
function cleanDeviceName(raw: string): string {
  return raw
    .replace(/^cuda:\d+\s+/i, "")
    .replace(/\s*:\s*cudaMalloc\w*$/i, "")
    .trim();
}

function gib(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

class GpuAdapter implements DataAdapter {
  readonly name = "gpu";
  readonly description = "GPU — CUDA device VRAM utilisation (via ComfyUI /system_stats).";
  readonly category = "host" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, GPU_STATS_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) return getFixtureForState(this.name, fixtureState);

    if (!GPU_STATS_URL) {
      return notConfiguredResult("gpu", "GPU", "GPU_STATS_URL");
    }

    const base = GPU_STATS_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const stats = await fetchJson<ComfySystemStats>(`${base}/system_stats`);
      const devices = (stats.devices ?? []).filter((d) => (d.type ?? "").toLowerCase() === "cuda" || d.vram_total);

      if (devices.length === 0) {
        return {
          title: "GPU",
          subtitle: "No CUDA devices reported",
          state: "warning",
          freshness: makeFreshness(this.name, base, start),
          metrics: [{ label: "Devices", value: 0, state: "warning" }],
          summary: "The stats endpoint answered but reported no CUDA devices.",
        };
      }

      const totalVram = devices.reduce((a, d) => a + (d.vram_total ?? 0), 0);
      const freeVram = devices.reduce((a, d) => a + (d.vram_free ?? 0), 0);
      const usedVram = totalVram - freeVram;
      const usedPct = totalVram > 0 ? (usedVram / totalVram) * 100 : 0;

      const primary = devices[0];
      const primaryName = primary?.name ? cleanDeviceName(primary.name) : "GPU";

      const metrics: Metric[] = [
        { label: "Devices", value: devices.length, state: "healthy" },
        { label: "GPU", value: primaryName },
        { label: "VRAM Used", value: gib(usedVram) },
        { label: "VRAM Total", value: gib(totalVram) },
        {
          label: "VRAM %",
          value: `${usedPct.toFixed(0)}%`,
          state: usedPct > 90 ? "warning" : "healthy",
        },
      ];
      if (stats.system?.comfyui_version) {
        metrics.push({ label: "ComfyUI", value: stats.system.comfyui_version });
      }

      const items: Item[] = devices.map((d, i) => {
        const t = d.vram_total ?? 0;
        const f = d.vram_free ?? 0;
        const u = t - f;
        return {
          id: `gpu-${d.index ?? i}`,
          label: d.name ? cleanDeviceName(d.name) : `device ${i}`,
          subtitle: `${gib(u)} / ${gib(t)} VRAM used`,
          value: t > 0 ? `${((u / t) * 100).toFixed(0)}%` : "n/a",
          progress: t > 0 ? Math.min(1, u / t) : undefined,
          state: t > 0 && u / t > 0.9 ? "warning" : "healthy",
          group: "devices",
        };
      });

      return {
        title: `GPU — ${primaryName}`,
        subtitle: `${gib(usedVram)} / ${gib(totalVram)} VRAM used • ${devices.length} device${devices.length === 1 ? "" : "s"}`,
        state: usedPct > 90 ? "warning" : "healthy",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `${primaryName}: ${usedPct.toFixed(0)}% of ${gib(totalVram)} VRAM in use.`,
      };
    } catch (err) {
      return failureResult(this.name, "GPU", base, err, start);
    }
  }
}

const adapter = new GpuAdapter();
export { adapter as default, GpuAdapter };
