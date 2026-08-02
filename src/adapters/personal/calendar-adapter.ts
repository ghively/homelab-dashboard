// Calendar adapter — CalDAV collections on the mail server.
//
// There is no separate calendar service on this fleet. Stalwart serves CalDAV:
// /.well-known/caldav redirects to /dav/cal, and that path answers 401 to an
// unauthenticated request — so a calendar genuinely exists, and the only thing
// standing between this panel and real data is a credential.
//
// That makes the no-credential case `denied`, not `empty` and certainly not a
// fixture: the request is really made, the real status code is reported, and
// the summary names the two variables that would fix it.
//
// SCOPE
// -----
// With credentials this lists calendar collections (PROPFIND Depth: 1) — their
// names, and how many there are. It does NOT list upcoming events: that needs
// a calendar-query REPORT, and shipping an event parser that has never been
// run against a live authenticated response is how invented numbers get onto a
// dashboard. Events are a follow-up once credentials exist to test against.

import type { DataAdapter } from "../adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "../types";
import { getFixtureState } from "../registry";
import { getFixtureForState } from "../fixtures";
import { failureResult, fetchWithTimeout, makeFreshness, notConfiguredResult } from "@/lib/adapter-http";

const URL_ENV = "CALDAV_URL";
const USER_ENV = "CALDAV_USERNAME";
const PASS_ENV = "CALDAV_PASSWORD";

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
  </D:prop>
</D:propfind>`;

interface Collection {
  href: string;
  displayName: string | null;
  isCalendar: boolean;
}

/**
 * Pull `<response>` blocks out of a WebDAV multistatus body.
 *
 * Deliberately tolerant of namespace prefixes (D:, d:, none) and deliberately
 * conservative: anything it cannot parse is simply not reported, so a shape
 * this parser has not seen produces a smaller list, never a wrong one.
 */
function parseMultistatus(xml: string): Collection[] {
  const out: Collection[] = [];
  const responseRe = /<[a-z0-9]*:?response[^>]*>([\s\S]*?)<\/[a-z0-9]*:?response>/gi;

  for (const m of xml.matchAll(responseRe)) {
    const block = m[1];
    const href = block.match(/<[a-z0-9]*:?href[^>]*>([\s\S]*?)<\/[a-z0-9]*:?href>/i)?.[1]?.trim();
    if (!href) continue;
    const displayName =
      block.match(/<[a-z0-9]*:?displayname[^>]*>([\s\S]*?)<\/[a-z0-9]*:?displayname>/i)?.[1]?.trim() ||
      null;
    const resourcetype =
      block.match(/<[a-z0-9]*:?resourcetype[^>]*>([\s\S]*?)<\/[a-z0-9]*:?resourcetype>/i)?.[1] ?? "";
    out.push({
      href,
      displayName,
      isCalendar: /<[a-z0-9]*:?calendar[\s/>]/i.test(resourcetype),
    });
  }
  return out;
}

export class CalendarAdapter implements DataAdapter {
  readonly name = "calendar";
  readonly description = "CalDAV — calendar collections on the mail server.";
  readonly category = "personal" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[URL_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const configured = process.env[URL_ENV];
    if (!configured) return notConfiguredResult(this.name, "Calendar", URL_ENV);

    const base = configured.replace(/\/$/, "");
    const user = process.env[USER_ENV];
    const pass = process.env[PASS_ENV];
    const start = Date.now();

    const headers: Record<string, string> = {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    };
    if (user && pass) {
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
    }

    try {
      const res = await fetchWithTimeout(base, {
        method: "PROPFIND",
        headers,
        body: PROPFIND_BODY,
      });

      if (res.status === 401 || res.status === 403) {
        return {
          title: "Calendar — CalDAV",
          subtitle: `CalDAV is live at ${base} but rejected the request (HTTP ${res.status})`,
          state: "denied",
          freshness: makeFreshness(this.name, base, start),
          metrics: [
            {
              label: "Status",
              value: user && pass ? "CREDENTIALS REJECTED" : "NEEDS CREDENTIALS",
              state: "denied",
            },
            { label: "Response", value: `HTTP ${res.status}` },
            { label: "Endpoint", value: base },
          ],
          summary:
            `The CalDAV endpoint at ${base} answered PROPFIND with HTTP ${res.status}. ` +
            (user && pass
              ? `The configured ${USER_ENV} was rejected — check the credential.`
              : `Set ${USER_ENV} and ${PASS_ENV} to read calendar collections.`),
        };
      }

      if (!res.ok && res.status !== 207) {
        return {
          title: "Calendar — CalDAV",
          subtitle: `PROPFIND returned HTTP ${res.status}`,
          state: res.status >= 500 ? "critical" : "warning",
          freshness: makeFreshness(this.name, base, start),
          metrics: [
            { label: "Status", value: `HTTP ${res.status}`, state: "warning" },
            { label: "Endpoint", value: base },
          ],
          summary: `CalDAV PROPFIND on ${base} returned HTTP ${res.status}.`,
        };
      }

      const xml = await res.text();
      const all = parseMultistatus(xml);
      const calendars = all.filter((c) => c.isCalendar);

      const metrics: Metric[] = [
        { label: "Calendars", value: calendars.length, state: calendars.length ? "healthy" : "empty" },
        { label: "DAV Responses", value: all.length },
        { label: "Endpoint", value: base },
        { label: "Account", value: user ?? "anonymous" },
      ];

      const items: Item[] = calendars.map((c) => ({
        id: `calendar:${c.href}`,
        label: c.displayName ?? c.href.replace(/\/$/, "").split("/").pop() ?? c.href,
        subtitle: c.href,
        state: "healthy" as const,
        group: "calendars",
      }));

      return {
        title: "Calendar — CalDAV",
        subtitle:
          calendars.length === 0
            ? `Connected to ${base} — no calendar collections found`
            : `${calendars.length} calendar${calendars.length === 1 ? "" : "s"} on ${base}`,
        state: calendars.length === 0 ? "empty" : "healthy",
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary:
          `PROPFIND Depth:1 on ${base} returned ${all.length} DAV responses, ` +
          `${calendars.length} of which are calendar collections` +
          (calendars.length ? `: ${calendars.map((c) => c.displayName ?? c.href).join(", ")}. ` : ". ") +
          `Upcoming events are not read by this panel — that requires a calendar-query REPORT.`,
      };
    } catch (err) {
      return failureResult(this.name, "Calendar — CalDAV", base, err, start);
    }
  }
}

const adapter = new CalendarAdapter();
export { adapter as default };
