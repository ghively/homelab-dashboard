// Vikunja adapter — projects, open tasks, overdue work.
//
// Everything here comes from the Vikunja API on the configured instance:
//   GET /api/v1/info                → version and enabled features (anonymous)
//   GET /api/v1/projects            → every project the token can see
//   GET /api/v1/projects/{id}/tasks → that project's tasks
//
// Why the per-project fan-out rather than /api/v1/tasks/all: on Vikunja v2 an
// API token (tk_…) is scoped per route, and /tasks/all answers 400 "Invalid
// model provided" for token auth — it is a JWT-only route. The old version of
// this file called it and would have rendered every count as zero. Fanning out
// over projects is the route a token is actually allowed to take.
//
// Overdue count is the state driver: it is the one number here that means
// something needs doing today.

import type { DataAdapter } from "./adapter-base";
import type { FreshnessInfo, Item, Metric, VisualQueryResult } from "./types";
import { getFixtureState } from "./registry";
import { getFixtureForState } from "./fixtures";
import {
  ADAPTER_FANOUT_TIMEOUT_MS,
  failureResult,
  fetchJson,
  makeFreshness,
  notConfiguredResult,
} from "@/lib/adapter-http";

const URL_ENV = "VIKUNJA_URL";
const TOKEN_ENV = "VIKUNJA_TOKEN";

/** Projects to fan out over. A homelab instance has a handful; this is a guard. */
const MAX_PROJECTS_QUERIED = 20;

interface VikunjaProject {
  id: number;
  title?: string;
  is_archived?: boolean;
  parent_project_id?: number;
}

interface VikunjaTask {
  id: number;
  title?: string;
  done?: boolean;
  priority?: number;
  due_date?: string;
  project_id?: number;
}

interface VikunjaInfo {
  version?: string;
  caldav_enabled?: boolean;
  webhooks_enabled?: boolean;
}

/** Vikunja writes "0001-01-01T00:00:00Z" for "no due date". */
function dueDate(task: VikunjaTask): Date | null {
  if (!task.due_date || task.due_date.startsWith("0001-")) return null;
  const d = new Date(task.due_date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class VikunjaAdapter implements DataAdapter {
  readonly name = "vikunja";
  readonly description = "Vikunja — projects, open tasks and overdue work.";
  readonly category = "home" as const;

  async health(): Promise<FreshnessInfo> {
    return makeFreshness(this.name, process.env[URL_ENV] || "unconfigured");
  }

  async query(): Promise<VisualQueryResult> {
    const fixtureStateValue = getFixtureState();
    if (fixtureStateValue) return getFixtureForState(this.name, fixtureStateValue);

    const configured = process.env[URL_ENV];
    if (!configured) return notConfiguredResult(this.name, "Vikunja", URL_ENV);

    const base = `${configured.replace(/\/$/, "")}/api/v1`;
    const token = process.env[TOKEN_ENV];
    const start = Date.now();

    try {
      // /info is anonymous, so it proves the instance is up even without a
      // token — which is what makes the `denied` branch below honest.
      const info = await fetchJson<VikunjaInfo>(`${base}/info`);

      if (!token) {
        return {
          title: "Vikunja — Tasks",
          subtitle: `Reachable (v${info.version ?? "?"}) but no API token configured`,
          state: "denied",
          freshness: makeFreshness(this.name, base, start),
          metrics: [
            { label: "Status", value: "NEEDS TOKEN", state: "denied" },
            { label: "Version", value: info.version ?? "unknown" },
            { label: "Endpoint", value: base },
          ],
          summary:
            `Vikunja ${info.version ?? ""} at ${base} answered /info anonymously. ` +
            `Set ${TOKEN_ENV} to a Vikunja API token to read projects and tasks.`,
        };
      }

      const headers = { Authorization: `Bearer ${token}` };
      const projects = await fetchJson<VikunjaProject[]>(`${base}/projects`, { headers });
      const live = projects.filter((p) => !p.is_archived).slice(0, MAX_PROJECTS_QUERIED);

      // One slow project must not take the panel down; each gets the shorter
      // fan-out budget and a failure contributes nothing rather than a zero.
      const perProject = await Promise.all(
        live.map(async (p) => {
          try {
            const tasks = await fetchJson<VikunjaTask[]>(
              `${base}/projects/${p.id}/tasks?per_page=100`,
              { headers },
              ADAPTER_FANOUT_TIMEOUT_MS,
            );
            return { project: p, tasks: Array.isArray(tasks) ? tasks : [], ok: true };
          } catch {
            return { project: p, tasks: [] as VikunjaTask[], ok: false };
          }
        }),
      );

      const failedProjects = perProject.filter((r) => !r.ok);
      const allTasks = perProject.flatMap((r) => r.tasks);
      const open = allTasks.filter((t) => !t.done);
      const done = allTasks.filter((t) => t.done);
      const now = Date.now();
      const overdue = open.filter((t) => {
        const d = dueDate(t);
        return d !== null && d.getTime() < now;
      });
      const highPriority = open.filter((t) => (t.priority ?? 0) >= 3);

      const metrics: Metric[] = [
        { label: "Version", value: info.version ?? "unknown" },
        { label: "Projects", value: projects.length },
        { label: "Archived", value: projects.filter((p) => p.is_archived).length },
        { label: "Open Tasks", value: open.length },
        { label: "Done", value: done.length },
        { label: "Overdue", value: overdue.length, state: overdue.length ? "warning" : "healthy" },
        {
          label: "High Priority",
          value: highPriority.length,
          state: highPriority.length ? "warning" : "healthy",
        },
        ...(failedProjects.length
          ? [
              {
                label: "Unread Projects",
                value: failedProjects.length,
                state: "warning" as const,
              },
            ]
          : []),
      ];

      const items: Item[] = [
        ...overdue.slice(0, 20).map((t) => ({
          id: `overdue:${t.id}`,
          label: t.title ?? `task ${t.id}`,
          subtitle: `overdue since ${dueDate(t)?.toISOString().slice(0, 10)}`,
          value: `P${t.priority ?? 0}`,
          state: "warning" as const,
          group: "overdue",
        })),
        ...perProject.map((r) => ({
          id: `project:${r.project.id}`,
          label: r.project.title ?? `project ${r.project.id}`,
          subtitle: r.ok
            ? `${r.tasks.filter((t) => !t.done).length} open • ${r.tasks.length} total`
            : "could not be read",
          value: r.ok ? r.tasks.length : "error",
          state: (r.ok ? "healthy" : "warning") as "healthy" | "warning",
          group: "projects",
        })),
      ];

      // No tasks at all across real projects is `empty`, not `healthy` — the
      // instance is up but there is genuinely nothing in it.
      const state: VisualQueryResult["state"] =
        overdue.length > 0 || failedProjects.length > 0
          ? "warning"
          : allTasks.length === 0
            ? "empty"
            : "healthy";

      return {
        title: "Vikunja — Tasks",
        subtitle: `${projects.length} projects • ${open.length} open • ${overdue.length} overdue`,
        state,
        freshness: makeFreshness(this.name, base, start),
        metrics,
        items,
        summary:
          `Vikunja ${info.version ?? ""} at ${base}: ${projects.length} projects ` +
          `(${live.length} active, queried individually), ${allTasks.length} tasks total — ` +
          `${open.length} open, ${done.length} done, ${overdue.length} overdue.`,
      };
    } catch (err) {
      return failureResult(this.name, "Vikunja", base, err, start);
    }
  }
}

const adapter = new VikunjaAdapter();
export { adapter as default };
