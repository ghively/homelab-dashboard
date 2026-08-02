/**
 * Deadline-bounded raw TCP for the two `home` services that have no HTTP
 * surface: the MQTT broker and the Wyoming voice satellites.
 *
 * adapter-http.ts covers every fetch() in the codebase, but it cannot help
 * here — there is nothing to fetch. The rule it exists to enforce still
 * applies though: a socket to a host that accepts the SYN and then says
 * nothing must not hang the world. Every function below carries its own
 * deadline and destroys the socket on the way out, and the error strings are
 * chosen so classifyError() in adapter-http maps them onto the same states an
 * HTTP failure would produce (ECONNREFUSED → offline, "timeout" → offline).
 */

import net from "node:net";

export const TCP_TIMEOUT_MS = 3000;

export interface TcpExchange {
  /** Bytes received before the deadline or the caller's stop condition. */
  data: Buffer;
  /** Milliseconds from connect() to the point the exchange ended. */
  elapsedMs: number;
}

/**
 * Connect, optionally send a probe, and read until `isComplete` says the
 * response is whole (or the deadline fires).
 *
 * `isComplete` returning false at the deadline is not an error — a Wyoming
 * `info` event whose payload is still arriving is better reported as the
 * partial truth than as a failure. Callers decide what a short read means.
 */
export async function tcpExchange(
  host: string,
  port: number,
  probe: Buffer | null,
  isComplete: (buf: Buffer) => boolean,
  timeoutMs: number = TCP_TIMEOUT_MS,
): Promise<TcpExchange> {
  return new Promise<TcpExchange>((resolve, reject) => {
    const start = Date.now();
    const chunks: Buffer[] = [];
    let settled = false;

    const socket = net.createConnection({ host, port });
    socket.setNoDelay(true);

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      if (err) reject(err);
      else resolve({ data: Buffer.concat(chunks), elapsedMs: Date.now() - start });
    };

    const timer = setTimeout(() => {
      // A deadline with bytes in hand is a short read, not a failure; a
      // deadline with nothing is the dead-host case adapter-http warns about.
      if (chunks.length > 0) finish();
      else finish(new Error(`timeout after ${timeoutMs}ms connecting to ${host}:${port}`));
    }, timeoutMs);

    socket.on("connect", () => {
      if (probe) socket.write(probe);
    });
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (isComplete(Buffer.concat(chunks))) finish();
    });
    socket.on("error", (err) => finish(err));
    socket.on("close", () => {
      // Peer hung up. Whatever arrived is the answer.
      if (chunks.length > 0) finish();
      else finish(new Error(`connection closed by ${host}:${port} with no response`));
    });
  });
}

/** Parse `host:port`, defaulting the port when the caller omits it. */
export function parseHostPort(raw: string, defaultPort: number): { host: string; port: number } {
  const trimmed = raw.trim().replace(/^\w+:\/\//, "");
  const idx = trimmed.lastIndexOf(":");
  if (idx === -1) return { host: trimmed, port: defaultPort };
  const port = Number(trimmed.slice(idx + 1));
  return {
    host: trimmed.slice(0, idx),
    port: Number.isFinite(port) && port > 0 ? port : defaultPort,
  };
}
