/**
 * Live-adapter registration for the `home` world.
 *
 * One module per world so that wiring several worlds in parallel never
 * contends on a single file. Called from initAdapters() in adapter-runtime.
 *
 * The rule from adapter-runtime applies unchanged here: register an adapter
 * ONLY when its query() derives every displayed value from a real fetch, and
 * only when its env var is set. An unconfigured service must fall through to a
 * labelled fixture rather than probing a hardcoded default host and rendering
 * a misleading `offline`.
 *
 * GROUND TRUTH FOR THIS WORLD (probed 2026-08-02 from gh-ai)
 * ----------------------------------------------------------
 * Registered and reading live data:
 *   node-red      gh-media:1880  — /settings, /flows, /diagnostics all anonymous
 *   wyoming       gh-media:10201/10300/10400 — Wyoming `describe` over TCP
 *   stalwart-mail 127.0.0.1:8080 — /healthz/*, /jmap/session, OAuth metadata
 *   roundcube     gh-arm:8000    — login page availability (no read API exists)
 *   vikunja       gh-arm:3456    — /info anonymous, projects+tasks with a token
 *   telegram      Bot API        — getMe + getWebhookInfo
 *
 * Registered but expected to render `denied` until a credential is supplied:
 *   home-assistant gh-media:8123 — up, /api/ answers 401; the long-lived token
 *                                  Hermes held is recorded as expired
 *   mqtt           gh-media:1883 — up, MQTT CONNACK return code 5 (not
 *                                  authorized) for an anonymous CONNECT
 *
 * NOT registered:
 *   outline — no Outline instance exists on this fleet. Every candidate port
 *   was probed (3000 on gh-ai is the Buzz relay, on gh-arm it redirects to the
 *   Wazuh dashboard, on gh-nvidia it is Grafana) and nothing serves Outline.
 *   Its panel stays a labelled fixture, and the honest fix is to drop it from
 *   the world inventory rather than to invent an adapter for it.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import homeAssistant from "@/adapters/home-assistant";
import mqtt from "@/adapters/mqtt";
import nodeRed from "@/adapters/node-red";
import wyoming from "@/adapters/wyoming";
import stalwartMail from "@/adapters/stalwart-mail";
import roundcube from "@/adapters/roundcube";
import vikunja from "@/adapters/vikunja";
import telegram from "@/adapters/telegram";

/**
 * The env var that must be set for each adapter to be registered.
 *
 * Note what is gated on and what is not: home-assistant is gated on the URL,
 * not the token, and vikunja likewise. That is deliberate and matches the
 * registerRomm() precedent in adapter-runtime — a service that is deployed and
 * reachable should render `denied` (naming the credential to fix) rather than
 * a healthy-looking SAMPLE DATA panel. Gating on the credential would hide a
 * live service behind a fixture.
 */
const HOME_ADAPTERS: Array<[name: string, envVar: string, adapter: DataAdapter]> = [
  ["home-assistant", "HOME_ASSISTANT_URL", homeAssistant],
  ["mqtt", "MQTT_BROKER_URL", mqtt],
  ["node-red", "NODE_RED_URL", nodeRed],
  ["wyoming", "WYOMING_ENDPOINTS", wyoming],
  ["stalwart-mail", "STALWART_URL", stalwartMail],
  ["roundcube", "ROUNDCUBE_URL", roundcube],
  ["vikunja", "VIKUNJA_URL", vikunja],
  ["telegram", "TELEGRAM_BOT_TOKEN", telegram],
];

export function register(registry: Map<string, DataAdapter>): void {
  for (const [name, envVar, adapter] of HOME_ADAPTERS) {
    if (process.env[envVar]) registry.set(name, adapter);
  }
}
