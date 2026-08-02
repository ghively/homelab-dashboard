import { BaseAdapter } from "./BaseAdapter";
import type { AdapterState } from "./types";
import axios from "axios";

/**
 * Telegram Bot adapter - messaging and bot integration
 */
export class TelegramAdapter extends BaseAdapter {
  private botToken: string;
  private pollingActive = false;
  private updateCount = 0;

  constructor(
    botToken: string = process.env.TELEGRAM_BOT_TOKEN || ""
  ) {
    super("telegram");
    this.botToken = botToken;
  }

  protected async fetchData(): Promise<unknown> {
    if (!this.botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN not configured");
    }

    const client = axios.create({
      baseURL: `https://api.telegram.org/bot${this.botToken}`,
      headers: { "Content-Type": "application/json" },
      timeout: this.config.timeoutMs,
    });

    // Get bot info
    const meResponse = await client.get("/getMe");
    const bot = meResponse.data?.result;

    if (!bot) {
      throw new Error("Failed to get bot info - invalid token?");
    }

    // Get webhook info
    const webhookResponse = await client.get("/getWebhookInfo");
    const webhook = webhookResponse.data?.result;

    // Fetch recent updates (manual poll)
    const updatesResponse = await client.get("/getUpdates", {
      params: { limit: 5, timeout: 0 },
    });
    const recentUpdates = updatesResponse.data?.result?.length || 0;

    return {
      healthy: true,
      bot: {
        id: bot.id,
        firstName: bot.first_name,
        username: bot.username,
        isBot: bot.is_bot,
      },
      webhook: {
        url: webhook?.url || null,
        hasCustomCertificate: webhook?.has_custom_certificate || false,
        pendingUpdateCount: webhook?.pending_update_count || 0,
      },
      polling: {
        active: this.pollingActive,
        updateCount: this.updateCount,
      },
      recentUpdates,
    };
  }

  protected override deriveState(data: unknown): AdapterState {
    const d = (data ?? {}) as { healthy?: unknown; webhook?: { pendingUpdateCount?: number } };
    if (!data) return "offline";
    if (!d.healthy) return "critical";
    if ((d.webhook?.pendingUpdateCount ?? 0) > 100) return "warning";
    return "healthy";
  }

  /**
   * Start long polling for updates
   */
  async startPolling(onUpdate?: (update: unknown) => void): Promise<void> {
    if (this.pollingActive) {
      return;
    }

    const client = axios.create({
      baseURL: `https://api.telegram.org/bot${this.botToken}`,
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    let offset = 0;

    this.pollingActive = true;

    const poll = async () => {
      if (!this.pollingActive) return;

      try {
        const response = await client.get("/getUpdates", {
          params: { offset, timeout: 30 },
        });

        const updates = response.data?.result || [];

        for (const update of updates) {
          this.updateCount++;
          offset = update.update_id + 1;

          if (onUpdate) {
            onUpdate(update);
          }
        }
      } catch {
        // Silently retry on error
      }

      // Continue polling
      setTimeout(poll, 1000);
    };

    poll();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    this.pollingActive = false;
  }

  /**
   * Send a text message
   */
  async sendMessage(chatId: number | string, text: string): Promise<unknown> {
    const client = axios.create({
      baseURL: `https://api.telegram.org/bot${this.botToken}`,
      headers: { "Content-Type": "application/json" },
      timeout: this.config.timeoutMs,
    });

    const response = await client.post("/sendMessage", {
      chat_id: chatId,
      text,
    });

    return response.data?.result;
  }
}