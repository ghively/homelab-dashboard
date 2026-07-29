/**
 * GitLab Runner Adapter (gh-git) — Jobs, capacity, version
 *
 * Host: gh-git (Tailscale: vmi1825965.contaboserver.net)
 * Runners: gh-git-runner (id=8), gh-git-ansible-native (id=11)
 * GitLab API: https://git.hively.dev/api/v4
 */
import { HttpClient } from "../base-client";
import { ServiceAdapter, FreshnessInfo, VisualQueryResult } from "../types";
import { credentials } from "../onepassword";

const GITLAB_API_URL = process.env.GITLAB_API_URL || "https://git.hively.dev/api/v4";

interface GitLabRunnerJob {
  id: number;
  status: string;
  stage: string;
  name: string;
  started_at?: string;
  finished_at?: string;
  duration?: number;
  project: { id: number; name: string };
}

interface GitLabRunnerDetail {
  id: number;
  description: string;
  active: boolean;
  is_shared: boolean;
  runner_type: string;
  status: string;
  version: string;
  contacted_at?: string;
  tag_list: string[];
}

export class GitLabRunnerAdapter implements ServiceAdapter {
  readonly name = "gitlab-runner";
  readonly serviceName = "GitLab Runner (gh-git)";
  readonly host = "gh-git";

  private client: HttpClient;

  constructor() {
    const token = credentials.get({
      item: "Gitlab PAT Gregory",
      envVar: "GITLAB_TOKEN",
    });

    this.client = new HttpClient({
      baseURL: GITLAB_API_URL,
      token: token || undefined,
      timeout: 10000,
    });
  }

  async health(): Promise<FreshnessInfo> {
    const now = new Date().toISOString();
    try {
      const { data: runners } = await this.client.get<GitLabRunnerDetail[]>("/runners");
      return {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
        version: runners[0]?.version,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`GitLab Runner health check failed: ${message}`);
    }
  }

  async query(
    queryType: string = "overview",
    params: Record<string, unknown> = {}
  ): Promise<VisualQueryResult> {
    const now = new Date().toISOString();

    try {
      switch (queryType) {
        case "jobs":
          return await this.queryJobs(now);
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
    const [runnersResp] = await Promise.all([
      this.client.get<GitLabRunnerDetail[]>("/runners"),
    ]);

    const runners = runnersResp.data;
    const activeRunners = runners.filter((r) => r.active);
    const onlineRunners = runners.filter((r) => r.status === "online");

    return {
      title: "GitLab Runner Fleet (gh-git)",
      subtitle: `${activeRunners.length}/${runners.length} active`,
      state: onlineRunners.length < activeRunners.length ? "warning" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
        version: runners[0]?.version,
      },
      metrics: [
        { label: "Total", value: runners.length, unit: "" },
        { label: "Active", value: activeRunners.length, unit: "" },
        { label: "Online", value: onlineRunners.length, unit: "" },
        { label: "Shared", value: runners.filter((r) => r.is_shared).length, unit: "" },
      ],
      items: runners.map((r) => ({
        id: String(r.id),
        label: r.description || `Runner #${r.id}`,
        subtitle: `${r.version} · ${r.runner_type} · ${r.tag_list.join(", ") || "no tags"}`,
        value: r.active ? 1 : 0,
        state: r.status === "online" ? "healthy" : r.status === "offline" ? "offline" : "warning",
        group: r.is_shared ? "Shared" : "Project",
      })),
      summary: `${onlineRunners.length}/${runners.length} runners online`,
    };
  }

  private async queryJobs(now: string): Promise<VisualQueryResult> {
    const runnersResp = await this.client.get<GitLabRunnerDetail[]>("/runners");
    const jobPromises = runnersResp.data
      .filter((r) => r.active)
      .map((r) => this.client.get<GitLabRunnerJob[]>(`/runners/${r.id}/jobs?per_page=20`));

    const jobResponses = await Promise.all(jobPromises);
    const jobs = jobResponses.flatMap((r) => r.data).slice(0, 50);

    const byStatus = jobs.reduce(
      (acc, j) => {
        acc[j.status] = (acc[j.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      title: "GitLab Runner Jobs",
      subtitle: `${jobs.length} recent jobs`,
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
      events: jobs.map((j) => ({
        id: String(j.id),
        at: j.started_at || j.finished_at || new Date().toISOString(),
        title: `${j.project.name}: ${j.name}`,
        detail: `${j.stage} · ${j.status}${j.duration ? ` · ${Math.round(j.duration)}s` : ""}`,
        state: j.status === "success" ? "healthy" : j.status === "failed" ? "critical" : "warning",
        durationMs: j.duration ? j.duration * 1000 : undefined,
      })),
      summary: `${byStatus.success || 0}/${jobs.length} jobs succeeded`,
    };
  }

  private async queryRunners(now: string): Promise<VisualQueryResult> {
    const { data: runners } = await this.client.get<GitLabRunnerDetail[]>("/runners");

    return {
      title: "GitLab Runner Details",
      subtitle: "Runner fleet status",
      state: runners.some((r) => r.status !== "online") ? "warning" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
        version: runners[0]?.version,
      },
      items: runners.map((r) => ({
        id: String(r.id),
        label: r.description || `Runner #${r.id}`,
        subtitle: `${r.version} · ${r.runner_type} · ${r.tag_list.join(", ") || "no tags"}`,
        value: r.active ? 1 : 0,
        state: r.status === "online" ? "healthy" : r.status === "offline" ? "offline" : "warning",
        group: r.is_shared ? "Shared" : "Project",
        meta: {
          contactedAt: r.contacted_at,
        },
      })),
      summary: `${runners.filter((r) => r.status === "online").length}/${runners.length} online`,
    };
  }

  private errorResult(now: string, error: unknown): VisualQueryResult {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      title: "GitLab Runner (gh-git)",
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

export const gitlabRunnerAdapter = new GitLabRunnerAdapter();