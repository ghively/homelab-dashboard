/**
 * Guard: the prompt library and the renderer library must declare identical
 * props, in identical order, for every homelab component.
 *
 * OpenUI maps a generated call's positional arguments onto props by declaration
 * order. src/visual/schemas.ts feeds the system prompt; src/visual/components
 * feeds the renderer. When they drift, every argument lands one or more slots
 * off and panels render blank or vanish — silently, with no error anywhere.
 *
 * This actually happened: schemas.ts omitted surfaceStyle/span/rowSpan, so all
 * 25 shared components were offset by three, and FilterDropdown, Section and
 * DashboardGrid were missing from the prompt entirely.
 *
 * Usage: npx tsx scripts/check-parity.ts   (exits 1 on drift)
 */
import { homelabComponents } from "@/visual/components";
import { homelabSchemaComponents } from "@/visual/schemas";

type Comp = { name: string; props?: { shape?: Record<string, unknown> } };

const propNames = (c: Comp): string[] => Object.keys(c.props?.shape ?? {});

const renderer = new Map((homelabComponents as unknown as Comp[]).map((c) => [c.name, propNames(c)]));
const prompt = new Map((homelabSchemaComponents as unknown as Comp[]).map((c) => [c.name, propNames(c)]));

let failures = 0;

for (const [name, rProps] of renderer) {
  const pProps = prompt.get(name);
  if (!pProps) {
    console.error(`  MISSING FROM PROMPT: ${name} is renderable but schemas.ts does not describe it`);
    failures++;
    continue;
  }
  if (JSON.stringify(rProps) !== JSON.stringify(pProps)) {
    console.error(`  PROP ORDER MISMATCH: ${name}`);
    console.error(`      renderer: ${rProps.join(", ")}`);
    console.error(`      prompt:   ${pProps.join(", ")}`);
    failures++;
  }
}

for (const name of prompt.keys()) {
  if (!renderer.has(name)) {
    console.error(`  NOT RENDERABLE: ${name} is in the prompt but has no renderer`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\nFAIL — ${failures} component(s) out of parity between prompt and renderer.`);
  process.exit(1);
}
console.log(`PASS — ${renderer.size} components in parity between prompt and renderer.`);
