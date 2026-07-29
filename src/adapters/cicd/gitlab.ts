/**
 * GitLab CE Adapter — Pipelines, MRs, Runners, Repos
 *
 * Host: gh-git (Tailscale: vmi1825965.contaboserver.net)
 * API: https://git.hively.dev/api/v4
 * Auth: PAT from 1Password "Gitlab PAT Gregory"
 */
import { HttpClient } from "../base-client";
import { ServiceAdapter, FreshnessInfo, VisualQueryResult } from "../types";
import { credentials } from "../onepassword";

const GITLAB_API_URL = process.env.GITLAB_API_URL || "https://git.hively.dev/api/v4";

// GitLab API types (simplified)
interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  default_branch: string;
  last_activity_at: string;
  star_count: number;
  forked_from_project?: GitLabProject;
}

interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  state: string;
  author: { name: string; username: string };
  created_at: string;
  updated_at: string;
  web_url: string;
  project_id: number;
}

interface GitLabPipeline {
  id: number;
  project_id: number;
  status: string;
  ref: string;
  sha: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  duration?: number;
}

interface GitLabRunner {
  id: number;
  description: string;
  active: boolean;
  is_shared: boolean;
  runner_type: string;
  status: string;
  version: string;
}

export class GitLabAdapter implements ServiceAdapter {
  readonly name = "gitlab";
  readonly serviceName = "GitLab CE";
  readonly host = "gh-git";

  private client: HttpClient;
  private versionCache: { version: string; fetchedAt: number } | null = null;

  constructor() {
    const token = credentials.get({
      item: "Gitlab PAT Gregory",
      envVar: "GITLAB_TOKEN",
    });

    this.client = new HttpClient({
      baseURL: GITLAB_API_URL,
      token: token || undefined,
      timeout: 15000,
    });
  }

  async health(): Promise<FreshnessInfo> {
    const now = new Date().toISOString();
    try {
      const { data } = await this.client.get<GitLabRunner[]>("/runners");

      return {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
        version: this.versionCache?.version,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`GitLab health check failed: ${message}`);
    }
  }

  async query(
    queryType: string = "overview",
    params: Record<string, unknown> = {}
  ): Promise<VisualQueryResult> {
    const now = new Date().toISOString();

    try {
      switch (queryType) {
        case "pipelines":
          return await this.queryPipelines(now);
        case "merge-requests":
          return await this.queryMergeRequests(now, params as { projectId?: number });
        case "runners":
          return await this.queryRunners(now);
        case "repositories":
          return await this.queryRepositories(now);
        case "overview":
        default:
          return await this.queryOverview(now);
      }
    } catch (error) {
      return this.errorResult(now, error);
    }
  }

