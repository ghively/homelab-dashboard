// Storage & ops adapters — Phase 8.
// Synology DSM, SMB/NFS, Syncthing, Caddy, Spoolman, Watchtower x3.

import type { DataAdapter } from "../adapter-base";

import synologyDsm from "./synology-dsm-adapter";
import smbNfs from "./smb-nfs-adapter";
import syncthing from "./syncthing-adapter";
import caddy from "./caddy-adapter";
import spoolman from "./spoolman-adapter";
import watchtowerVps from "./watchtower-vps-adapter";
import watchtowerMedia from "./watchtower-media-adapter";
import watchtowerStorage from "./watchtower-storage-adapter";

export const storageAdapters: Record<string, DataAdapter> = {
  "synology-dsm": synologyDsm,
  "smb-nfs": smbNfs,
  "syncthing": syncthing,
  "caddy": caddy,
  "spoolman": spoolman,
  "watchtower-vps": watchtowerVps,
  "watchtower-media": watchtowerMedia,
  "watchtower-storage": watchtowerStorage,
};

export function getStorageAdapter(name: string): DataAdapter | undefined {
  return storageAdapters[name];
}

export function listStorageAdapters(): Array<{ name: string; description: string }> {
  return Object.values(storageAdapters).map((a) => ({
    name: a.name,
    description: a.description,
  }));
}

export {
  default as synologyDsmAdapter,
} from "./synology-dsm-adapter";

export {
  default as smbNfsAdapter,
} from "./smb-nfs-adapter";

export {
  default as syncthingAdapter,
} from "./syncthing-adapter";

export {
  default as caddyAdapter,
} from "./caddy-adapter";

export {
  default as spoolmanAdapter,
} from "./spoolman-adapter";

export {
  default as watchtowerVpsAdapter,
} from "./watchtower-vps-adapter";

export {
  default as watchtowerMediaAdapter,
} from "./watchtower-media-adapter";

export {
  default as watchtowerStorageAdapter,
} from "./watchtower-storage-adapter";
