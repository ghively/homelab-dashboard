import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface SMBNFSConfig extends AdapterConfig {
  host: string;
  sshKey?: string;
  mountPoints?: string[];
}

export class SMBNFSAdapter extends BaseAdapter {
  private host: string;
  private sshKey?: string;
  private mountPoints: string[];

  constructor(config: SMBNFSConfig) {
    super("smbnfs", config);
    this.host = config.host;
    this.sshKey = config.sshKey;
    this.mountPoints = config.mountPoints || ["/mnt", "/media"];
  }

  protected async fetchData(): Promise<unknown> {
    try {
      // A lazy require keeps the node-only child_process out of any bundle that
      // merely imports this module; a top-level import would break client builds.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { exec } = require("child_process");
      const sshBase = this.sshKey
        ? `ssh -i ${this.sshKey} -o StrictHostKeyChecking=no ${this.host}`
        : `ssh -o StrictHostKeyChecking=no ${this.host}`;

      const mountData: { mounts: Array<Record<string, unknown>>; [k: string]: unknown } = {
        mounts: [],
        healthy: true,
      };

      for (const mount of this.mountPoints) {
        try {
          const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            exec(`${sshBase} "df -h ${mount}"`, (error: Error | null, stdout: string, stderr: string) => {
              if (error) reject(error);
              else resolve({ stdout, stderr });
            });
          });

          const lines = stdout.split("\n").slice(1);
          const mountItems = lines.map((line: string) => {
            const parts = line.trim().split(/\s+/);
            return {
              filesystem: parts[0],
              size: parts[1],
              used: parts[2],
              available: parts[3],
              usePercent: parts[4],
              mountPoint: parts[5],
            };
          }).filter(Boolean);

          mountData.mounts.push(...mountItems);
        } catch (err) {
          mountData.mounts.push({
            mountPoint: mount,
            error: (err as Error).message,
            state: "offline",
          });
          mountData.healthy = false;
        }
      }

      if (mountData.mounts.length === 0) {
        mountData.warning = "No mounts found";
        mountData.healthy = false;
      }

      return mountData;
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }
}