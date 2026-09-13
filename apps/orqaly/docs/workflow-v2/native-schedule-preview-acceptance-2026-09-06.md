# Live native Build → Solution → scheduled execution acceptance

Verified on 6 September 2026 in the existing GCP preview. This is actual deployed-service and n8n execution evidence, not a mock or a documentation-only workflow.

## Result

The signed-in Orqaly interface created a new native Build from the existing task and Agent. AxWise generated its workflow; one real model repair corrected its response mode. The deployed worker tested the Build, and the reviewed workflow became an active Solution on isolated n8n runtime 003. An actual five-minute schedule became due at **2026-09-06 08:10:01.417 UTC**, the deployed worker executed it, and the acceptance operator then paused that schedule.

The Solution remains active and visible:

[Synthetic preview: scheduled text normalization](https://orqaly-v2-web-preview-161074549006.europe-west4.run.app/workspace/solutions/637fcfaf-3864-468b-ad36-47337b80c484)

| Evidence | Verified value |
| --- | --- |
| Build and Solution | `637fcfaf-3864-468b-ad36-47337b80c484` |
| Agent | `1155b480-afad-471f-aa05-ffa4046b4168` |
| Source task | `c1cb54ec-00f5-5106-b7ff-16acf5640c07` |
| Isolated environment | `orqaly-customer-webhook-preview-003` |
| Workflow hash | `aa8f04bbc9074dae28333eb49e6c81648311e6c5906078d9aa337f676c849ca6` |
| Deployed-worker Build test | Actual n8n execution **5**, succeeded; disposable test workflow removed |
| Release acceptance test | Actual n8n execution **6**, succeeded |
| Naturally due scheduled run | Actual n8n execution **7**, succeeded |
| Schedule | `2390ea95-68ff-4c7f-8060-009ba4577326`, **paused** after the observed run |
| Input | `{"text":"  preview schedule  "}` |
| Actual output | `{"text":"preview schedule"}` |

The Solution history contained exactly the release test and the scheduled production invocation. The scheduled receipt identified its actor as the exact schedule above; its persisted tick retained the original due time. No manual tick, timestamp adjustment, local worker claim or substitute execution result was used.

### Signed-in UI readback

After completion, the real signed-in Chrome session opened this Solution and
verified its active v1, isolated runtime003 and embedded native n8n canvas
(Webhook → Edit Fields → Respond to Webhook). **Test & use** showed the exact
acceptance schedule as **paused**, with its latest run succeeded. **Execution
history** showed the release test6 and automatically triggered production
execution7. Expanding the saved evidence showed input
`{"text":"  preview schedule  "}`, output `{"text":"preview schedule"}`,
HTTP200, the exact schedule actor and the workflow hash above. The invocation
was `0d4da77e-f792-4d80-81ac-c8f1a8743f8f`, created at
`2026-09-06T08:10:01.805Z` and completed at `2026-09-06T08:10:02.082Z`.
This was a separate actual browser readback, not a synthetic UI fixture.
The retained Solution tab is left open on this evidence for inspection.

## What actually ran

```text
Signed-in Orqaly UI: Agent → existing task → Prepare workflow
                         │
                         ▼
       Real API validates owner and reads the private Agent service
                         │
                         ▼
              Durable Build → deployed AxWise design
                         │
           Runtime validation rejects firstIncomingItem
                         │
              One real, bounded model repair request
                         │
                         ▼
          Exact JSON business contract remains unchanged
                         │
            Queued test → deployed worker → n8n #5
                         │
             Review exact hash → create Solution
                         │
         Stage inactive → actual release test n8n #6
                         │
                    Approve activation
                         │
           Create five-minute schedule; wait for real due time
                         │
               Deployed worker → n8n #7 → saved receipt
                         │
                   Pause this schedule only
```

The generated graph was structurally valid but initially used `Respond to Webhook.respondWith = firstIncomingItem`. The authoritative execution policy correctly blocked it with `RUNTIME_RESPONSE_TYPE`; it requires an explicit JSON business response. The operator requested a repair through the existing Build repair service, rather than replacing native JSON by hand. The repaired candidate passed the unchanged execution policy. Its requirements, input schema, output schema, acceptance cases and runtime profile remained byte-canonically unchanged.

There were **two design attempts total**: the initial design and one corrective model attempt. The successful attempt was independently checked against its durable envelope and `design_completed` event:

| Design provenance | Value |
| --- | --- |
| Completed operation | `7982da3b-c97c-55aa-bdd8-997608b07283` |
| Canonical operation input hash | `e0086a7c1283a993059d67d6de426a6f561414f094251a1c49edc7bd5da739e3` |
| Prepared result hash | `45fb4dc0c602b52d3a98b8da28309461968340f0a39f4a0cc466060248c45fe6` |
| Exact requested instruction hash | `50997767f0c23c652865cc67d48f1d19596642561f73f688901509fc0c7110d9` |
| Build creation request hash | `a7accd324b8988a18c5a5a14b5670bf391db2d6cc8a8fbd89f554e5e8963ddf2` |
| Pinned Agent profile hash | `c91f1d6fcb52f0ef5f6d29b14fb2d62df3d2aece51edaae715ae030376ecf4b6` |

## Authentication and evidence boundary

Creation was genuinely performed through the signed-in browser and Orqaly API. That API, not the operator, made the authorized private Agent-service read. An earlier direct operator attempt stopped before creation because the private Agent service accepts only the Orqaly API service identity. No IAM grant, service-account impersonation, fake Agent profile or database workaround was used.

Subsequent repair, test request, review, handoff, deployment, activation and schedule requests used the actual production service methods through a restricted **existing API database role**. These later steps are operator-driven service acceptance, not claims that every button was clicked in the browser. The operator did not hold the worker database role, superuser privileges or an RLS-bypass role. It verified the exact tenant/user/task/Agent and instruction before adopting the UI-created Build. It did not create another Build.

The deployed workers, not a local worker loop, performed the model dispatch, queued Build test and naturally due schedule. The output checks used actual correlated n8n execution IDs and immutable workflow/test evidence. The acceptance contained no provider credentials, no external provider calls and no application-key issuance. Google identity was transport-only for private n8n management/invocation; it was not stored in n8n credential data.

## Deployment and preservation

The operator verified the API and worker each served their exact `exec-7b330159` revision at 100% traffic with this image:

```text
europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-execution@sha256:c16d032de3271fe40a658ad96a43ae5c3a9ea061b41c978dad1185a81974afc5
```

Both had native building and scheduling enabled, with the scheduling allowlist containing only runtime 003, and the explicitly pinned aggregate environment secret version 2. The runtime source paths were checked against commit `7b330159069b426730183ffb55ae68a90e19e2ff`; later frontend-only commits did not alter those runtime files.

Runtime 003 used the previously reviewed custom n8n image:

```text
sha256:245aab7912f5fa74547ef832ddc2ed195176260ee16767e25a4769c72812bee2
```

Before and after, the operator compared hashes of the existing 001/002 customer Solutions, revisions, revision events and invocation history, plus the existing 001/002 runtime configuration and IAM metadata. All were unchanged. Only the new Build/Solution and its associated tests and schedule were exercised. The owned loopback Cloud SQL proxy was closed afterward.

## Scope of this proof

This proves the deployed native authoring, real model repair, validation, durable test dispatch, review/handoff, isolated release and scheduled execution path for this explicitly provider-free JSON workflow. It does not by itself prove arbitrary external integrations, all node types, every repair strategy or browser interaction for every lifecycle action.

The schedule is paused; the Solution is retained for inspection and deliberate future use. The operator's ordinary-error and graceful-signal cleanup pauses its exact schedule, including recovery from a lost creation response. A hard process/host loss still requires an operator to pause the exact logged schedule; the smoke harness does not claim crash-proof automatic single-run stopping.

## Reproducibility

- Operator: `scripts/native-schedule-preview-e2e.mjs`.
- Local guard tests: `scripts/native-schedule-preview-e2e.test.mjs`, **10/10 passed**, plus syntax/lint.
- Successful live execution session: `91401`, exit code **0**.
- The operator intentionally refuses to restart the completed/assigned acceptance Build. Do not rerun it to create another schedule or repeat effects. Inspect the retained Solution and persisted history instead.
