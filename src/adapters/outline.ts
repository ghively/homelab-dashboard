import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import axios from "axios";

/**
 * Outline adapter - knowledge base and documentation
 */
export class OutlineAdapter extends BaseAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(
    baseUrl: string = process.env.OUTLINE_BASE_URL || "http://localhost:3000",
    apiKey: string = process.env.OUTLINE_API_KEY || ""
  ) {
    super("outline");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  protected async fetchData(): Promise<unknown> {
    if (!this.apiKey) {
      throw new Error("OUTLINE_API_KEY not configured");
    }

    const client = axios.create({
      baseURL: `${this.baseUrl}/api`,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: this.config.timeoutMs,
    });

    // Verify auth
    const userResponse = await client.get("/user.info");
    const user = userResponse.data?.data;

    // List collections
    const collectionsResponse = await client.get("/collections.list");
    const collections = collectionsResponse.data?.data || [];

    // Count total documents across collections
    let totalDocuments = 0;
    for (const collection of collections.slice(0, 5)) {
      const docsResponse = await client.post("/documents.list", {
        collectionId: collection.id,
      });
      totalDocuments += docsResponse.data?.data?.length || 0;
    }

    // Search for recently updated documents
    const searchResponse = await client.post("/documents.search", {
      query: "",
      limit: 5,
    });
    const recentDocs = searchResponse.data?.data?.length || 0;

    return {
      healthy: true,
      collections: collections.length,
      documents: totalDocuments,
      recentDocuments: recentDocs,
      user: {
        name: user?.name,
        email: user?.email,
      },
    };
  }

  protected override deriveState(data: unknown): AdapterState {
    const d = (data ?? {}) as { collections?: unknown; healthy?: unknown };
    if (!data) return "offline";
    if (!d.healthy) return "critical";
    if (d.collections === 0) return "warning";
    return "healthy";
  }
}