# Google-native Agent environments and tenant isolation

Researched 2026-09-05 against Google's current primary documentation.

| Option | Appropriate role in Orqaly | Decision |
| --- | --- | --- |
| Cloud Run service per solution + dedicated database identity | Persistent, webhook-driven self-hosted n8n deliverable | First approved preview environment; IAM-protected ingress, explicit identity and bounded capacity |
| GKE Agent Sandbox | Stateful, isolated coding/Agent workspaces with stable identity/storage, sandbox claims and warm pools | Strong candidate when software-build workers and interactive environments are implemented; do not create a cluster for the first webhook |
| Gemini Enterprise Agent Platform Agent Runtime (Agent Engine documentation now redirects here) | Managed hosting of overarching agents; sessions, memory, evaluation, observability | Evaluate as an optional hosting adapter for Orqaly/AxWise, not a substitute for customer-owned n8n workflows |
| Agent Platform custom-container sandboxes | Managed, on-demand custom tool/code environments | Preview feature; evaluate dependencies, lifecycle, region and pricing before adoption |
| Cloud Run sandboxes | Isolated tool/code execution inside a second-generation Cloud Run instance | Preview feature; shares that instance's allocated CPU/memory, not a separate durable customer environment |

Google documents GKE Agent Sandbox as a managed controller for isolated stateful
single-replica workloads. It provides claims/templates, stable endpoints/storage,
warm pools and default-deny networking. Full feature support requires GKE
1.35.2-gke.1269000 or later; some underlying snapshot capabilities have preview or
regional restrictions. The add-on has no additional charge, but GKE resources do.
[Overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/machine-learning/agent-sandbox),
[setup and costs](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox).

Agent Platform provides a managed Agent runtime, session and memory services and
sandbox execution. Its custom-container sandbox feature is Preview. None of these
automatically maps Clerk customers to secure tenant scopes or implements our
approval, context-routing or solution ownership rules.
[Managed platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale),
[custom containers](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/sandbox/custom-containers).

Session IAM Conditions support user-ID restrictions, but Google's documentation
explicitly excludes ListSessions from conditional support. A shared Orqaly backend
must enforce authenticated tenant filters; it must not give customers a broad
listing role and assume session-level conditions protect all operations.
[Session access controls](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/sessions/iam-conditions).

Cloud Run sandboxes are Preview and execute inside the service instance using its
allocated CPU and memory. They are a candidate for bounded tool execution, not
evidence that n8n database persistence or customer isolation has been solved.
[Cloud Run sandboxes](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes).

## Production boundary versus today's approved preview

Google's guidance for platforms hosting **untrusted customer code** recommends a
project per tenant, separating first-party and customer-code projects into
different folders. It cautions that a container alone is insufficient and calls
for restricted identities and automated tenant onboarding. Multiple tenants in
one project need careful fine-grained permissions and encounter shared quotas.
[Multi-tenant Cloud Run guidance](https://docs.cloud.google.com/run/docs/securing/multi-tenant).

Today's authorization is one customer-scoped environment in the existing preview
project, not creation of an organization, project fleet or GKE cluster. The first
capability accepts only typed field mappings; arbitrary code and outbound URLs
are not supported. Dedicated service/database/secret identities reduce the
preview blast radius but are not claimed to equal project-per-tenant isolation.

```text
Orqaly / AxWise control plane
  authenticated customer -> scoped Agent -> approved Solution version
                                |
              +-----------------+------------------+
              |                                    |
    Build-time workspace                    Delivered runtime
    GKE/managed sandbox candidate           n8n + durable database
    temporary code/tools/tests              endpoint, runs, schedule*
              |                                    |
              +---------- evidence ----------------+
                                |
                     Customer controls in Orqaly

* Schedules require a separately approved background-runtime design.
```

Recommendation: retain a provider-neutral environment binding contract. Ship and
verify the first actual n8n solution on Cloud Run, then evaluate GKE Agent Sandbox
for code workers and project-per-tenant provisioning before arbitrary customer
code or broad multi-customer deployment. Do not migrate the working Orqaly/AxWise
control plane merely because another product has “Agent” in its name.
