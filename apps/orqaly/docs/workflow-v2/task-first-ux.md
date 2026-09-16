# Task-first Agent UX

## Customer journey

Assistant request → named Agent → task status → requested deliverable or required approval.

Optional detail is revealed on demand:

- Plan & activity: actual immutable plan tasks, exact-ID-matched stage statuses, dependencies, saved-output indicators and scope/plan checkpoints. Independent steps are not presented as serial n8n nodes.
- Task brief & boundaries: approved scope, assumptions, audiences and non-goals.
- Agent permissions & task context: saved executor contract, memory limits and capability boundaries.
- Technical execution details: immutable document hash, run ID, internal n8n action and existing signed receipt.

The internal operational-record action is a diagnostic of the approval/n8n/Gateway path. It is not the requested business task, and its success does not make a document verified or launch-ready. No business connector is enabled by this UI release.

## Identity and lifecycle

Chat uses the directory Agent avatar only when its ID matches the saved task Agent. The task's saved name and executor contract remain authoritative for that assignment. Profile links connect chat to the independent Agent profile.

The composer identifies the recent task and links to task controls; this is not a new run-bound conversational mutation protocol. Message routing and new-assignment selection are unchanged.

Agent directory entries precede infrastructure detail. The profile page prioritizes tasks and results. “Pause new assignments” does not stop running tasks. Reusable profiles do not imply long-term memory: retrieval is not connected. Temporary profiles still have preview expiry rather than task-end cleanup.

## Security and deployment boundary

Frontend-only change. No API, database, credentials, n8n workflow, tool gateway or IAM changes. Scope/plan approval hashes, row-version checks, retries, receipt verification and immutable Markdown ETag verification remain in place. Collapsing diagnostic detail does not delete or rerun its saved action.

## Verification

- Component/API-client/contract regression suites cover task projections, approvals, stale responses, lifecycle versions, saved receipts, disclosure behavior and the customer composer.
- New presentation tests reject title/key-only progress matching and place dependencies before synthesis.
- GCP production build must pass the retained import-graph and bundle-size gate.
- Live verification should use the existing task read-only: open/close its deliverable, inspect its actual plan and saved receipt, follow the Agent profile, and reload. Do not approve or rerun the internal record for a visual test.

## Deliberately not added

External SMS/GitHub actions, customer-editable arbitrary n8n workflows, a VM per Agent, cross-task memory retrieval, active-task suspension, automatic temporary-Agent cleanup and ordinary-chat task mutation. These require backend work and must not be implied by presentation changes.
