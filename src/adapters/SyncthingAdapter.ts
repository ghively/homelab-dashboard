import { BaseAdapter } from "./BaseAdapter";
import type { AdapterConfig } from "./types";

export interface SyncthingConfig extends AdapterConfig {
  host: string;
  apiKey: string;
}

export class SyncthingAdapter extends BaseAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: SyncthingConfig) {
    super("syncthing", config);
    this.baseUrl = `http://${config.host}:8384/rest`;
    this.apiKey = config.apiKey;
  }

  protected async fetchData(): Promise<unknown> {
    try {
      const headers = {
        "X-API-Key": this.apiKey,
      };

      const [statusResponse, connectionsResponse] = await Promise.all([
        fetch(`${this.baseUrl}/system/status`, { headers }),
        fetch(`${this.baseUrl}/system/connections`, { headers }),
      ]);

      if (!statusResponse.ok || !connectionsResponse.ok) {
        throw new Error(`Syncthing API failed: ${statusResponse.statusText}`);
      }

      const status = await statusResponse.json();
      const connections = await connectionsResponse.json();

      const folders: Array<{ id?: string; status?: string; [k: string]: unknown }> = [];
      const foldersResponse = await fetch(`${this.baseUrl}/config/folders`, { headers });
      if (foldersResponse.ok) {
        const folderConfig = await foldersResponse.json();
        for (const folder of folderConfig) {
          const folderStatus = await fetch(`${this.baseUrl}/db/status?folder=${folder.id}`, { headers });
          if (folderStatus.ok) {
            const statusData = await folderStatus.json();
            folders.push({
              id: folder.id,
              label: folder.label,
              path: folder.path,
              status: statusData.state,
              files: statusData.globalFiles,
              size: statusData.globalBytes,
              inSyncFiles: statusData.inSyncFiles,
              inSyncBytes: statusData.inSyncBytes,
              receiveOnlyChangedFiles: statusData.receiveOnlyChangedFiles,
            });
          }
        }
      }

      return {
        myId: status.myID,
        version: status.version,
        connections: connections.connections,
        total: connections.total,
        folders,
        healthy: this.checkHealth(connections, folders),
      };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  private checkHealth(
    connections: { connections?: Record<string, { connected?: boolean }> },
    folders: Array<{ status?: string; [k: string]: unknown }>,
  ): boolean {
    const connected = Object.values(connections.connections || {}).filter((c) => (c as { connected?: boolean }).connected).length;
    return connected > 0 && folders.every((f) => f.status === "idle");
  }
}