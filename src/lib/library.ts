import { createLibrary } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { homelabComponents, homelabGroup } from "@/visual/components";

/**
 * Component names defined by BOTH OpenUI's base set and this repo's homelab set.
 *
 * Passing both to createLibrary() makes the Renderer throw on its first render:
 *
 *   Error: Duplicate schema id "Callout" detected during JSON Schema conversion.
 *
 * That happens inside useOpenUIState -> library.toJSONSchema(), so it breaks
 * *every* generated dashboard, not just ones using the colliding component.
 * It also put two contradictory signatures for the same name in the system
 * prompt, so the model could not know which one to emit.
 *
 * The homelab versions win: they are the narrow-schema components Phase 2
 * collapsed the library down to, and their signatures are what the prompt's
 * examples and guidance are written against.
 */
const homelabNames = new Set(homelabComponents.map((c) => c.name));

const baseComponents = Object.values(openuiLibrary.components).filter(
  (c) => !homelabNames.has(c.name),
);

export const library = createLibrary({
  root: openuiLibrary.root,
  componentGroups: [...(openuiLibrary.componentGroups ?? []), homelabGroup],
  components: [...baseComponents, ...homelabComponents],
});
