# CI/CD Adapters — Phase 5

## Overview

Phase 5 implements adapters for CI/CD services across the homelab:
- GitLab CE (git.hively.dev)
- GitLab Runner x2 (gh-git and gh-ai)
- GitHub Actions Runner (gh-arm)
- Ansible (via GitLab CI)

## Adapters Created

### 1. GitLab CE Adapter (`src/adapters/cicd/gitlab.ts`)

**Host:** gh-git (Tailscale: vmi1825965.contaboserver.net)
**API:** https://git.hively.dev/api/v4
**Auth:** GitLab PAT from 1Password "Gitlab PAT Gregory"

**Query Types:**
- `overview` — Projects, pipelines, runners summary
- `projects` — All projects with pipeline stats
- `pipelines` — Recent pipeline history
- `mrs` — Open merge requests
- `runners` — Runner fleet status

**Capabilities:**
- Project metadata (stars, forks, last activity)
- Pipeline success rate and duration
- MR status and age
- Runner fleet health

### 2. GitLab Runner Adapter (`src/adapters/cicd/gitlab-runner.ts`)

**Host:** gh-git
**Target:** GitLab Runner fleet (2 runners: id=8, id=11)

**Query Types:**
- `overview` — Runner fleet summary
- `jobs` — Recent job history across runners
- `runners` — Detailed runner status

**Capabilities:**
- Runner online/offline status
- Active/idle/busy counts
- Job status breakdown
- Job duration tracking

### 3. GitLab Runner AI Adapter (`src/adapters/cicd/index.ts`)

**Host:** gh-ai (Tailscale: 100.92.162.32)
**Status:** Deregistered, pending cleanup

**Query Types:**
- `overview` — Runner registration status

**Capabilities:**
- Tracks deregistered runner state
- Cleanup reminder

### 4. GitHub Actions Adapter (`src/adapters/cicd/github-actions.ts`)

**Host:** gh-arm (Tailscale reachable)
**API:** https://api.github.com
**Auth:** GitHub PAT from 1Password "GitHub Personal Access Token"

**Query Types:**
- `overview` — Runner fleet and repo count
- `runners` — Self-hosted runner details
- `workflows` — Recent workflow runs (per repo)

**Capabilities:**
- Runner online/idle/busy status
- OS and label information
- Workflow status tracking
- Success/failure metrics

### 5. Ansible Adapter (`src/adapters/cicd/ansible.ts`)

**Host:** gh-ai (via GitLab CI for homelab-ansible)
**API:** GitLab API for pipeline queries

**Query Types:**
- `overview` — Roles, success rate, recent pipelines
- `pipelines` — Pipeline execution history
- `roles` — Ansible role inventory
- `drift` — Infrastructure drift detection (failed pipelines)

**Capabilities:**
- Role count from GitLab repo
- Pipeline success rate
- 24-hour activity metrics
- Drift detection via failed pipelines

## Adapter Registry

All adapters are registered in `src/adapters/cicd/index.ts`:

```typescript
import { cicdAdapters, listCicdAdapters } from "../src/adapters/cicd";

const adapters = listCicdAdapters();
// Returns: [
//   { name: "gitlab", serviceName: "GitLab CE (gh-git)", host: "gh-git" },
//   { name: "gitlab-runner", serviceName: "GitLab Runner (gh-git)", host: "gh-git" },
//   { name: "gitlab-runner-ai", serviceName: "GitLab Runner (gh-ai)", host: "gh-ai" },
//   { name: "github-actions", serviceName: "GitHub Actions Runner", host: "gh-arm" },
//   { name: "ansible", serviceName: "Ansible (homelab-ansible)", host: "gh-ai" },
// ]
```

## Base Infrastructure

### Types (`src/adapters/types.ts`)
- `ServiceAdapter` — Base contract
- `FreshnessInfo` — Query metadata
- `VisualQueryResult` — Standardized output shape
- Zod schemas for validation

### 1Password Integration (`src/adapters/onepassword.ts`)
- Credential resolution from 1Password CLI
- Environment variable fallbacks
- Required items:
  - "Gitlab PAT Gregory" → `GITLAB_TOKEN`
  - "GitHub Personal Access Token" → `GITHUB_TOKEN`

### HTTP Client (`src/adapters/base-client.ts`)
- Timeout support (10-15s)
- Token auth via `Authorization` header
- Error wrapping with context

## Build & Verification

```bash
cd /home/ghively/.hermes/kanban/workspaces/t_613404f6/homelab-dashboard
npm run build  # ✓ Compiles successfully
npm run lint   # ✓ No lint errors
```

### Verification Script

`scripts/verify-cicd-adapters.ts` validates adapter registration:

```bash
npx tsx scripts/verify-cicd-adapters.ts
```

## Dependencies

All adapters use only existing dependencies:
- `zod` — Schema validation
- Node `fetch` — HTTP requests

No new packages required.

## Known Limitations

### Credential Availability
The adapters require real PATs for end-to-end verification:
- GitLab PAT is available in 1Password "Gitlab PAT Gregory"
- GitHub PAT placeholder exists but may not be configured

### Lan-Only Services
The adapters query APIs over Tailscale; some services are LAN-only:
- GitLab: Tailscale-only access (gh-git)
- GitHub: Public API, no LAN restriction
- Ansible: GitLab API, no direct Ansible control

### Ansible Specifics
Ansible adapter queries GitLab pipelines for `homelab-ansible` project:
- Does NOT execute playbooks directly
- Infrastructure drift detected via failed pipelines
- Role inventory parsed from GitLab repo tree

## Next Steps

### Integration with Dashboard
Wire adapters into the API route:
```typescript
// app/api/chat/route.ts
import { cicdAdapters } from "../adapters/cicd";
```

### Runtime Testing
With credentials configured:
1. Set `GITLAB_TOKEN` and `GITHUB_TOKEN` in environment
2. Test `health()` for each adapter
3. Test `query()` with various query types
4. Verify freshness metadata and state mapping

### Documentation Updates
- Update README.md with CI/CD adapter usage
- Add adapter discovery endpoints
- Document query parameters and response shapes