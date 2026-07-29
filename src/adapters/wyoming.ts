import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import { WebSocket } from "ws";

/**
 * Wyoming voice adapter - voice assistant integration (x4 instances)
 */
export class WyomingAdapter extends BaseAdapter {
  private hosts: Array<{ host: string; port: number; protocol: "ws" | "wss" }>;
  private clients: Map<number, WebSocket> = new Map();
  private connectedServices = new Map<number, string[]>();
  private readonly instanceCount: number;

  constructor(
    instances?: Array<{ host: string; port: number; protocol?: "ws" | "wss" }>
  ) {
    super("wyoming");

    // Default: 4 Wyoming instances on localhost
    this.hosts = (instances || [
      { host: "localhost", port: 10200, protocol: "ws" },
      { host: "localhost", port: 10201, protocol: "ws" },
      { host: "localhost", port: 10202, protocol: "ws" },
      { host: "localhost", port: 10203, protocol: "ws" },
    ]).map(i => ({
      host: i.host,
      port: i.port,
      protocol: i.protocol || "ws" as "ws" | "wss",
    }));

    this.instanceCount = this.hosts.length;
  }

  protected async fetchData(): Promise<any> {
    const results: Array<{
      id: number;
      host: string;
      port: number;
      connected: boolean;
      services: string[];
    }> = [];

    for (let i = 0; i < this.hosts.length; i++) {
      const { host, port, protocol } = this.hosts[i];
      let connected = false;
      let services: string[] = [];

      try {
        if (!this.clients.has(i)) {
          const url = `${protocol}://${host}:${port}`;
          const ws = new WebSocket(url);

          await new Promise<void>((resolve, reject) => {
            ws.once("open", () => {
              this.clients.set(i, ws);
              resolve();
            });
            ws.once("error", () => reject(new Error("Connection failed")));
            setTimeout(() => reject(new Error("Timeout")), this.config.timeoutMs);
          });

          // Send hello to discover services
          ws.send(JSON.stringify({ type: "hello", version: "1.0.0" }));
        }

        connected = this.clients.get(i)!.readyState === WebSocket.OPEN;
        services = this.connectedServices.get(i) || [];
      } catch (err) {
        connected = false;
      }

      results.push({ id: i + 1, host, port, connected, services });
    }

    const connectedCount = results.filter((r) => r.connected).length;

    return {
      healthy: connectedCount > 0,
      totalInstances: this.hosts.length,
      connectedInstances: connectedCount,
      instances: results,
    };
  }

  protected override deriveState(data: any): AdapterState {
    if (!data) return "offline";
    if (!data.healthy) return "critical";
    if (data.connectedInstances === 0) return "critical";
    if (data.connectedInstances < data.totalInstances) return "warning";
    return "healthy";
  }

  async disconnect(): Promise<void> {
    Array.from(this.clients.entries()).forEach(([id, ws]) => {
      ws.close();
      this.clients.delete(id);
      this.connectedServices.delete(id);
    });
  }
}