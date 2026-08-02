// MQTT adapter — broker reachability and connection acceptance.
//
// WHAT THIS PANEL DELIBERATELY DOES NOT SHOW
// ------------------------------------------
// Topic counts, client counts and message rates. Those numbers live in the
// broker's $SYS tree, which requires an authenticated subscription; this
// broker refuses anonymous connections (CONNACK return code 5), so there is no
// honest way to produce them. The previous version of this file reported a
// `messageCount` it accumulated in process memory and a `subscribedTopics` set
// it had populated itself — both were facts about the dashboard, not about the
// broker, and they were presented as broker statistics.
//
// WHAT IT DOES SHOW
// -----------------
// Exactly what a raw MQTT 3.1.1 CONNECT exchange measures:
//   • that the TCP port accepts a connection, and how long that took
//   • the CONNACK return code the broker sent back, decoded
//   • whether the session was accepted, rejected for credentials, or refused
// That is enough to distinguish "broker is down" from "broker is up and my
// credentials are wrong", which is the whole job of this panel.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import { failureResult, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";
import { parseHostPort, tcpExchange } from "./home/tcp";

const BROKER_ENV = "MQTT_BROKER_URL";
const USER_ENV = "MQTT_USERNAME";
const PASS_ENV = "MQTT_PASSWORD";

/** MQTT 3.1.1 CONNACK return codes (MQTT-3.2.2.3). */
const CONNACK_CODES: Record<number, { label: string; state: VisualQueryResult["state"] }> = {
  0: { label: "Connection accepted", state: "healthy" },
  1: { label: "Refused — unacceptable protocol version", state: "critical" },
  2: { label: "Refused — client identifier rejected", state: "warning" },
  3: { label: "Refused — server unavailable", state: "critical" },
  4: { label: "Refused — bad username or password", state: "denied" },
  5: { label: "Refused — not authorized", state: "denied" },
};

function encodeString(s: string): Buffer {
  const body = Buffer.from(s, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length, 0);
  return Buffer.concat([len, body]);
}

/** Remaining Length, variable-byte encoded (MQTT-2.2.3). */
function encodeRemainingLength(n: number): Buffer {
  const bytes: number[] = [];
  let value = n;
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    bytes.push(byte);
  } while (value > 0);
  return Buffer.from(bytes);
}

function buildConnect(clientId: string, username?: string, password?: string): Buffer {
  // Connect flags: clean session (0x02), plus username (0x80) / password (0x40).
  let flags = 0x02;
  if (username) flags |= 0x80;
  if (username && password) flags |= 0x40;

  const variableHeader = Buffer.concat([
    encodeString("MQTT"),
    Buffer.from([0x04]), // protocol level 4 == MQTT 3.1.1
    Buffer.from([flags]),
    Buffer.from([0x00, 0x3c]), // keep-alive 60s
  ]);

  const payloadParts = [encodeString(clientId)];
  if (username) payloadParts.push(encodeString(username));
  if (username && password) payloadParts.push(encodeString(password));
  const payload = Buffer.concat(payloadParts);

  const body = Buffer.concat([variableHeader, payload]);
  return Buffer.concat([Buffer.from([0x10]), encodeRemainingLength(body.length), body]);
}

export class MQTTAdapter implements DataAdapter {
  readonly name = "mqtt";
  readonly description = "MQTT broker — reachability and connection acceptance.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[BROKER_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const raw = process.env[BROKER_ENV];
    if (!raw) return notConfiguredResult(this.name, "MQTT", BROKER_ENV);

    const { host, port } = parseHostPort(raw, 1883);
    const source = `${host}:${port}`;
    const username = process.env[USER_ENV];
    const password = process.env[PASS_ENV];
    const start = Date.now();

    try {
      const connect = buildConnect(`homelab-dashboard-probe-${process.pid}`, username, password);
      // A CONNACK is exactly 4 bytes: 0x20 0x02 <session-present> <return-code>.
      const { data, elapsedMs } = await tcpExchange(host, port, connect, (buf) => buf.length >= 4);

      if (data.length < 4 || data[0] !== 0x20) {
        return {
          title: "MQTT — Message Broker",
          subtitle: "Port answered but did not speak MQTT",
          state: "warning",
          freshness: makeFreshness(this.name, source, start),
          metrics: [
            { label: "Broker", value: source },
            { label: "Status", value: "NOT MQTT", state: "warning" },
            { label: "First Byte", value: data.length ? `0x${data[0].toString(16)}` : "none" },
          ],
          summary: `${source} accepted a TCP connection but the reply was not an MQTT CONNACK.`,
        };
      }

      const returnCode = data[3];
      const decoded = CONNACK_CODES[returnCode] ?? {
        label: `Refused — unknown return code ${returnCode}`,
        state: "warning" as const,
      };
      const authed = Boolean(username);

      const metrics: Metric[] = [
        { label: "Broker", value: source },
        { label: "CONNACK", value: `${returnCode} — ${decoded.label}`, state: decoded.state },
        { label: "Handshake", value: elapsedMs, unit: "ms" },
        { label: "Credentials", value: authed ? `sent as ${username}` : "none sent" },
        { label: "Protocol", value: "MQTT 3.1.1" },
      ];

      const needsCreds = decoded.state === "denied";
      return {
        title: "MQTT — Message Broker",
        subtitle: `${source} • ${decoded.label}`,
        state: decoded.state,
        freshness: makeFreshness(this.name, source, start),
        metrics,
        summary: needsCreds
          ? `Broker at ${source} is up and speaking MQTT but refused this connection ` +
            `(CONNACK ${returnCode}). Set ${USER_ENV} and ${PASS_ENV} to authenticate. ` +
            `Topic and message-rate statistics live in $SYS and stay unavailable until then.`
          : `Broker at ${source} accepted an MQTT 3.1.1 CONNECT in ${elapsedMs}ms ` +
            `(CONNACK ${returnCode}). This panel reports connection health only — ` +
            `it does not sample $SYS message counters.`,
      };
    } catch (err) {
      return failureResult(this.name, "MQTT", source, err, start);
    }
  }
}

const adapter = new MQTTAdapter();
export { adapter as default };
