/**
 * Server-safe system prompt generator.
 *
 * The chat API route runs on the server and cannot import React client
 * components (createContext crashes the Next.js server bundle). This module
 * builds a PromptSpec from lang-core only — schemas and descriptions, no
 * renderers — merged with the pre-generated OpenUI base spec JSON.
 */
import { createLibrary, generateSystemPrompt, type SystemPromptOptions } from "@openuidev/lang-core";
import { serverComponents } from "@/visual/components/server-definitions";
import { homelabGroupNotes } from "@/visual/components/group-notes";
import baseSpec from "@/generated/base-spec.json";
import type { PromptSpec } from "@openuidev/lang-core";

const homelabLibrary = createLibrary({ components: serverComponents });
const homelabSpec = homelabLibrary.toSpec();

const mergedSpec: PromptSpec = {
  ...baseSpec,
  components: {
    ...baseSpec.components,
    ...homelabSpec.components,
  },
  componentGroups: [
    ...(baseSpec.componentGroups ?? []),
    {
      name: "Homelab Visuals",
      components: serverComponents.map((c) => c.name),
      notes: homelabGroupNotes,
    },
  ],
};

export function buildSystemPrompt(promptOptions: SystemPromptOptions): string {
  return generateSystemPrompt({ library: mergedSpec, promptOptions });
}
