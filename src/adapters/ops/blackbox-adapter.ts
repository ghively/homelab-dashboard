// Blackbox exporter adapter — exporter health and configured probe modules.
//
// The blackbox exporter holds no probe results of its own; it probes on demand
// when Prometheus scrapes it. So the honest thing for this panel to report is
// the exporter's own state: is it up, did its config reload cleanly, when, and
// which modules are defined. The actual endpoint up/down verdicts live in the
// Prometheus panel, which scrapes the twelve blackbox targets on this fleet.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { ADAPTER_FANOUT_TIMEOUT_MS, failureResult, fetchText, makeFreshness } from "@/lib/adapter-http";
import { findSample, parsePromText, sampleValue } from "./prom-text";

const BLACKBOX_URL = process.env.BLACKBOX_URL || "";

/** Top-level `moduleName:` keys under the `modules:` block of /config. */
function parseModuleNames(yaml: string): string[] {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => /^modules:\s*$/.test(l));
  if (start === -1) return [];
  const names: string[] = [];
  let indent: number | null = null;
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const lead = line.length - line.trimStart().length;
    if (lead === 0) break; // left the modules block
    if (indent === null) indent = lead;
    if (lead !== indent) continue; // nested key, not a module name
    const m = /^([A-Za-z0-9_.-]+):\s*$/.exec(line.trim());
    if (m) names.push(m[1]!);
  }
  return names;
}

class BlackboxAdapter implements DataAdapter {
  readonly name = "blackbox";
  readonly description = "Blackbox exporter — exporter health and configured probe modules.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, BLACKBOX_URL || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!BLACKBOX_URL) {
      return {
        title: "Blackbox exporter",
        subtitle: "Not configured",
        state: "empty",
        freshness: makeFreshness(this.name, "unconfigured"),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set BLACKBOX_URL to connect this service.",
      };
    }

    const base = BLACKBOX_URL.replace(/\/$/, "");
    const start = Date.now();
    try {
      const metricsText = await fetchText(`${base}/metrics`);
      const samples = parsePromText(metricsText);

      const build = findSample(samples, "blackbox_exporter_build_info");
      const reloadOk = sampleValue(samples, "blackbox_exporter_config_last_reload_successful") === 1;
      const reloadAt = sampleValue(samples, "blackbox_exporter_config_last_reload_success_timestamp_seconds");
      const unknownModules = sampleValue(samples, "blackbox_module_unknown_total") ?? 0;

      const configYaml = await fetchText(`${base}/config`, {}, ADAPTER_FANOUT_TIMEOUT_MS).catch(() => "");
      const modules = configYaml ? parseModuleNames(configYaml) : [];

      const metrics: Metric[] = [
        { label: "Exporter", value: "UP", state: "healthy" },
        { label: "Version", value: build?.labels.version ?? "unknown" },
        { label: "Config Reload", value: reloadOk ? "OK" : "FAILED", state: reloadOk ? "healthy" : "critical" },
        ...(reloadAt ? [{ label: "Reloaded", value: new Date(reloadAt * 1000).toISOString().slice(0, 19).replace("T", " ") }] : []),
        { label: "Modules", value: modules.length },
        {
          label: "Unknown Module Requests",
          value: Math.round(unknownModules),
          state: unknownModules > 0 ? "warning" : "healthy",
        },
      ];

      const items: Item[] = modules.map((m) => ({
        id: `module:${m}`,
        label: m,
        subtitle: "probe module",
        state: "healthy" as const,
        group: "modules",
      }));

      return {
        title: "Blackbox — Endpoint Probing",
        subtitle: `v${build?.labels.version ?? "?"} • ${modules.length} modules • config ${reloadOk ? "OK" : "FAILED"}`,
        state: reloadOk ? (unknownModules > 0 ? "warning" : "healthy") : "critical",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary: `Blackbox exporter ${build?.labels.version ?? "?"} up with ${modules.length} probe modules; last config reload ${reloadOk ? "succeeded" : "FAILED"}. Probe verdicts are reported by the Prometheus panel.`,
      };
    } catch (err) {
      return failureResult(this.name, "Blackbox exporter", base, err, start);
    }
  }
}

const adapter = new BlackboxAdapter();
export { adapter as default };
