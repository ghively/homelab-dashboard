import { createLibrary } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { homelabComponents, homelabGroup } from "@/visual/components";

export const library = createLibrary({
  root: openuiLibrary.root,
  componentGroups: [...(openuiLibrary.componentGroups ?? []), homelabGroup],
  components: [
    ...Object.values(openuiLibrary.components),
    ...homelabComponents,
  ],
});
