// IoT VLAN adapter - IoT network monitoring
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

interface IoTDevice {
  ip: string;
  mac: string;
  hostname: string;
  vendor?: string;
  lastSeen: string;
  vlan: number;
}

interface IoTNetworkStats {
  totalDevices: number;
  activeDevices: number;
  vlanId: number;
  bandwidth: {
    tx: number;
    rx: number;
  };
}

export class IoTVLANAdapter implements DataAdapter {
  readonly name = "iot-vlan";
  readonly description = "IoT VLAN network monitoring";
  readonly category = "home" as const;

  private vlans: number[] = [30]; // Default IoT VLAN IDs
  private devices: IoTDevice[] = [];

  constructor(vlans?: number[]) {
    if (vlans && vlans.length > 0) {
      this.vlans = vlans;
    }
  }

  async health(): Promise<FreshnessInfo> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return {
        adapter: this.name,
        source: "iot-vlan",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: 0,
        cacheHit: false,
      };
    }

    try {
      await this.scanVLANs();
    } catch {
      // offline
    }
    return {
      adapter: this.name,
      source: "iot-vlan",
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
      await this.scanVLANs();

      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const activeDevices = this.devices.filter((d) => new Date(d.lastSeen) > fiveMinAgo);

      const stats: IoTNetworkStats = {
        totalDevices: this.devices.length,
        activeDevices: activeDevices.length,
        vlanId: this.vlans[0],
        bandwidth: {
          tx: this.calculateBandwidth(activeDevices, "tx"),
          rx: this.calculateBandwidth(activeDevices, "rx"),
        },
      };

      return {
        title: "IoT Network",
        subtitle: `VLAN ${this.vlans.join(", ")} - ${stats.totalDevices} devices`,
        state: stats.activeDevices > 0 ? "healthy" : "empty",
        metrics: [
          { label: "Total Devices", value: stats.totalDevices },
          { label: "Active", value: stats.activeDevices },
          { label: "VLAN", value: stats.vlanId },
          { label: "Bandwidth TX", value: this.formatBytes(stats.bandwidth.tx) },
          { label: "Bandwidth RX", value: this.formatBytes(stats.bandwidth.rx) },
        ],
        items: activeDevices.map((d) => ({
          id: d.mac,
          label: d.hostname || d.ip,
          subtitle: `${d.ip} • ${d.vendor || "Unknown"}`,
          value: d.vlan,
          state: new Date(d.lastSeen) > fiveMinAgo ? "healthy" : "warning",
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
        title: "IoT Network",
        subtitle: "Failed to scan VLAN",
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

  private async scanVLANs(): Promise<void> {
    // For a real implementation, this would query the network infrastructure
    // (router, switch, or UniFi controller) to discover IoT devices on the specified VLANs

    // Simulated devices for demonstration - in production, fetch from network sources
    this.devices = [
      {
        ip: "192.168.30.10",
        mac: "00:11:22:33:44:55",
        hostname: "smart-thermostat",
        vendor: "Nest",
        lastSeen: new Date().toISOString(),
        vlan: 30,
      },
      {
        ip: "192.168.30.11",
        mac: "00:11:22:33:44:56",
        hostname: "smart-doorbell",
        vendor: "Ring",
        lastSeen: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        vlan: 30,
      },
      {
        ip: "192.168.30.12",
        mac: "00:11:22:33:44:57",
        hostname: "smart-lock",
        vendor: "August",
        lastSeen: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        vlan: 30,
      },
    ];
  }

  private calculateBandwidth(devices: IoTDevice[], direction: "tx" | "rx"): number {
    // Simulated bandwidth calculation - in production, fetch from network monitoring
    const perDeviceAvg = 1024 * 100; // 100 KB/s per device
    return devices.length * perDeviceAvg;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}