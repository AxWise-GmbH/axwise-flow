# AxWise MCP connector

This stdio MCP server exposes the repository's implemented cognitive-conditions contract to MCP clients. It does not expose a digital-twin resource or stakeholder-mapping endpoint because those routes are not part of the current backend.

## Supported tool

`axwise_evaluate_conditions` calls:

`POST /api/orqaly-axwise/v1/conditions/evaluate`

Supported integration points are `consilium.create`, `agent.generate`, `copilot.chat`, and `copilot.ground`. The response contains applicable audit markers, processed decision outputs, and trace/cost/latency metadata. It evaluates an orchestration decision; it does not execute the downstream task.

## Configuration

Required:

- `AXWISE_API_KEY`: must match the backend value.

Optional:

- `API_BASE_URL`: defaults to `http://localhost:8000`.
- `AXWISE_USER_ID` and `AXWISE_ORG_ID`: default tenant scope. If omitted, every tool call must include `tenant.userId` and `tenant.orgId`.

Build and verify with `npm test`. Start with `npm start` after building.