  private async queryOverview(now: string): Promise<VisualQueryResult> {
    const [projectsResp, runnersResp, mrsResp] = await Promise.all([
      this.client.get<GitLabProject[]>("/projects?membership=true&per_page=50"),
      this.client.get<GitLabRunner[]>("/runners"),
      this.client.get<GitLabMergeRequest[]>("/merge_requests?state=opened&per_page=20"),
    ]);

    const projects = projectsResp.data;
    const runners = runnersResp.data;
    const mergeRequests = mrsResp.data;

    const activeRunners = runners.filter((r) => r.active).length;
    const onlineRunners = runners.filter((r) => r.status === "online").length;

    return {
      title: "GitLab CE",
      subtitle: `https://git.hively.dev`,
      state: "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Projects", value: projects.length, unit: "" },
        { label: "Open MRs", value: mergeRequests.length, unit: "" },
        { label: "Runners", value: activeRunners, unit: "active" },
        { label: "Online", value: onlineRunners, unit: "" },
      ],
      items: mergeRequests.slice(0, 8).map((mr) => ({
        id: String(mr.iid),
        label: `${mr.iid}: ${mr.title.substring(0, 40)}${mr.title.length > 40 ? "..." : ""}`,
        subtitle: `by ${mr.author.username} · ${this.timeAgo(mr.created_at)}`,
        value: mr.project_id,
        state: this.mapMrState(mr.state),
        group: "Open",
        meta: { url: mr.web_url },
      })),
      summary: `${projects.length} projects, ${mergeRequests.length} open MRs, ${activeRunners} active runners`,
    };
  }

  private async queryPipelines(now: string): Promise<VisualQueryResult> {
    const projectsResp = await this.client.get<GitLabProject[]>("/projects?membership=true&per_page=20");

    const pipelinePromises = projectsResp.data
      .slice(0, 10)
      .map((p) => this.client.get<GitLabPipeline[]>(`/projects/${p.id}/pipelines?per_page=5`));

    const pipelineResponses = await Promise.all(pipelinePromises);
    const pipelines = pipelineResponses.flatMap((r) => r.data).slice(0, 20);

    const byStatus = pipelines.reduce(
      (acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      title: "GitLab Pipelines",
      subtitle: "Recent CI/CD executions",
      state: byStatus.failed > 0 ? "critical" : byStatus.running > 0 ? "warning" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: Object.entries(byStatus).map(([status, count]) => ({
        label: status,
        value: count,
        unit: "",
        state: status === "failed" ? "critical" : status === "success" ? "healthy" : "warning",
      })),
      events: pipelines.map((p) => ({
        id: String(p.id),
        at: p.created_at,
        title: `Pipeline #${p.id}`,
        detail: `${p.ref} · ${p.status}${p.duration ? ` · ${Math.round(p.duration)}s` : ""}`,
        state: this.mapPipelineState(p.status),
        durationMs: p.duration ? p.duration * 1000 : undefined,
      })),
      summary: `${pipelines.length} recent pipelines`,
    };
  }

  private async queryMergeRequests(
    now: string,
    params: { projectId?: number }
  ): Promise<VisualQueryResult> {
    const path = params.projectId
      ? `/projects/${params.projectId}/merge_requests?state=opened&per_page=50`
      : "/merge_requests?state=opened&per_page=50";

    const { data: mrs } = await this.client.get<GitLabMergeRequest[]>(path);

    return {
      title: "GitLab Merge Requests",
      subtitle: params.projectId ? `Project ${params.projectId}` : "All projects",
      state: "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Open", value: mrs.length, unit: "" },
        { label: "This week", value: mrs.filter((m) => this.daysSince(m.created_at) < 7).length, unit: "" },
      ],
      items: mrs.map((mr) => ({
        id: String(mr.iid),
        label: `${mr.iid}: ${mr.title}`,
        subtitle: `by ${mr.author.username} · ${this.timeAgo(mr.created_at)}`,
        value: mr.project_id,
        state: this.mapMrState(mr.state),
        group: this.groupByAge(mr.created_at),
        meta: { url: mr.web_url },
      })),
      facets: [
        {
          name: "Age",
          values: [
            { label: "Recent (< 7d)", count: mrs.filter((m) => this.daysSince(m.created_at) < 7).length },
            { label: "Stale (7-30d)", count: mrs.filter((m) => this.daysSince(m.created_at) >= 7 && this.daysSince(m.created_at) < 30).length },
            { label: "Old (30d+)", count: mrs.filter((m) => this.daysSince(m.created_at) >= 30).length },
          ],
        },
      ],
      summary: `${mrs.length} open merge requests`,
    };
  }

  private async queryRunners(now: string): Promise<VisualQueryResult> {
    const { data: runners } = await this.client.get<GitLabRunner[]>("/runners?per_page=50");

    return {
      title: "GitLab Runners",
      subtitle: "CI/CD fleet status",
      state: runners.some((r) => r.status !== "online") ? "warning" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Total", value: runners.length, unit: "" },
        { label: "Active", value: runners.filter((r) => r.active).length, unit: "" },
        { label: "Online", value: runners.filter((r) => r.status === "online").length, unit: "" },
        { label: "Shared", value: runners.filter((r) => r.is_shared).length, unit: "" },
      ],
      items: runners.map((r) => ({
        id: String(r.id),
        label: r.description || `Runner #${r.id}`,
        subtitle: `${r.version} · ${r.runner_type}`,
        value: r.active ? 1 : 0,
        state: r.status === "online" ? "healthy" : r.status === "offline" ? "offline" : "warning",
        group: r.is_shared ? "Shared" : "Project",
      })),
      summary: `${runners.filter((r) => r.status === "online").length}/${runners.length} runners online`,
    };
  }

  private async queryRepositories(now: string): Promise<VisualQueryResult> {
    const { data: projects } = await this.client.get<GitLabProject[]>("/projects?membership=true&per_page=50");

    return {
      title: "GitLab Repositories",
      subtitle: "Project inventory",
      state: "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Total", value: projects.length, unit: "" },
        { label: "Forked", value: projects.filter((p) => p.forked_from_project).length, unit: "" },
        { label: "Active (30d)", value: projects.filter((p) => this.daysSince(p.last_activity_at) < 30).length, unit: "" },
      ],
      items: projects.map((p) => ({
        id: String(p.id),
        label: p.path_with_namespace,
        subtitle: `${p.default_branch} · ${p.star_count} stars · ${this.timeAgo(p.last_activity_at)}`,
        value: p.star_count,
        state: this.daysSince(p.last_activity_at) < 7 ? "healthy" : this.daysSince(p.last_activity_at) < 30 ? "warning" : "stale",
        group: p.forked_from_project ? "Fork" : "Original",
      })),
      summary: `${projects.length} repositories`,
    };
  }

  private errorResult(now: string, error: unknown): VisualQueryResult {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      title: "GitLab CE",
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

  private timeAgo(dateStr: string): string {
    const diff = this.daysSince(dateStr);
    if (diff < 1) return "today";
    if (diff < 7) return `${Math.round(diff)}d ago`;
    if (diff < 30) return `${Math.round(diff / 7)}w ago`;
    return `${Math.round(diff / 30)}mo ago`;
  }

  private daysSince(dateStr: string): number {
    return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  }

  private groupByAge(dateStr: string): string {
    const diff = this.daysSince(dateStr);
    if (diff < 7) return "Recent";
    if (diff < 30) return "Stale";
    return "Old";
  }

  private mapMrState(state: string): "healthy" | "warning" | "critical" | "offline" | "stale" {
    switch (state) {
      case "opened":
      case "merged":
        return "healthy";
      case "closed":
        return "stale";
      case "locked":
        return "warning";
      default:
        return "offline";
    }
  }

  private mapPipelineState(state: string): "healthy" | "warning" | "critical" | "offline" | "stale" {
    switch (state) {
      case "success":
      case "manual":
        return "healthy";
      case "pending":
      case "running":
      case "created":
        return "warning";
      case "failed":
      case "canceled":
      case "skipped":
        return "critical";
      default:
        return "offline";
    }
  }
}

export const gitlabAdapter = new GitLabAdapter();