// Wyoming adapter — voice satellite discovery over the Wyoming protocol.
//
// Wyoming is a line-delimited JSON protocol over a raw TCP socket, not a
// WebSocket and not HTTP. Each event is one JSON line; if that line carries a
// `data_length`, exactly that many bytes of JSON payload follow it. Sending
// `{"type":"describe"}` makes a server answer with an `info` event describing
// every program it hosts and every model or voice that program has installed.
//
// So every value on this panel is read out of a real `info` response:
//   • which of the configured endpoints answered `describe`
//   • the Wyoming protocol version each one reported
//   • the ASR / TTS / wake / intent / handle programs each one hosts
//   • how many models or voices each program declares as installed
//
// The old version opened a WebSocket (wrong transport — it could never
// connect), then reported a `services` list it read back out of a Map it never
// populated, so every instance showed zero services regardless of reality.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import { failureResult, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import { parseHostPort, tcpExchange } from "./home/tcp";

const ENDPOINTS_ENV = "WYOMING_ENDPOINTS";

/** The program categories a Wyoming `info` payload can advertise. */
const PROGRAM_KINDS = ["asr", "tts", "wake", "intent", "handle"] as const;
type ProgramKind = (typeof PROGRAM_KINDS)[number];

interface WyomingProgram {
  name?: string;
  description?: string;
  version?: string;
  installed?: boolean;
  models?: Array<{ name?: string }>;
  voices?: Array<{ name?: string }>;
}

type WyomingInfo = Partial<Record<ProgramKind, WyomingProgram[]>>;

interface Endpoint {
  label: string;
  host: string;
  port: number;
}

interface Probe {
  endpoint: Endpoint;
  ok: boolean;
  protocolVersion?: string;
  info?: WyomingInfo;
  elapsedMs?: number;
  error?: string;
}

/**
 * `label=host:port` pairs, comma separated. The label is optional — the
 * host:port stands in when it is omitted — but naming them is worth it,
 * because "piper" and "openwakeword" mean far more on a panel than :10201
 * and :10400.
 */
function parseEndpoints(raw: string): Endpoint[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      const label = eq === -1 ? "" : entry.slice(0, eq).trim();
      const target = eq === -1 ? entry : entry.slice(eq + 1).trim();
      const { host, port } = parseHostPort(target, 10200);
      return { label: label || `${host}:${port}`, host, port };
    });
}

/**
 * A `describe` is complete once the header line has arrived AND the payload it
 * announced has arrived in full. Piper advertises ~80KB of voices, so this
 * spans many TCP segments.
 */
function describeComplete(buf: Buffer): boolean {
  const nl = buf.indexOf(0x0a);
  if (nl === -1) return false;
  try {
    const header = JSON.parse(buf.subarray(0, nl).toString("utf8")) as { data_length?: number };
    return buf.length >= nl + 1 + (header.data_length ?? 0);
  } catch {
    return false;
  }
}

