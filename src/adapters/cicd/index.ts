/**
 * CI/CD Adapter Registry
 *
 * Central registry for all Phase 5 adapters
 */
import { ServiceAdapter } from "../types";
import { gitlabAdapter } from "./gitlab";
import { gitlabRunnerAdapter } from "./gitlab-runner";
import { githubActionsAdapter } from "./github-actions";
import { ansibleAdapter } from "./ansible";
import { HttpClient } from "../base-client";
import { credentials } from "../onepassword";
import type { VisualQueryResult } from "../types";

/** Shape of the /runners entries this adapter reads. */
interface GitLabRunner {
  id?: number | string;
  description?: string;
  status?: string;
  active?: boolean;
  runner_type?: string;
  version?: string;
}

/**
 * GitLab Runner on gh-ai (Tailscale: 100.92.162.32)
 * Named "hermes-vps-runner" in GitLab, currently deregistered
 */
class GitLabRunnerAIAdapter implements ServiceAdapter {
  readonly name = "gitlab-runner-ai";
  readonly serviceName = "GitLab Runner (gh-ai)";
  readonly host = "gh-ai";

  private client: HttpClient;

  constructor() {
    const token = credentials.get({
      item: "Gitlab PAT Gregory",
      envVar: "GITLAB_TOKEN",
    });

    this.client = new HttpClient({
      baseURL: process.env.GITLAB_API_URL || "https://git.hively.dev/api/v4",
      token: token || undefined,
      timeout: 10000,
    });
  }

  async health() {
    const now = new Date().toISOString();
    try {
      const { data: runners } = await this.client.get<GitLabRunner[]>("/runners");
      return {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`GitLab Runner AI health check failed: ${message}`);
    }
  }

  async query(queryType: string = "overview", params: Record<string, unknown> = {}): Promise<VisualQueryResult> {
    const now = new Date().toISOString();

    try {
      const { data: runners } = await this.client.get<GitLabRunner[]>("/runners");

      // Filter for gh-ai runner (deregistered, but track for cleanup)
      const aiRunner = runners.find((r) => r.description?.includes("hermes-vps"));

      const state: VisualQueryResult["state"] = aiRunner
        ? (aiRunner.status === "online" ? "healthy" : "warning")
        : "offline";

      return {
        title: "GitLab Runner (gh-ai)",
        subtitle: aiRunner ? "Registered" : "Deregistered",
        state,
        freshness: {
          adapter: this.name,
          source: this.host,
          queriedAt: now,
          stalenessSeconds: 0,
          cacheHit: false,
          version: aiRunner?.version,
        },
        metrics: aiRunner ? [
          { label: "Status", value: aiRunner.status ?? "unknown", unit: "", state: aiRunner.status === "online" ? "healthy" : "warning" },
          { label: "Active", value: aiRunner.active ? "yes" : "no", unit: "" },
          { label: "Type", value: aiRunner.runner_type ?? "unknown", unit: "" },
        ] : [
          { label: "Status", value: "deregistered", unit: "", state: "critical" },
        ],
        summary: aiRunner
          ? `Runner #${aiRunner.id} · ${aiRunner.version}`
          : "Runner deregistered, pending cleanup",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        title: "GitLab Runner (gh-ai)",
        subtitle: "Query failed",
        state: "offline",
        freshness: {
          adapter: this.name,
          source: this.host,
          queriedAt: now,
          stalenessSeconds: 0,
          cacheHit: false,
        },
        summary: `Error: ${message}`,
      };
    }
  }
}

/**
 * All CI/CD adapters
 */
export const cicdAdapters: Record<string, ServiceAdapter> = {
  gitlab: gitlabAdapter,
  "gitlab-runner": gitlabRunnerAdapter,
  "gitlab-runner-ai": new GitLabRunnerAIAdapter(),
  "github-actions": githubActionsAdapter,
  ansible: ansibleAdapter,
};

/**
 * Get an adapter by name
 */
export function getCicdAdapter(name: string): ServiceAdapter | null {
  return cicdAdapters[name] || null;
}

/**
 * List all available CI/CD adapters
 */
export function listCicdAdapters(): Array<{ name: string; serviceName: string; host: string }> {
  return Object.values(cicdAdapters).map((a) => ({
    name: a.name,
    serviceName: a.serviceName,
    host: a.host,
  }));
}