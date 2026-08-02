/**
 * Entry point for the prompt/renderer parity guard.
 *
 * src/visual/components/index.tsx imports a .css file and OpenUI's chart
 * components touch `document`, neither of which exists under plain node. This
 * wrapper stubs both, then runs the real check in check-parity.ts.
 *
 * Usage: node scripts/check-parity.cjs   (or: npm run check:parity)
 */
/* eslint-disable @typescript-eslint/no-require-imports -- this file is CommonJS by
   design: it installs the .css/document stubs that must exist BEFORE the ESM
   component modules are loaded, which import() cannot express. */
require.extensions[".css"] = () => {};
global.document = {
  createElement: () => ({
    getContext: () => ({ measureText: (t) => ({ width: String(t).length * 7 }), font: "" }),
  }),
};
global.window = { devicePixelRatio: 1 };
require("./check-parity.ts");
