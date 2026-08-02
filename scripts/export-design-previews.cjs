/**
 * Wrapper for export-design-previews.tsx.
 *
 * Installs three things the renderer needs before any component module loads:
 *  - a .css require stub (components/index.tsx imports a stylesheet)
 *  - a minimal document/window (OpenUI's chart helpers measure text on a canvas)
 *  - no-op OpenUI hooks — NodeGraph, Kanban, VisualTable and ArtworkWall call
 *    useTriggerAction, and FilterDropdown calls useStateField. Those are only
 *    legal inside a live <Renderer>; a static export would throw without these.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
require.extensions[".css"] = () => {};
global.document = {
  createElement: () => ({
    getContext: () => ({ measureText: (t) => ({ width: String(t).length * 7 }), font: "" }),
  }),
};
global.window = { devicePixelRatio: 1 };

const rl = require("@openuidev/react-lang");
rl.useTriggerAction = () => () => {};
rl.useStateField = (_name, value) => ({ value, setValue: () => {} });

require("./export-design-previews.tsx");
