// cAdvisor adapter — container host capacity.
//
// Cost note, because it dictates the endpoint choice: /api/v1.3/docker and
// /metrics on this host are ~6.8 MB and ~9.5 MB respectively — cAdvisor emits
// every container label as a metric label. Pulling either on every panel
// refresh to count containers is not a trade worth making, so this adapter
// reads /healthz plus /api/v1.3/machine (~10 KB) and reports the machine
// capacity cAdvisor is actually authoritative for. Per-container stats belong
// in the Prometheus panel, which already scrapes this exporter.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_TIMEOUT_MS, failureResult, fetchJson, makeFreshness } from "@/lib/adapter-http";
import { formatBytes } from "./prom-text";

const CADVISOR_URL = process.env.CADVISOR_URL || "";

interface MachineInfo {
  num_cores?: number;
  cpu_frequency_khz?: number;
  memory_capacity?: number;
  machine_id?: string;
  filesystems?: Array<{ device?: string; capacity?: number; type?: string }>;
  disk_map?: Record<string, { name?: string; size?: number }>;
}

class CadvisorAdapter implements DataAdapter {
  readonly name = "cadvisor";
  readonly description = "cAdvisor — container host capacity and exporter health.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, CADVISOR_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!CADVISOR_URL) {
      return {
        title: "cAdvisor",
        subtitle: "Not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set CADVISOR_URL to connect this service.",
      };
    }

    const base = CADVISOR_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const healthRes = await fetch(`${base}/healthz`, {
        signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS),
        cache: "no-store",
      });
      const healthy = healthRes.ok;

      const machine = await fetchJson<MachineInfo>(`${base}/api/v1.3/machine`);
      const filesystems = (machine.filesystems ?? []).filter((f) => (f.capacity ?? 0) > 0);
      const totalDisk = filesystems.reduce((a, f) => a + (f.capacity ?? 0), 0);

      const metrics: Metric[] = [
        { label: "Exporter", value: healthy ? "HEALTHY" : "UNHEALTHY", state: healthy ? "healthy" : "critical" },
        { label: "CPU Cores", value: machine.num_cores ?? 0 },
        ...(machine.cpu_frequency_khz
          ? [{ label: "CPU Clock", value: `${(machine.cpu_frequency_khz / 1_000_000).toFixed(2)} GHz` }]
          : []),
        { label: "Memory", value: formatBytes(machine.memory_capacity ?? 0) },
        { label: "Filesystems", value: filesystems.length },
        { label: "Disk Capacity", value: formatBytes(totalDisk) },
      ];

      const items: Item[] = filesystems.map((f) => ({
        id: `fs:${f.device ?? "unknown"}`,
        label: f.device ?? "unknown",
        subtitle: `${f.type ?? "fs"} • ${formatBytes(f.capacity ?? 0)}`,
        value: formatBytes(f.capacity ?? 0),
        state: "healthy" as const,
        group: "filesystems",
      }));

      return {
        title: "cAdvisor — Container Host",
        subtitle: `${machine.num_cores ?? 0} cores • ${formatBytes(machine.memory_capacity ?? 0)} RAM • ${filesystems.length} filesystems`,
        state: healthy ? "healthy" : "critical",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `cAdvisor ${healthy ? "healthy" : "unhealthy"} on a ${machine.num_cores ?? 0}-core host with ${formatBytes(machine.memory_capacity ?? 0)} RAM and ${formatBytes(totalDisk)} of disk.`,
      };
    } catch (err) {
      return failureResult(this.name, "cAdvisor", base, err, start);
    }
  }
}

const adapter = new CadvisorAdapter();
export { adapter as default };
