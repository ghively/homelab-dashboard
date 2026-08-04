# Plan: Delete the orphaned fail2ban adapter duplicate

## Summary

Remove the dead `src/adapters/security/fail2ban-adapter.ts` stub (an
unimplemented duplicate) and every reference to it inside
`src/adapters/security/index.ts`. The live adapter —
`src/adapters/Fail2banAdapter.ts`, already registered in
`src/lib/adapter-runtime.ts` — is untouched, so no behavior changes.

## Why (verified before planning)

- `src/adapters/security/fail2ban-adapter.ts` is an explicit "NOT IMPLEMENTED"
  stub whose own header comment points to the real
  `src/adapters/Fail2banAdapter.ts` and says to use that one. It is never
  imported by `adapter-runtime.ts` or `registration/security.ts`.
- The real adapter is wired in `src/lib/adapter-runtime.ts:36`
  (`import fail2ban from "@/adapters/Fail2banAdapter"`).
- `src/lib/registration/security.ts` registers only `1password`; fail2ban is
  deliberately NOT registered (falls through to a labelled fixture). This file
  is not touched.
- All references to the stub live in exactly one file,
  `src/adapters/security/index.ts`, in three places (plus one comment).
- The `securityAdapters` map, `listSecurityAdapters`, `getSecurityAdapter`
  helpers, and the `fail2banAdapter` named export are imported by nothing
  outside that file — so deleting only the fail2ban references (leaving the
  wazuh re-exports intact) breaks no import path.

## Scope

### In scope

1. **Delete** `src/adapters/security/fail2ban-adapter.ts`.
2. **Edit** `src/adapters/security/index.ts` to remove all fail2ban references:
   - Remove the import line `import fail2ban from "./fail2ban-adapter";` (line 9).
   - Remove the map entry `"fail2ban": fail2ban,` from `securityAdapters`.
   - Remove the re-export block:
     ```ts
     export {
       default as fail2banAdapter,
     } from "./fail2ban-adapter";
     ```
   - Drop the trailing `, fail2ban` from the file header comment so the comment
     no longer names a removed export (keep the wazuh wording).

### Explicitly out of scope (do NOT touch)

- `src/adapters/Fail2banAdapter.ts` — the real, registered adapter.
- `src/lib/adapter-runtime.ts` — already imports the real adapter.
- `src/lib/registration/security.ts` — registers `1password` only by design.
- The rest of `src/adapters/security/index.ts`: the wazuh imports, the
  `securityAdapters` map (minus the fail2ban entry), `getSecurityAdapter`,
  `listSecurityAdapters`, and the three wazuh re-exports stay. The barrel being
  unused elsewhere is a separate cleanup, not this one.
- `src/adapters/iot-vlan-adapter.ts` and `src/adapters/storage/smb-nfs-adapter.ts`
  remain honest not-implemented stubs — no fabricated data or client logic.

## Files touched

| File | Action |
| --- | --- |
| `src/adapters/security/fail2ban-adapter.ts` | delete |
| `src/adapters/security/index.ts` | edit (remove import, map entry, re-export, comment word) |

## Resulting `index.ts` shape

After the edit, `src/adapters/security/index.ts` keeps the wazuh wiring and the
helpers, with fail2ban gone:

```ts
// Security adapters — Phase 8.
// Wazuh x3 (manager, indexer, dashboard).

import type { DataAdapter } from "../adapter-base";

import wazuhManager from "./wazuh-manager-adapter";
import wazuhIndexer from "./wazuh-indexer-adapter";
import wazuhDashboard from "./wazuh-dashboard-adapter";

export const securityAdapters: Record<string, DataAdapter> = {
  "wazuh-manager": wazuhManager,
  "wazuh-indexer": wazuhIndexer,
  "wazuh-dashboard": wazuhDashboard,
};

export function getSecurityAdapter(name: string): DataAdapter | undefined {
  return securityAdapters[name];
}

export function listSecurityAdapters(): Array<{ name: string; description: string }> {
  return Object.values(securityAdapters).map((a) => ({
    name: a.name,
    description: a.description,
  }));
}

export {
  default as wazuhManagerAdapter,
} from "./wazuh-manager-adapter";

export {
  default as wazuhIndexerAdapter,
} from "./wazuh-indexer-adapter";

export {
  default as wazuhDashboardAdapter,
} from "./wazuh-dashboard-adapter";
```

## Verification

Run from the repo root and judge by exit status:

1. `npm run build` — type-checks for real; must pass (AGENTS.md non-negotiable).
2. `npm run lint` — must not introduce NEW problems over the pre-existing 153.
3. Confirm the stub is gone and no stray references remain:
   `grep -rn "fail2ban-adapter" src` (should print nothing).
4. Confirm the real adapter path is intact:
   `grep -rn "adapters/Fail2banAdapter" src` (should still show the
   `adapter-runtime.ts` import).

No schema or tool change is involved, so `npx tsx scripts/measure-prompt.ts`
is unaffected and not required for this change.

## Definition of done

- `src/adapters/security/fail2ban-adapter.ts` no longer exists.
- `src/adapters/security/index.ts` neither imports, registers, nor re-exports
  the stub, and its header comment no longer mentions fail2ban.
- `npm run build` and `npm run lint` (no new problems) pass.
- `src/lib/adapter-runtime.ts` and `src/lib/registration/security.ts` are
  byte-for-byte unchanged; `src/adapters/Fail2banAdapter.ts` is unchanged.
