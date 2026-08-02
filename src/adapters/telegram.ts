// Telegram adapter — bot identity, delivery mode and update backlog.
//
// Everything here comes from the Telegram Bot API for the configured token:
//   GET /getMe           → bot identity and the permissions it was granted
//   GET /getWebhookInfo  → webhook vs long-poll, backlog, last delivery error
//
// WHY getUpdates IS NOT CALLED
// ----------------------------
// The previous version fetched /getUpdates on every query. That is not a
// read-only call: Telegram allows exactly one getUpdates consumer per token,
// and issuing a second one returns 409 Conflict *and* disrupts whichever
// process is legitimately polling — on this host, the Hermes gateway bot. It
// also confirms updates, so a dashboard refresh could silently consume a
// message the real bot had not processed yet. getWebhookInfo reports the same
// backlog (`pending_update_count`) without touching the queue, so that is what
// this panel reads.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  AdapterHttpError,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const TOKEN_ENV = "TELEGRAM_BOT_TOKEN";

/** Backlog above this means the consumer has probably stopped consuming. */
const BACKLOG_WARN = 25;

interface TelegramUser {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

interface WebhookInfo {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

interface TgEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export class TelegramAdapter implements DataAdapter {
  readonly name = "telegram";
  readonly description = "Telegram bot — identity, delivery mode and update backlog.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[TOKEN_ENV] ? "api.telegram.org" : "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const token = process.env[TOKEN_ENV];
    if (!token) return notConfiguredResult(this.name, "Telegram", TOKEN_ENV);

    // Never put the token in `source` — it appears in freshness metadata and
    // in the failure panel's Endpoint metric.
    const source = "api.telegram.org";
    const api = `https://api.telegram.org/bot${token}`;
    const start = Date.now();

    try {
      const me = await fetchJson<TgEnvelope<TelegramUser>>(`${api}/getMe`);
      if (!me.ok || !me.result) {
        // A well-formed rejection (ok:false) is a credential problem, and
        // Telegram answers it with 401 — but be explicit rather than relying
        // on the status alone.
        throw new AdapterHttpError(source, 401, me.description ?? "getMe returned ok:false");
      }
      const bot = me.result;

      const hook = await fetchJson<TgEnvelope<WebhookInfo>>(
        `${api}/getWebhookInfo`,
        {},
        ADAPTER_FANOUT_TIMEOUT_MS,
      ).catch(() => null);
      const webhook = hook?.result;

      const usingWebhook = Boolean(webhook?.url);
      const backlog = webhook?.pending_update_count ?? 0;
      const lastError = webhook?.last_error_message;
      const lastErrorAt = webhook?.last_error_date
        ? new Date(webhook.last_error_date * 1000).toISOString()
        : null;

      const metrics: Metric[] = [
        { label: "Bot", value: bot.username ? `@${bot.username}` : (bot.first_name ?? "unknown") },
        { label: "Bot ID", value: bot.id ?? "unknown" },
        { label: "Delivery", value: usingWebhook ? "webhook" : "long polling" },
        ...(usingWebhook && webhook?.url ? [{ label: "Webhook", value: webhook.url }] : []),
        {
          label: "Pending Updates",
          value: backlog,
          state: backlog > BACKLOG_WARN ? "warning" : "healthy",
        },
        {
          label: "Last Error",
          value: lastError ?? "none",
          state: lastError ? "warning" : "healthy",
        },
        { label: "Group Messages", value: bot.can_read_all_group_messages ? "readable" : "privacy mode" },
        { label: "Inline Queries", value: bot.supports_inline_queries ? "enabled" : "disabled" },
      ];

      const state: VisualQueryResult["state"] =
        lastError || backlog > BACKLOG_WARN ? "warning" : "healthy";

      return {
        title: "Telegram — Bot",
        subtitle: `@${bot.username ?? "?"} • ${usingWebhook ? "webhook" : "long polling"} • ${backlog} pending`,
        state,
        freshness: makeFreshness(this.name, source, start),
        metrics,
        ...(lastError && lastErrorAt
          ? {
              events: [
                {
                  id: "telegram:last-error",
                  at: lastErrorAt,
                  title: "Last delivery error",
                  detail: lastError,
                  state: "warning" as const,
                },
              ],
            }
          : {}),
        summary:
          `Telegram bot @${bot.username ?? "?"} (id ${bot.id ?? "?"}) is authenticated. ` +
          `Delivery is via ${usingWebhook ? `webhook ${webhook?.url}` : "long polling"}, ` +
          `${backlog} update(s) pending${lastError ? `, last error: ${lastError}` : ", no delivery errors"}. ` +
          `This panel does not call getUpdates, which would conflict with the bot's own poller.`,
      };
    } catch (err) {
      return failureResult(this.name, "Telegram", source, err, start);
    }
  }
}

const adapter = new TelegramAdapter();
export { adapter as default };
