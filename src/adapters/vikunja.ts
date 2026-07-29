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

  protected async fetchData(): Promise<any> {
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
    const completedTasks = tasks.filter((t: any) => t.done).length;
    const highPriorityTasks = tasks.filter((t: any) => t.priority >= 3 && !t.done).length;

    return {
      healthy: true,
      projects: projects.length,
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
        highPriority: highPriorityTasks,
      },
      sampleProjects: projects.slice(0, 5).map((p: any) => ({
        id: p.id,
        title: p.title,
        isArchived: p.is_archived,
      })),
    };
  }

  protected override deriveState(data: any): AdapterState {
    if (!data) return "offline";
    if (!data.healthy) return "critical";
    if (data.tasks.highPriority > 5) return "warning";
    return "healthy";
  }
}