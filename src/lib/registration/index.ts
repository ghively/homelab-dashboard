/**
 * Aggregates the per-world registration modules.
 *
 * Split by world purely to keep concurrent work on different worlds from
 * colliding in one file; the ordering here is irrelevant because every
 * registration is keyed by adapter name.
 */

import type { DataAdapter } from "@/adapters/adapter-base";
import { register as registerAi } from "./ai";
import { register as registerHome } from "./home";
import { register as registerOps } from "./ops";
import { register as registerInfrastructure } from "./infrastructure";
import { register as registerKnowledge } from "./knowledge";
import { register as registerPersonal } from "./personal";
import { register as registerSecurity } from "./security";
import { register as registerMedia } from "./media";

export function registerWorldAdapters(registry: Map<string, DataAdapter>): void {
  registerAi(registry);
  registerHome(registry);
  registerOps(registry);
  registerInfrastructure(registry);
  registerKnowledge(registry);
  registerPersonal(registry);
  registerSecurity(registry);
  registerMedia(registry);
}
