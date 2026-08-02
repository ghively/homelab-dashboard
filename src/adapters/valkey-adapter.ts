// Valkey adapter — real reachability + INFO over the Redis/RESP wire protocol.
//
// Valkey has no HTTP surface, so this speaks RESP over a raw TCP socket: a real
// PING (must return +PONG) followed by INFO, whose fields are genuine
// measurements taken from the running server — version, uptime, connected
// clients, memory, keyspace size, and keyspace hit/miss counters. Nothing here
// is fabricated; the previous version invented hit rates and key counts.
//
// Gated on VALKEY_HOST. Absent → labelled fixture. When set but the socket
// cannot be reached, the adapter reports offline (honest), never a fixture.

import net from "node:net";
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import { ADAPTER_TIMEOUT_MS, classifyError, makeFreshness } from "@/lib/adapter-http";

const VALKEY_HOST = process.env.VALKEY_HOST || "";
const VALKEY_PORT = Number(process.env.VALKEY_PORT || 6379);
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD || "";

/**
 * Minimal RESP round-trip. Sends optional AUTH, then PING and INFO as inline
 * commands, collects the response for the timeout window, and returns the raw
 * text. Kept dependency-free — a single socket, no Redis client library.
 */
function respPingInfo(host: string, port: number, password: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buf = "";
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(buf);
    };

    const timer = setTimeout(() => done(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    // Give INFO a moment to stream, then close and parse what we have.
    let flushTimer: NodeJS.Timeout | null = null;

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      const cmd = (password ? `AUTH ${password}\r\n` : "") + "PING\r\n" + "INFO\r\n";
      socket.write(cmd);
    });
    socket.on("data", (d) => {
      buf += d.toString("utf8");
      // INFO's bulk string ends with \r\n after the payload; once we have seen a
      // reasonable amount, debounce a close so we do not wait the full timeout.
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        clearTimeout(timer);
        done();
      }, 150);
    });
    socket.on("timeout", () => done(new Error(`timeout after ${timeoutMs}ms`)));
    socket.on("error", (e) => {
      clearTimeout(timer);
      done(e);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      done();
    });
  });
}

function parseInfo(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith("+") || line.startsWith("$") || line.startsWith("*")) continue;
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

function freshness(start?: number): FreshnessInfo {
  return makeFreshness("valkey", VALKEY_HOST ? `${VALKEY_HOST}:${VALKEY_PORT}` : "unconfigured", start);
}

export class ValkeyAdapter implements DataAdapter {
  readonly name = "valkey";
  readonly description = "Valkey — RESP reachability, memory, keyspace and hit rate.";
  readonly category = "ops" as const;

  async health(): Promise<FreshnessInfo> {
    return freshness();
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    if (!VALKEY_HOST) {
      return {
        title: "Valkey",
        subtitle: "Not configured",
        state: "empty",
        freshness: freshness(),
        metrics: [{ label: "Status", value: "NOT CONFIGURED", state: "empty" }],
        summary: "Set VALKEY_HOST (and VALKEY_PORT) to connect this service.",
      };
    }

    const start = Date.now();
    try {
      const raw = await respPingInfo(VALKEY_HOST, VALKEY_PORT, VALKEY_PASSWORD, ADAPTER_TIMEOUT_MS);

      if (!/\+PONG/.test(raw) && !/valkey_version|redis_version/.test(raw)) {
        // Connected but the reply was not a Valkey/Redis PONG — could be auth
        // failure. RESP surfaces AUTH errors as "-NOAUTH"/"-WRONGPASS".
        if (/NOAUTH|WRONGPASS/.test(raw)) {
          return {
            title: "Valkey",
            subtitle: "Authentication required",
            state: "denied",
            freshness: freshness(start),
            metrics: [{ label: "Status", value: "AUTH REQUIRED", state: "denied" }],
            summary: "Valkey answered but rejected the connection. Set VALKEY_PASSWORD.",
          };
        }
        throw new Error("unexpected RESP reply (no PONG / version)");
      }

      const info = parseInfo(raw);
      const version = info.valkey_version || info.redis_version || "unknown";
      const clients = Number(info.connected_clients ?? NaN);
      const uptimeS = Number(info.uptime_in_seconds ?? NaN);
      const hits = Number(info.keyspace_hits ?? NaN);
      const misses = Number(info.keyspace_misses ?? NaN);
      const opsPerSec = Number(info.instantaneous_ops_per_sec ?? NaN);

      // db0:keys=7,expires=0,avg_ttl=0  → total keys across all dbN lines.
      let keys = 0;
      let sawDb = false;
      for (const [k, v] of Object.entries(info)) {
        if (/^db\d+$/.test(k)) {
          const m = /keys=(\d+)/.exec(v);
          if (m) {
            keys += Number(m[1]);
            sawDb = true;
          }
        }
      }

      const metrics: Metric[] = [
        { label: "Reachable", value: "PONG", state: "healthy" },
        { label: "Version", value: version },
      ];
      if (Number.isFinite(clients)) metrics.push({ label: "Clients", value: clients });
      if (sawDb) metrics.push({ label: "Keys", value: keys });
      if (info.used_memory_human) {
        metrics.push({
          label: "Memory",
          value: info.maxmemory_human && info.maxmemory_human !== "0B"
            ? `${info.used_memory_human} / ${info.maxmemory_human}`
            : info.used_memory_human,
        });
      }
      if (Number.isFinite(hits) && Number.isFinite(misses)) {
        const total = hits + misses;
        const rate = total > 0 ? (hits / total) * 100 : 0;
        metrics.push({ label: "Hit Rate", value: total > 0 ? `${rate.toFixed(1)}%` : "n/a (no lookups)" });
      }
      if (Number.isFinite(opsPerSec)) metrics.push({ label: "Ops/sec", value: opsPerSec });
      if (Number.isFinite(uptimeS)) {
        metrics.push({ label: "Uptime", value: `${Math.floor(uptimeS / 3600)}h` });
      }

      return {
        title: "Valkey",
        subtitle: `${version} • ${sawDb ? `${keys} keys` : "reachable"} • ${
          info.used_memory_human ?? "?"
        } used`,
        state: "healthy",
        freshness: freshness(start),
        metrics,
        summary: `Valkey ${version} reachable at ${VALKEY_HOST}:${VALKEY_PORT}${
          sawDb ? `, ${keys} keys` : ""
        }.`,
      };
    } catch (err) {
      const c = classifyError(err);
      return {
        title: "Valkey",
        subtitle: c.message,
        state: c.state,
        freshness: freshness(start),
        metrics: [{ label: "Status", value: c.kind.toUpperCase().replace(/-/g, " "), state: c.state }],
        summary: `valkey: ${c.message} (${VALKEY_HOST}:${VALKEY_PORT})`,
      };
    }
  }
}

const adapter = new ValkeyAdapter();
export { adapter as default };
