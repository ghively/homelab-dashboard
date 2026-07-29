/**
 * Ansible Adapter — Pipeline status, drift detection, role inventory
 *
 * Host: gh-ai (via GitLab CI for homelab-ansible)
 * GitLab project uses Ansible for infrastructure automation
 * Auth: GitLab PAT for pipeline queries
 */
import { HttpClient } from "../base-client";
import { ServiceAdapter, FreshnessInfo, VisualQueryResult } from "../types";
import { credentials } from "../onepassword";

const GITLAB_API_URL = process.env.GITLAB_API_URL || "https://git.hively.dev/api/v4";

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  default_branch: string;
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
  variables: { key: string; value: string }[];
}

interface GitLabJob {
  id: number;
  name: string;
  status: string;
  stage: string;
  started_at?: string;
  finished_at?: string;
  duration?: number;
}

interface GitLabFile {
  file_path: string;
  size: number;
  commit_id: string;
  last_commit_id: string;
}

export class AnsibleAdapter implements ServiceAdapter {
  readonly name = "ansible";
  readonly serviceName = "Ansible (homelab-ansible)";
  readonly host = "gh-ai";

  private client: HttpClient;
  private ansibleProjectId: number | null = null;

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
      const projectId = await this.getAnsibleProjectId();
      const { data } = await this.client.get<GitLabPipeline[]>(`/projects/${projectId}/pipelines?per_page=1`);
      return {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
        lastChange: data[0]?.updated_at,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Ansible health check failed: ${message}`);
    }
  }

  async query(
    queryType: string = "overview",
    params: Record<string, unknown> = {}
  ): Promise<VisualQueryResult> {
    const now = new Date().toISOString();

    try {
      const projectId = await this.getAnsibleProjectId();

      switch (queryType) {
        case "pipelines":
          return await this.queryPipelines(now, projectId);
        case "roles":
          return await this.queryRoles(now, projectId);
        case "drift":
          return await this.queryDrift(now, projectId);
        case "overview":
        default:
          return await this.queryOverview(now, projectId);
      }
    } catch (error) {
      return this.errorResult(now, error);
    }
  }

  private async getAnsibleProjectId(): Promise<number> {
    if (this.ansibleProjectId !== null) {
      return this.ansibleProjectId;
    }

    const { data: projects } = await this.client.get<GitLabProject[]>("/projects?search=homelab-ansible&per_page=10");

    const ansibleProject = projects.find((p) => p.path_with_namespace.includes("homelab-ansible"));

    if (!ansibleProject) {
      throw new Error("homelab-ansible project not found");
    }

    this.ansibleProjectId = ansibleProject.id;
    return ansibleProject.id;
  }

  private async queryOverview(now: string, projectId: number): Promise<VisualQueryResult> {
    const [pipelinesResp, rolesResp] = await Promise.all([
      this.client.get<GitLabPipeline[]>(`/projects/${projectId}/pipelines?per_page=20`),
      this.client.get<GitLabFile[]>(`/projects/${projectId}/repository/tree?path=roles&per_page=100&ref=main`),
    ]);

    const pipelines = pipelinesResp.data;
    const roles = rolesResp.data.filter((f) => f.file_path.endsWith("tasks/main.yml")).length;

    const recentStatus = pipelines[0]?.status || "unknown";
    const successRate = pipelines.filter((p) => p.status === "success").length / Math.max(1, pipelines.length);

    return {
      title: "Ansible Automation",
      subtitle: "homelab-ansible · infrastructure-as-code",
      state: recentStatus === "success" ? "healthy" : recentStatus === "failed" ? "critical" : "warning",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
        lastChange: pipelines[0]?.updated_at,
      },
      metrics: [
        { label: "Roles", value: roles, unit: "" },
        { label: "Recent status", value: recentStatus, unit: "", state: recentStatus === "success" ? "healthy" : recentStatus === "failed" ? "critical" : "warning" },
        { label: "Success rate", value: Math.round(successRate * 100), unit: "%", trend: successRate > 0.8 ? 5 : -5 },
        { label: "Pipelines (24h)", value: pipelines.filter((p) => this.daysSince(p.created_at) < 1).length, unit: "" },
      ],
      events: pipelines.slice(0, 10).map((p) => ({
        id: String(p.id),
        at: p.created_at,
        title: `Pipeline #${p.id}`,
        detail: `${p.ref}${p.duration ? ` · ${Math.round(p.duration)}s` : ""}`,
        state: p.status === "success" ? "healthy" : p.status === "failed" ? "critical" : "warning",
        durationMs: p.duration ? p.duration * 1000 : undefined,
      })),
      summary: `${roles} roles, ${Math.round(successRate * 100)}% success rate`,
    };
  }

  private async queryPipelines(now: string, projectId: number): Promise<VisualQueryResult> {
    const { data: pipelines } = await this.client.get<GitLabPipeline[]>(`/projects/${projectId}/pipelines?per_page=50`);

    const byStatus = pipelines.reduce(
      (acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      title: "Ansible Pipelines",
      subtitle: "CI/CD execution history",
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
        state: p.status === "success" ? "healthy" : p.status === "failed" ? "critical" : "warning",
        durationMs: p.duration ? p.duration * 1000 : undefined,
        meta: { url: p.web_url, sha: p.sha },
      })),
      summary: `${byStatus.success || 0}/${pipelines.length} pipelines succeeded`,
    };
  }

  private async queryRoles(now: string, projectId: number): Promise<VisualQueryResult> {
    const { data: roles } = await this.client.get<GitLabFile[]>(`/projects/${projectId}/repository/tree?path=roles&per_page=100&ref=main`);

    const roleDirs = new Set<string>();
    roles.forEach((f) => {
      const match = f.file_path.match(/^roles\/([^/]+)/);
      if (match) roleDirs.add(match[1]);
    });

    const roleItems = Array.from(roleDirs).map((role) => ({
      id: role,
      label: role,
      subtitle: `Ansible role`,
      group: "Infrastructure",
      state: "healthy" as const,
    }));

    return {
      title: "Ansible Roles",
      subtitle: "Inventory automation roles",
      state: "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Roles", value: roleItems.length, unit: "" },
      ],
      items: roleItems,
      summary: `${roleItems.length} automation roles`,
    };
  }

  private async queryDrift(now: string, projectId: number): Promise<VisualQueryResult> {
    const { data: pipelines } = await this.client.get<GitLabPipeline[]>(`/projects/${projectId}/pipelines?status=failed&per_page=20`);

    const failedPipelines = pipelines.filter((p) => this.daysSince(p.created_at) < 7);

    return {
      title: "Infrastructure Drift",
      subtitle: "Configuration failures (7d)",
      state: failedPipelines.length > 0 ? "critical" : "healthy",
      freshness: {
        adapter: this.name,
        source: this.host,
        queriedAt: now,
        stalenessSeconds: 0,
        cacheHit: false,
      },
      metrics: [
        { label: "Failed pipelines", value: failedPipelines.length, unit: "", state: failedPipelines.length > 0 ? "critical" : "healthy" },
        { label: "Success rate", value: Math.round((1 - failedPipelines.length / Math.max(1, pipelines.length)) * 100), unit: "%" },
      ],
      events: failedPipelines.map((p) => ({
        id: String(p.id),
        at: p.created_at,
        title: `Pipeline #${p.id} failed`,
        detail: `${p.ref} · drift detected`,
        state: "critical",
        meta: { url: p.web_url },
      })),
      summary: failedPipelines.length > 0
        ? `${failedPipelines.length} drift events detected`
        : "No infrastructure drift detected",
    };
  }

  private errorResult(now: string, error: unknown): VisualQueryResult {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      title: "Ansible Automation",
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

  private daysSince(dateStr: string): number {
    return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  }
}

export const ansibleAdapter = new AnsibleAdapter();