Fix obvious bugs and remove dead code across the React/canvas components, without changing their rendered behavior or adding new features.
Where: src/components/dashboard.tsx, src/components/decrypt-text.tsx, src/components/generative-chat.tsx, src/components/canvasui/ (Clouds.tsx, DecryptReveal.tsx, Effect.tsx, Frost.tsx, Glass.tsx, GlyphRain.tsx, Grid.tsx, Liquid.tsx, budget.ts, native-mode.ts, probe.ts), src/visual/components/index.tsx, src/visual/components/surface-style.ts
Done means: no unused imports/variables/dead branches remain in these files, the existing build/type-check/test suite still passes, and no rendering or prop behavior changes.
Out of scope: new features, visual redesigns, new components, any refactor beyond what removing bugs/dead code requires.
