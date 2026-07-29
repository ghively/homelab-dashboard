/**
 * GitHub Actions Runner Adapter — Jobs, labels, version
 *
 * Host: gh-arm (Tailscale reachable)
 * Uses GitHub API for self-hosted runners
 * Auth: GitHub PAT from 1Password
 */
import { HttpClient } from "../base-client";
import { ServiceAdapter, FreshnessInfo, VisualQueryResult } from "../types";
import { credentials } from "../onepassword";

const GITHUB_API_URL = process.env.GITHUB_API_URL || "https://api.github.com";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "ghively";

interface GitHubRunner {
  id: number;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  labels: { name: string }[];
}

interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_branch: string;
}

export class GitHubActionsAdapter implements ServiceAdapter {
  readonly name = "github-actions";
  readonly serviceName = "GitHub Actions Runner";
  readonly host = "gh-arm";

  private client: HttpClient;

  constructor() {
    const token = credentials.get({
      item: "GitHub Personal Access Token",
      envVar: "GITHUB_TOKEN",
    });

    this.client = new HttpClient({
      baseURL: GITHUB_API_URL,
      token: token || undefined,
      timeout: 10000,
    });
  }

  async health(): Promise<FreshnessInfo> {
    const now = new Date().toISOString();
    try {
      const { data } = await this.client.get<GitHubRunner[]>(`/orgs/${GITHUB_OWNER}/actions/runners`);
      return {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`GitHub Actions health check failed: ${message}`);
    }
  }

  async query(
    queryType: string = "overview",
    params: Record<string, unknown> = {}
  ): Promise<VisualQueryResult> {
    const now = new Date().toISOString();

    try {
      switch (queryType) {
        case "workflows":
          return await this.queryWorkflows(now, params);
        case "runners":
          return await this.queryRunners(now);
        case "overview":
        default:
          return await this.queryOverview(now);
      }
    } catch (error) {
      return this.errorResult(now, error);
    }
  }

  private async queryOverview(now: string): Promise<VisualQueryResult> {
    const [runnersResp, reposResp] = await Promise.all([
      this.client.get<{ runners: GitHubRunner[]; total_count: number }>(`/orgs/${GITHUB_OWNER}/actions/runners`),
      this.client.get<{ total_count: number }>(`/users/${GITHUB_OWNER}/repos?per_page=1&type=owner`),
    ]);

    const runners = runnersResp.data.runners;
    const repoCount = reposResp.data.total_count;

    const onlineRunners = runners.filter((r) => r.status === "online");
    const idleRunners = runners.filter((r) => !r.busy && r.status === "online");

    return {
      title: "GitHub Actions Runner",
      subtitle: `gh-arm · ${GITHUB_OWNER}`,
      state: onlineRunners.length === 0 ? "offline" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Runners", value: runners.length, unit: "" },
        { label: "Online", value: onlineRunners.length, unit: "" },
        { label: "Idle", value: idleRunners.length, unit: "" },
        { label: "Repos", value: repoCount, unit: "" },
      ],
      items: runners.map((r) => ({
        id: String(r.id),
        label: r.name,
        subtitle: `${r.os} · ${r.labels.map((l) => l.name).join(", ")}`,
        value: r.busy ? 0 : 1,
        state: r.status === "online" ? (r.busy ? "warning" : "healthy") : "offline",
        group: r.status === "online" ? "Online" : "Offline",
      })),
      summary: `${idleRunners.length}/${onlineRunners.length} runners idle`,
    };
  }

  private async queryRunners(now: string): Promise<VisualQueryResult> {
    const { data } = await this.client.get<{ runners: GitHubRunner[]; total_count: number }>(`/orgs/${GITHUB_OWNER}/actions/runners`);

    return {
      title: "GitHub Runners",
      subtitle: "Self-hosted runner fleet",
      state: data.runners.some((r) => r.status !== "online") ? "warning" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Total", value: data.runners.length, unit: "" },
        { label: "Online", value: data.runners.filter((r) => r.status === "online").length, unit: "" },
        { label: "Busy", value: data.runners.filter((r) => r.busy).length, unit: "" },
      ],
      items: data.runners.map((r) => ({
        id: String(r.id),
        label: r.name,
        subtitle: `${r.os} · ${r.status} · ${r.busy ? "busy" : "idle"}`,
        value: r.busy ? 0 : 1,
        state: r.status === "online" ? (r.busy ? "warning" : "healthy") : "offline",
        group: r.os,
        meta: { labels: r.labels.map((l) => l.name) },
      })),
      summary: `${data.runners.filter((r) => r.status === "online").length}/${data.runners.length} online`,
    };
  }

  private async queryWorkflows(now: string, params: Record<string, unknown>): Promise<VisualQueryResult> {
    const repo = (params.repo as string) || "hermes-pilot";

    const { data: runs } = await this.client.get<GitHubWorkflowRun[]>(`/repos/${GITHUB_OWNER}/${repo}/actions/runs?per_page=50`);

    const byConclusion = runs.reduce(
      (acc, r) => {
        const conclusion = r.conclusion || "running";
        acc[conclusion] = (acc[conclusion] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      title: "GitHub Workflows",
      subtitle: `${GITHUB_OWNER}/${repo}`,
      state: byConclusion.failure > 0 ? "critical" : byConclusion.running > 0 ? "warning" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: Object.entries(byConclusion).map(([conclusion, count]) => ({
        label: conclusion,
        value: count,
        unit: "",
        state: conclusion === "failure" ? "critical" : conclusion === "success" ? "healthy" : "warning",
      })),
      events: runs.slice(0, 20).map((r) => ({
        id: String(r.id),
        at: r.created_at,
        title: r.name,
        detail: `${r.head_branch} · ${r.conclusion || r.status}`,
        state: r.conclusion === "success" ? "healthy" : r.conclusion === "failure" ? "critical" : "warning",
        meta: { url: r.html_url },
      })),
      summary: `${byConclusion.success || 0}/${runs.length} workflows succeeded`,
    };
  }

  private errorResult(now: string, error: unknown): VisualQueryResult {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      title: "GitHub Actions Runner",
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

export const githubActionsAdapter = new GitHubActionsAdapter();