async function probeEndpoint(endpoint: Endpoint): Promise<Probe> {
  try {
    const { data, elapsedMs } = await tcpExchange(
      endpoint.host,
      endpoint.port,
      Buffer.from(JSON.stringify({ type: "describe" }) + "\n", "utf8"),
      describeComplete,
    );

    const nl = data.indexOf(0x0a);
    if (nl === -1) return { endpoint, ok: false, error: "no Wyoming event received" };

    const header = JSON.parse(data.subarray(0, nl).toString("utf8")) as {
      type?: string;
      version?: string;
      data_length?: number;
    };
    if (header.type !== "info") {
      return { endpoint, ok: false, error: `unexpected event type "${header.type}"` };
    }

    const payload = data.subarray(nl + 1, nl + 1 + (header.data_length ?? 0)).toString("utf8");
    return {
      endpoint,
      ok: true,
      protocolVersion: header.version,
      info: payload ? (JSON.parse(payload) as WyomingInfo) : {},
      elapsedMs,
    };
  } catch (err) {
    return { endpoint, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function assetCount(p: WyomingProgram): number {
  return (p.models?.length ?? 0) + (p.voices?.length ?? 0);
}

function describePrograms(info: WyomingInfo): string {
  const parts: string[] = [];
  for (const kind of PROGRAM_KINDS) {
    const programs = info[kind] ?? [];
    if (programs.length > 0) parts.push(`${kind}: ${programs.map((p) => p.name ?? "?").join(", ")}`);
  }
  return parts.join(" • ") || "no programs advertised";
}

export class WyomingAdapter implements DataAdapter {
  readonly name = "wyoming";
  readonly description = "Wyoming voice satellites — ASR, TTS and wake-word programs.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[ENDPOINTS_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const raw = process.env[ENDPOINTS_ENV];
    if (!raw) return notConfiguredResult(this.name, "Wyoming", ENDPOINTS_ENV);

    const endpoints = parseEndpoints(raw);
    const source = endpoints.map((e) => `${e.host}:${e.port}`).join(",");
    const start = Date.now();

    if (endpoints.length === 0) {
      return notConfiguredResult(this.name, "Wyoming", ENDPOINTS_ENV);
    }

    try {
      // Fan out: one dead satellite must not delay the ones that answer.
      const probes = await Promise.all(endpoints.map(probeEndpoint));
      const up = probes.filter((p) => p.ok);
      const down = probes.filter((p) => !p.ok);

      // Aggregate only over endpoints that actually answered.
      const programTotals: Partial<Record<ProgramKind, number>> = {};
      let assets = 0;
      for (const p of up) {
        for (const kind of PROGRAM_KINDS) {
          const programs = p.info?.[kind] ?? [];
          if (programs.length) programTotals[kind] = (programTotals[kind] ?? 0) + programs.length;
          assets += programs.reduce((n, prog) => n + assetCount(prog), 0);
        }
      }

      const metrics: Metric[] = [
        {
          label: "Satellites Up",
          value: `${up.length}/${probes.length}`,
          state: down.length ? (up.length ? "warning" : "critical") : "healthy",
        },
        ...PROGRAM_KINDS.filter((k) => programTotals[k]).map((k) => ({
          label: k.toUpperCase(),
          value: programTotals[k] as number,
        })),
        { label: "Models/Voices", value: assets },
        ...(up[0]?.protocolVersion ? [{ label: "Protocol", value: up[0].protocolVersion }] : []),
      ];

      const items: Item[] = [
        ...probes.map((p) => ({
          id: `endpoint:${p.endpoint.host}:${p.endpoint.port}`,
          label: p.endpoint.label,
          subtitle: p.ok
            ? `${p.endpoint.host}:${p.endpoint.port} • ${describePrograms(p.info ?? {})}`
            : `${p.endpoint.host}:${p.endpoint.port} • ${p.error}`,
          value: p.ok ? `${p.elapsedMs}ms` : "unreachable",
          state: (p.ok ? "healthy" : "offline") as "healthy" | "offline",
          group: "satellites",
        })),
        ...up.flatMap((p) =>
          PROGRAM_KINDS.flatMap((kind) =>
            (p.info?.[kind] ?? []).map((prog) => ({
              id: `program:${p.endpoint.label}:${kind}:${prog.name ?? "?"}`,
              label: prog.name ?? "unnamed",
              subtitle: `${kind} on ${p.endpoint.label}${prog.version ? ` • v${prog.version}` : ""}`,
              value: `${assetCount(prog)} ${kind === "tts" ? "voices" : "models"}`,
              state: (prog.installed === false ? "warning" : "healthy") as "warning" | "healthy",
              group: "programs",
            })),
          ),
        ),
      ];

      const state: VisualQueryResult["state"] =
        up.length === 0 ? "offline" : down.length > 0 ? "warning" : "healthy";

      return {
        title: "Wyoming — Voice Pipeline",
        subtitle: `${up.length}/${probes.length} satellites • ${assets} models/voices installed`,
        state,
        freshness: makeFreshness(this.name, source, start),
        metrics,
        items,
        summary:
          `${up.length} of ${probes.length} Wyoming endpoints answered a describe request. ` +
          up.map((p) => `${p.endpoint.label} (${describePrograms(p.info ?? {})})`).join("; ") +
          (down.length ? `. Unreachable: ${down.map((p) => p.endpoint.label).join(", ")}.` : "."),
      };
    } catch (err) {
      return failureResult(this.name, "Wyoming", source, err, start);
    }
  }
}

const adapter = new WyomingAdapter();
export { adapter as default };
