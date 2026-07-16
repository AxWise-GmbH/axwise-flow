import assert from "node:assert/strict";
import test from "node:test";

import {
    CONDITIONS_ENDPOINT,
    buildConditionsRequest,
} from "../build/conditions-client.js";

test("targets the supported cognitive-conditions endpoint", () => {
    assert.equal(CONDITIONS_ENDPOINT, "/api/orqaly-axwise/v1/conditions/evaluate");
});

test("maps MCP arguments into the backend contract and preserves tenant scope", () => {
    const request = buildConditionsRequest({
        integration_point: "copilot.chat",
        request_id: "req-42",
        tenant: { userId: "user-1", orgId: "org-1" },
        payload: { message: "Review this operational decision" },
    });

    assert.deepEqual(request, {
        integrationPoint: "copilot.chat",
        requestId: "req-42",
        tenant: { userId: "user-1", orgId: "org-1" },
        payload: { message: "Review this operational decision" },
    });
});

test("requires a complete tenant scope", () => {
    assert.throws(
        () => buildConditionsRequest({ integration_point: "agent.generate", payload: {} }),
        /tenant\.userId and tenant\.orgId are required/,
    );
});
