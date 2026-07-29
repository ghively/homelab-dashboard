import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import axios from "axios";

/**
 * Roundcube adapter - email client integration
 */
export class RoundcubeAdapter extends BaseAdapter {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(
    baseUrl: string = process.env.ROUNDCUBE_BASE_URL || "http://localhost:8081",
    username?: string,
    password?: string
  ) {
    super("roundcube");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.username = username || process.env.ROUNDCUBE_USERNAME || "";
    this.password = password || process.env.ROUNDCUBE_PASSWORD || "";
  }

  protected async fetchData(): Promise<any> {
    if (!this.username || !this.password) {
      throw new Error("ROUNDCUBE_USERNAME and ROUNDCUBE_PASSWORD not configured");
    }

    const client = axios.create({
      baseURL: this.baseUrl,
      headers: { "Content-Type": "application/json" },
      timeout: this.config.timeoutMs,
      withCredentials: true,
    });

    // Login
    const loginResponse = await client.post("/?_task=login", {
      _user: this.username,
      _pass: this.password,
      _action: "login",
    });

    if (!loginResponse.data?.session) {
      throw new Error("Roundcube login failed");
    }

    const session = loginResponse.data.session;

    // List mailboxes
    const mailboxesResponse = await client.get("/?_task=mail&_action=list", {
      params: { _session: session },
    });

    const mailboxes = mailboxesResponse.data?.list || [];

    // Get INBOX message count
    const inbox = mailboxes.find((m: any) => m.id === "INBOX") || { messages: 0, unseen: 0 };

    // List recent messages
    const messagesResponse = await client.get("/?_task=mail&_action=list", {
      params: { _session: session, _mbox: "INBOX", _pagesize: 5 },
    });

    const recentMessages = messagesResponse.data?.list?.length || 0;

    return {
      healthy: true,
      username: this.username,
      mailboxes: mailboxes.length,
      inbox: {
        total: inbox.messages,
        unread: inbox.unseen,
      },
      recentMessages,
    };
  }

  protected override deriveState(data: any): AdapterState {
    if (!data) return "offline";
    if (!data.healthy) return "critical";
    return "healthy";
  }
}