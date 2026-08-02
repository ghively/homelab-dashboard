import { BaseAdapter } from "./BaseAdapter";
import type { AdapterResult, AdapterState } from "./types";
import axios from "axios";

/**
 * Vikunja adapter - task and project management
 */
export class VikunjaAdapter extends BaseAdapter {
  private baseUrl: string;
  private token: string;

  constructor(
    baseUrl: string = process.env.VIKUNJA_BASE_URL || "http://localhost:3456",
    token: string = process.env.VIKUNJA_TOKEN || ""
  ) {
    super("vikunja");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  protected async fetchData(): Promise<unknown> {
    if (!this.token) {
      throw new Error("VIKUNJA_TOKEN not configured");
    }

    const client = axios.create({
      baseURL: `${this.baseUrl}/api/v1`,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      timeout: this.config.timeoutMs,
    });

    // Fetch projects
    const projectsResponse = await client.get("/projects");
    const projects = projectsResponse.data || [];

    // Fetch tasks summary
    const tasksResponse = await client.get("/tasks/all", {
      params: { limit: 100 },
    });
    const tasks = tasksResponse.data || [];

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: { done?: boolean }) => t.done).length;
    const highPriorityTasks = tasks.filter((t: { priority?: number; done?: boolean }) => (t.priority ?? 0) >= 3 && !t.done).length;

    return {
      healthy: true,
      projects: projects.length,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
        highPriority: highPriorityTasks,
      },
      sampleProjects: projects.slice(0, 5).map((p: Record<string, unknown>) => ({
        id: p.id,
        title: p.title,
        isArchived: p.is_archived,
      })),
    };
  }

  protected override deriveState(data: unknown): AdapterState {
    const d = (data ?? {}) as { healthy?: unknown; tasks?: { highPriority?: number } };
    if (!data) return "offline";
    if (!d.healthy) return "critical";
    if ((d.tasks?.highPriority ?? 0) > 5) return "warning";
    return "healthy";
  }
}