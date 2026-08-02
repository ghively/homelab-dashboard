/**
 * Minimal parser for the Prometheus text exposition format.
 *
 * Several services on this fleet (node_exporter, blackbox_exporter, Loki)
 * publish only /metrics — there is no JSON API to read. Rather than pull a
 * dependency for four call sites, this parses the two things the adapters
 * actually need: a sample's value, and its labels.
 *
 * Deliberately not a full parser. It ignores # HELP/# TYPE, histograms and
 * exemplars, because no adapter here consumes them.
 */

export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?$/;

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  // Values may contain escaped quotes and commas, so match pairs rather than
  // splitting on ",".
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]!] = m[2]!.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  }
  return out;
}

export function parsePromText(body: string): PromSample[] {
  const samples: PromSample[] = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = LINE.exec(t);
    if (!m) continue;
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    samples.push({ name: m[1]!, labels: parseLabels(m[2]), value });
  }
  return samples;
}

/** First sample with this metric name, optionally filtered by labels. */
export function findSample(
  samples: PromSample[],
  name: string,
  labelFilter: Record<string, string> = {},
): PromSample | undefined {
  return samples.find(
    (s) => s.name === name && Object.entries(labelFilter).every(([k, v]) => s.labels[k] === v),
  );
}

export function sampleValue(
  samples: PromSample[],
  name: string,
  labelFilter: Record<string, string> = {},
): number | undefined {
  return findSample(samples, name, labelFilter)?.value;
}

/** Sum of every sample with this metric name. */
export function sumSamples(samples: PromSample[], name: string): number {
  return samples.filter((s) => s.name === name).reduce((a, s) => a + s.value, 0);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
