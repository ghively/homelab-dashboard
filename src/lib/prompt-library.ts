/**
 * Server-safe component schemas for prompt generation.
 *
 * This module defines ONLY the Zod schemas and component descriptions —
 * no React, no CSS, no "use client". It uses @openuidev/lang-core (which is
 * React-free) so it can be imported from server-side API routes to generate
 * the system prompt via library.prompt().
 *
 * The client-side library (src/lib/library.ts) imports the React renderers
 * from src/visual/components for actual rendering. Both share the exact same
 * schemas and descriptions via src/visual/schemas.ts.
 */
import { createLibrary } from "@openuidev/lang-core";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { homelabGroup, homelabSchemaComponents } from "@/visual/schemas";

/**
 * Build a server-safe library for prompt generation.
 *
 * Uses the openui base library (already React-renderer-agnostic when its
 * renderers aren't invoked) plus our homelab schema-only components.
 */
export const promptLibrary = createLibrary({
  root: openuiLibrary.root,
  componentGroups: [
    ...(openuiLibrary.componentGroups ?? []),
    homelabGroup,
  ],
  components: [
    ...Object.values(openuiLibrary.components),
    ...homelabSchemaComponents,
  ],
});
