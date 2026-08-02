import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import axios from "axios";

/**
 * Stalwart Mail adapter - queue management and delivery monitoring
 */
export class StalwartMailAdapter extends BaseAdapter {
  private baseUrl: string;
  private adminToken: string;

  constructor(
    baseUrl: string = process.env.STALWART_BASE_URL || "http://localhost:8080",
    adminToken: string = process.env.STALWART_ADMIN_TOKEN || ""
  ) {
    super("stalwart-mail");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.adminToken = adminToken;
  }

  protected async fetchData(): Promise<unknown> {
    if (!this.adminToken) {
      throw new Error("STALWART_ADMIN_TOKEN not configured");
    }

    const client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
        "Content-Type": "application/json",
      },
      timeout: this.config.timeoutMs,
    });

    // Health check
    const healthResponse = await client.get("/health");
    const healthy = healthResponse.data?.status === "ok";

    // Queue stats
    const queueStats = await client.get("/queue/stats").catch(() => ({ data: {} }));

    // Delivery reports (recent)
    const reports = await client
      .get("/reports", { params: { limit: 10 } })
      .catch(() => ({ data: { reports: [] } }));

    return {
      healthy,
      status: healthResponse.data?.status || "unknown",
      queue: {
        total: queueStats.data?.total || 0,
        queued: queueStats.data?.queued || 0,
        active: queueStats.data?.active || 0,
        deferred: queueStats.data?.deferred || 0,
        failed: queueStats.data?.failed || 0,
      },
      recentReports: reports.data?.reports?.length || 0,
    };
  }

  protected override deriveState(data: unknown): AdapterState {
    const d = (data ?? {}) as { healthy?: unknown; queue?: { failed?: number } };
    if (!data) return "offline";
    if (!d.healthy) return "critical";
    if ((d.queue?.failed ?? 0) > 10) return "critical";
    if ((d.queue?.failed ?? 0) > 0) return "warning";
    return "healthy";
  }
}