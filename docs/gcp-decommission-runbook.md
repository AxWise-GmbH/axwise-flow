# GCP Compute Decommissioning Runbook

## Overview
This runbook covers the safe decommissioning of idle and redundant Cloud Run compute workloads across two Google Cloud projects:
- `axwise-v2-preview-001` (Preview & Development environment)
- `axwise-73425` (Production & Core Legacy environment)

## Protected Services (Never Decommission)
The following workloads handle active user traffic, desktop releases, and database operations. They are hard-coded into the script's protection list and will never be modified or deleted:

| Service / Resource | Project | Region | Role |
| :--- | :--- | :--- | :--- |
| `orqaly-v2-web-preview` | `axwise-v2-preview-001` | `europe-west4` | Landing page, desktop release downloads, web UI |
| `orqaly-v2-api-preview` | `axwise-v2-preview-001` | `europe-west4` | Orqaly runtime & desktop backend API |
| `orqaly-v2-worker-preview` | `axwise-v2-preview-001` | `europe-west4` | Active preview task execution |
| `orqaly-v2-preview-001-pg` | `axwise-v2-preview-001` | `europe-west4-c` | Cloud SQL PostgreSQL 16 database |
| `axwise-flow` | `axwise-73425` | `europe-west4` | Production web application frontend |
| `axwise-backend` | `axwise-73425` | `europe-west4` | Production backend API |
| `axwise-postgres` | `axwise-73425` | `europe-west4-b` | Production Cloud SQL PostgreSQL database |

---

## Candidates for Decommissioning

### 1. `axwise-v2-preview-001`
- `axwise-v2-preview`: Superseded by `orqaly-v2-web-preview`.
- `axwise-v2-search-preview`: Legacy SearxNG preview container, unreferenced since August 2026.
- `axwise-v2-worker-preview`: Superseded by `orqaly-v2-worker-preview`.
- `orqaly-agentic-n8n-preview`: Standalone test instance from early September 2026.

### 2. `axwise-73425`
- `axwise-searxng`: Redundant search engine deployment from August 2026.
- `axwise-orqaly-scope-worker`: Superseded worker instance.
- `axwise-orqaly-worker`: Superseded worker instance.

---

## Automation Script

The script is located at:
`scripts/gcp-decommission-idle-compute.sh`

### Safe Dry-Run (Default)
Inspects the live state of both projects and verifies service existence without making changes:
```bash
./scripts/gcp-decommission-idle-compute.sh --dry-run
```

### Apply Decommissioning
Prompts for confirmation before issuing deletions:
```bash
./scripts/gcp-decommission-idle-compute.sh --apply
```
