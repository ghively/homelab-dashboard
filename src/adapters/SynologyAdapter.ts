import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface SynologyConfig extends AdapterConfig {
  host: string;
  username: string;
  password: string;
}

interface DSMResponse {
  data: any;
  success: boolean;
}

interface VolumeInfo {
  path: string;
  status: string;
  volume_type: string;
  total_space: number;
  free_space: number;
}

interface DiskInfo {
  id: string;
  name: string;
  status: string;
  temp: number;
  smart_health: string;
}

export class SynologyAdapter extends BaseAdapter {
  private baseUrl: string;
  private sid: string | null = null;

  constructor(config: SynologyConfig) {
    super("synology", config);
    this.baseUrl = `http://${config.host}:5000/webapi`;
  }

  protected async fetchData(): Promise<any> {
    try {
      await this.login();

      const [volumes, disks, smart] = await Promise.all([
        this.getVolumes(),
        this.getDisks(),
        this.getSMARTInfo(),
      ]);

      return {
        volumes,
        disks,
        smart,
        healthy: this.checkHealth(volumes, disks),
      };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    } finally {
      if (this.sid) await this.logout();
    }
  }

  private async request(api: string, method: string, params: any = {}): Promise<DSMResponse> {
    const formData = new URLSearchParams();
    formData.append("api", api);
    formData.append("method", method);
    formData.append("version", "1");
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, String(value));
    });

    const response = await fetch(`${this.baseUrl}/entry.cgi`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    return response.json();
  }

  private async login(): Promise<void> {
    const { username, password } = this.config as any;
    const result = await this.request("SYNO.API.Auth", "Login", {
      account: username,
      passwd: password,
      session: "DSM",
      format: "cookie",
    });

    if (!result.success) throw new Error("DSM login failed");
    this.sid = "DSM";
  }

  private async logout(): Promise<void> {
    if (!this.sid) return;
    await this.request("SYNO.API.Auth", "Logout", { session: this.sid });
    this.sid = null;
  }

  private async getVolumes(): Promise<VolumeInfo[]> {
    const result = await this.request("SYNO.Storage.Volume", "list", { session: this.sid });
    return result.data?.volumes || [];
  }

  private async getDisks(): Promise<DiskInfo[]> {
    const result = await this.request("SYNO.Storage.Disk", "list", { session: this.sid });
    return result.data?.disks || [];
  }

  private async getSMARTInfo(): Promise<Record<string, any>> {
    const disks = await this.getDisks();
    const smart: Record<string, any> = {};

    for (const disk of disks) {
      try {
        const result = await this.request("SYNO.Storage.Disk.SMART", "get", {
          disk_id: disk.id,
          session: this.sid,
        });
        smart[disk.id] = result.data?.smart_info || {};
      } catch {
        smart[disk.id] = { error: "SMART info unavailable" };
      }
    }

    return smart;
  }

  private checkHealth(volumes: VolumeInfo[], disks: DiskInfo[]): boolean {
    const volumesHealthy = volumes.every((v) => v.status === "normal");
    const disksHealthy = disks.every((d) => d.status === "normal" && d.smart_health === "good");
    return volumesHealthy && disksHealthy;
  }
}