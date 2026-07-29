// Garage S3 object storage adapter
import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, VisualQueryResult } from "./types";
import { getFixtureForState } from "./fixtures";
import { getFixtureState } from "./registry";

type HealthCheck = FreshnessInfo;

interface GarageBucket {
  id: string;
  name: string;
  size: number;
  objects: number;
  quotas?: {
    maxSize: number;
    maxObjects: number;
  };
}

interface GarageClusterInfo {
  layoutVersion: number;
  nodeCount: number;
  healthyNodes: number;
  storageCapacity: number;
  storageUsed: number;
}

class GarageS3Adapter implements DataAdapter {
  readonly name = "garage-s3";
  readonly description = "Garage distributed S3-compatible object storage";
  readonly category = "ops" as const;

  private endpoint: string;
  private accessKey: string;
  private secretKey: string;

  constructor(endpoint: string = process.env.GARAGE_ENDPOINT || "http://localhost:3900", accessKey: string = process.env.GARAGE_ACCESS_KEY || "", secretKey: string = process.env.GARAGE_SECRET_KEY || "") {
    this.endpoint = endpoint;
    this.accessKey = accessKey;
    this.secretKey = secretKey;
  }

  async health(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Try to list buckets to verify connectivity
      const response = await fetch(`${this.endpoint}/`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      return {
        adapter: this.name,
        source: "garage-api",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: Math.floor((Date.now() - start) / 1000),
        cacheHit: false,
      };
    } catch (error) {
      return {
        adapter: this.name,
        source: "garage-api",
        queriedAt: new Date().toISOString(),
        stalenessSeconds: Math.floor((Date.now() - start) / 1000),
        cacheHit: false,
      };
    }
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureState = getFixtureState();
    if (fixtureState) {
      return getFixtureForState(this.name, fixtureState);
    }

    const now = new Date().toISOString();
    const start = Date.now();
    try {
      // Simulated bucket data - in production, use AWS SDK for S3
      const clusterInfo: GarageClusterInfo = {
        layoutVersion: 5,
        nodeCount: 3,
        healthyNodes: 3,
        storageCapacity: 1024 * 1024 * 1024 * 1000, // 1 TB
        storageUsed: 1024 * 1024 * 1024 * 250, // 250 GB
      };

      const buckets: GarageBucket[] = [
        {
          id: "bucket-1",
          name: "backups",
          size: 1024 * 1024 * 1024 * 150, // 150 GB
          objects: 12500,
          quotas: {
            maxSize: 1024 * 1024 * 1024 * 200, // 200 GB
            maxObjects: 50000,
          },
        },
        {
          id: "bucket-2",
          name: "media",
          size: 1024 * 1024 * 1024 * 75, // 75 GB
          objects: 8200,
        },
        {
          id: "bucket-3",
          name: "logs",
          size: 1024 * 1024 * 25, // 25 MB
          objects: 1500,
        },
      ];

      const totalSize = buckets.reduce((sum, b) => sum + b.size, 0);
      const totalObjects = buckets.reduce((sum, b) => sum + b.objects, 0);
      const storageUsage = (clusterInfo.storageUsed / clusterInfo.storageCapacity) * 100;

      return {
        title: "Garage S3",
        subtitle: "Distributed object storage",
        state: clusterInfo.healthyNodes === clusterInfo.nodeCount ? "healthy" : "warning",
        freshness: {
          adapter: this.name,
          source: "garage-api",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [
          { label: "Storage Used", value: `${storageUsage.toFixed(1)}%`, unit: "%", state: storageUsage > 90 ? "warning" : "healthy" },
          { label: "Capacity", value: this.formatBytes(clusterInfo.storageCapacity), state: "healthy" },
          { label: "Used", value: this.formatBytes(clusterInfo.storageUsed), state: "healthy" },
          { label: "Buckets", value: buckets.length, state: "healthy" },
          { label: "Objects", value: totalObjects, state: "healthy" },
          { label: "Nodes", value: `${clusterInfo.healthyNodes}/${clusterInfo.nodeCount}`, state: "healthy" },
        ],
        items: buckets.map((b) => {
          const quota = b.quotas ? `${this.formatBytes(b.quotas.maxSize)} / ${b.quotas.maxObjects} objects` : "Unlimited";
          const sizeQuota = b.quotas ? (b.size / b.quotas.maxSize) * 100 : 0;

          return {
            id: b.id,
            label: b.name,
            subtitle: `${b.objects} objects • ${this.formatBytes(b.size)}`,
            value: quota,
            state: sizeQuota > 90 ? "warning" : "healthy",
          };
        }),
      };
    } catch (error) {
      return {
        title: "Garage S3",
        subtitle: error instanceof Error ? error.message : "Unknown error",
        state: "critical",
        freshness: {
          adapter: this.name,
          source: "garage-api",
          queriedAt: now,
          stalenessSeconds: Math.floor((Date.now() - start) / 1000),
          cacheHit: false,
        },
        metrics: [{ label: "Status", value: "ERROR", state: "critical" }],
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}

const adapter = new GarageS3Adapter();
export { adapter as default };