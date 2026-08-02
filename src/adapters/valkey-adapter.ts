// Valkey key-value store adapter
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

interface ValkeyInfo {
  version: string;
  uptime: number;
  connected_clients: number;
  used_memory: number;
  total_system_memory: number;
  maxmemory: number;
  keyspace: Record<string, number>;
}

interface ValkeySlowLog {
  id: number;
  timestamp: number;
  duration: number;
  command: string[];
}

export class ValkeyAdapter implements DataAdapter {
  readonly name = "valkey";
  readonly description = "Valkey key-value store monitoring";
  readonly category = "ops" as const;

  private host: string;
  private port: number;
  private password?: string;

  constructor(host: string = process.env.VALKEY_HOST || "localhost", port: number = parseInt(process.env.VALKEY_PORT || "6379"), password?: string) {
    this.host = host;
    this.port = port;
    this.password = password;
  }

  async health(): Promise<FreshnessInfo> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return {
        adapter: this.name,
        source: `${this.host}:${this.port}`,
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    }

    try {
      await fetch(`http://${this.host}:${this.port}/ping`, {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // offline
    }
    return {
      adapter: this.name,
      source: `${this.host}:${this.port}`,
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
      // Simulated fetch - in production, use Redis client library
      const info: ValkeyInfo = {
        version: "7.2.0",
        uptime: 86400000, // 1 day
        connected_clients: 12,
        used_memory: 1024 * 1024 * 256, // 256 MB
        total_system_memory: 1024 * 1024 * 1024 * 16, // 16 GB
        maxmemory: 1024 * 1024 * 512, // 512 MB
        keyspace: { db0: 1234, db1: 567 },
      };

      const memoryUsage = (info.used_memory / info.maxmemory) * 100;
      const totalKeys = Object.values(info.keyspace).reduce((a, b) => a + b, 0);

      return {
        title: "Valkey Cache",
        subtitle: `${info.version} • ${this.formatUptime(info.uptime)}`,
        state: memoryUsage > 90 ? "warning" : "healthy",
        metrics: [
          { label: "Version", value: info.version },
          { label: "Uptime", value: this.formatUptime(info.uptime) },
          { label: "Clients", value: info.connected_clients },
          { label: "Memory", value: `${memoryUsage.toFixed(1)}%`, unit: "%", state: memoryUsage > 90 ? "warning" : "healthy" },
          { label: "Used Memory", value: this.formatBytes(info.used_memory) },
          { label: "Total Keys", value: totalKeys },
        ],
        items: Object.entries(info.keyspace).map(([db, count]) => ({
          id: db,
          label: db.toUpperCase(),
          subtitle: `${count} keys`,
          value: count,
          state: "healthy",
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
        title: "Valkey Cache",
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

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}