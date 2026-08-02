// UniFi controller adapter - clients and bandwidth statistics
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

interface UniFiClient {
  mac: string;
  ip: string;
  name: string;
  hostname: string;
  oui?: string;
  is_wired: boolean;
  is_guest: boolean;
  last_seen: number;
  uptime: number;
}

interface _UniFiNetworkStat {
  tx_bytes: number;
  rx_bytes: number;
  tx_bytes_r: number;
  rx_bytes_r: number;
  tx_packets: number;
  rx_packets: number;
  tx_packets_r: number;
  rx_packets_r: number;
}

export class UnifiAdapter implements DataAdapter {
  readonly name = "unifi";
  readonly description = "UniFi controller clients and bandwidth";
  readonly category = "network" as const;

  private baseUrl: string;
  private username: string;
  private password: string;
  private csrfToken: string | null = null;
  private cookieHeader: string | null = null;

  constructor(baseUrl: string = process.env.UNIFI_BASE_URL || "https://192.168.0.1", username: string = process.env.UNIFI_USERNAME || "admin", password: string = process.env.UNIFI_PASSWORD || "") {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  async health(): Promise<FreshnessInfo> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return {
        adapter: this.name,
        source: this.baseUrl,
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    }

    try {
      await this.login();
    } catch {
      // offline
    }
    return {
      adapter: this.name,
      source: this.baseUrl,
      queriedAt: new Date().toISOString(),
      stalenessSeconds: 0,
      cacheHit: false,
    };
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    const start = Date.now();
    try {
      await this.login();

      // Fetch clients and stats in parallel
      const [clientsResponse, statsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/proxy/network/api/s/default/stat/client`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`${this.baseUrl}/proxy/network/api/s/default/stat/health`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      const clientsData = await clientsResponse.json();
      const statsData = await statsResponse.json();

      const clients: UniFiClient[] = clientsData.data || [];
      const health = statsData.data?.[0] || {};

      const activeClients = clients.filter((c) => Date.now() / 1000 - c.last_seen < 300);
      const guestClients = activeClients.filter((c) => c.is_guest);
      const wiredClients = activeClients.filter((c) => c.is_wired);

      return {
        title: "UniFi Network",
        subtitle: "Controller clients and bandwidth",
        state: "healthy",
        metrics: [
          { label: "Active Clients", value: activeClients.length },
          { label: "Guest Clients", value: guestClients.length },
          { label: "Wired Clients", value: wiredClients.length },
          { label: "Total Clients", value: clients.length },
          { label: "LAN TX", value: this.formatBytes(health.tx_bytes || 0) },
          { label: "LAN RX", value: this.formatBytes(health.rx_bytes || 0) },
        ],
        items: activeClients.map((c) => ({
          id: c.mac,
          label: c.name || c.hostname || c.ip,
          subtitle: `${c.ip} • ${c.is_wired ? "Wired" : "Wireless"}${c.is_guest ? " • Guest" : ""}`,
          value: `${Math.floor((Date.now() / 1000 - c.last_seen) / 60)}m ago`,
          state: Date.now() / 1000 - c.last_seen < 60 ? "healthy" : "warning",
        })),
        source: "live",
        freshness: {
          adapter: this.name,
          source: this.name,
          queriedAt: new Date(start).toISOString(),
          stalenessSeconds: 0,
          cacheHit: false,
        },
      };
    } catch (error) {
      return {
        title: "UniFi Network",
        subtitle: "Failed to fetch data",
        state: "offline",
        metrics: [{ label: "Status", value: "ERROR", state: "offline" }],
        source: "live",
        freshness: {
          adapter: this.name,
          source: this.name,
          queriedAt: new Date(start).toISOString(),
          stalenessSeconds: 0,
          cacheHit: false,
        },
        summary: `Adapter error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  private async login(): Promise<void> {
    if (this.csrfToken) return;

    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`UniFi login failed: ${response.status}`);
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookieHeader = setCookie.split(";")[0];
    }

    // CSRF token is typically in a cookie or response body
    this.csrfToken = "authenticated";
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.cookieHeader) {
      headers["Cookie"] = this.cookieHeader;
    }

    return headers;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}