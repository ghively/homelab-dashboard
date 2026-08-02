// Roundcube adapter — webmail availability.
//
// WHAT THIS PANEL DELIBERATELY DOES NOT SHOW
// ------------------------------------------
// Mailbox counts, unread counts and message lists. Roundcube has no read API.
// The previous version of this file POSTed to `/?_task=login` expecting JSON
// and then read `mailboxes`, `inbox.total` and `inbox.unseen` out of the
// response — but Roundcube answers that URL with an HTML page and a CSRF
// challenge, so those numbers could only ever have been the `|| 0` defaults
// sitting behind them. Unread counts belong to the IMAP server; if they are
// wanted on the dashboard they should come from Stalwart over IMAP, not from
// its web frontend.
//
// WHAT IT DOES SHOW
// -----------------
// What one unauthenticated GET of the login page genuinely establishes:
//   • the HTTP status and how long the page took to render
//   • the web server and PHP version from the response headers
//   • whether a session cookie was issued (PHP session handling is working)
//   • whether the login form was actually rendered, and under which skin
// That answers "can I get to my mail?", which is the question a webmail tile
// is really being asked.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import { failureResult, fetchWithTimeout, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const URL_ENV = "ROUNDCUBE_URL";

/** Roundcube renders these input names on its login form. */
const LOGIN_FIELDS = ['name="_user"', 'name="_pass"'];

function detectSkin(html: string): string | null {
  const m = html.match(/skins\/([a-z0-9_-]+)\//i);
  return m ? m[1] : null;
}

export class RoundcubeAdapter implements DataAdapter {
  readonly name = "roundcube";
  readonly description = "Roundcube — webmail frontend availability.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[URL_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const configured = process.env[URL_ENV];
    if (!configured) return notConfiguredResult(this.name, "Roundcube", URL_ENV);

    const base = configured.replace(/\/$/, "");
    const start = Date.now();

    try {
      const res = await fetchWithTimeout(`${base}/`);
      const elapsedMs = Date.now() - start;
      const html = await res.text();

      const server = res.headers.get("server");
      const php = res.headers.get("x-powered-by");
      const sessionIssued = (res.headers.get("set-cookie") ?? "").includes("roundcube_sessid");
      const loginForm = LOGIN_FIELDS.every((f) => html.includes(f));
      const skin = detectSkin(html);

      const metrics: Metric[] = [
        {
          label: "HTTP",
          value: res.status,
          state: res.ok ? "healthy" : res.status >= 500 ? "critical" : "warning",
        },
        {
          label: "Login Form",
          value: loginForm ? "rendered" : "not found",
          state: loginForm ? "healthy" : "warning",
        },
        {
          label: "Session",
          value: sessionIssued ? "cookie issued" : "no cookie",
          state: sessionIssued ? "healthy" : "warning",
        },
        { label: "Response", value: elapsedMs, unit: "ms" },
        ...(skin ? [{ label: "Skin", value: skin }] : []),
        ...(server ? [{ label: "Web Server", value: server }] : []),
        ...(php ? [{ label: "Runtime", value: php }] : []),
        { label: "Endpoint", value: base },
      ];

      // The login page rendering with a live session is the whole assertion.
      const state: VisualQueryResult["state"] =
        !res.ok ? (res.status >= 500 ? "critical" : "warning") : loginForm && sessionIssued ? "healthy" : "warning";

      return {
        title: "Roundcube — Webmail",
        subtitle: loginForm
          ? `Login page served in ${elapsedMs}ms${skin ? ` • ${skin} skin` : ""}`
          : `HTTP ${res.status} — login form not rendered`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        summary:
          `Roundcube at ${base} returned HTTP ${res.status} in ${elapsedMs}ms` +
          `${loginForm ? " with a rendered login form" : " without a login form"}` +
          `${sessionIssued ? " and a fresh session cookie" : ""}. ` +
          `Roundcube exposes no read API, so mailbox and unread counts are not available ` +
          `from this panel — they would have to come from the IMAP server directly.`,
      };
    } catch (err) {
      return failureResult(this.name, "Roundcube", base, err, start);
    }
  }
}

const adapter = new RoundcubeAdapter();
export { adapter as default };
