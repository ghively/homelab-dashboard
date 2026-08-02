/**
 * The VisualState vocabulary, in display order.
 *
 * This lives in its own dependency-free module on purpose. It used to be
 * exported from adapter-aggregator.ts, and the client components import it —
 * which dragged the ENTIRE server-side adapter tree into the browser bundle:
 *
 *   page.tsx -> dashboard.tsx -> adapter-aggregator -> adapter-runtime
 *            -> every adapter -> tls.ts -> undici -> node:net
 *
 * That surfaced as a runtime error in the browser ("Cannot find module
 * 'node:net'"), but the import chain was wrong long before undici made it
 * visible: a client bundle has no business containing fixtures, credentials
 * handling, or Node built-ins.
 *
 * Keep this file free of imports so it stays safe for client components.
 */

import type { VisualStateValue } from "@/adapters/types";

export const ALL_STATES: VisualStateValue[] = [
  "healthy",
  "warning",
  "critical",
  "offline",
  "stale",
  "loading",
  "empty",
  "denied",
];
