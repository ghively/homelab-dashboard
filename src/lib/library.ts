import { createLibrary } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { visualLibrary } from "@/visual/openui-visual-library-v4";

const homelabVisualGroup = {
  name: "Homelab Visual (Cyber Noir v4)",
  components: Object.keys(visualLibrary.components),
  notes: [
    "- 905 domain components across 79 renderer families. All use the VisualData schema.",
    "- Each component renders through its assigned renderer family (donut, timeline, metric-strip, artwork-wall, sankey, etc.).",
    "- Pass structured data: title, subtitle, state, metrics[], items[], series[], events[], nodes[], edges[].",
  ],
};

export const library = createLibrary({
  root: openuiLibrary.root,
  componentGroups: [...(openuiLibrary.componentGroups ?? []), homelabVisualGroup],
  components: [
    ...Object.values(openuiLibrary.components),
    ...Object.values(visualLibrary.components),
  ],
});
