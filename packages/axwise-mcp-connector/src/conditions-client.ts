import { randomUUID } from "node:crypto";
import type { AxiosInstance } from "axios";

export const CONDITIONS_ENDPOINT = "/api/orqaly-axwise/v1/conditions/evaluate";

export const INTEGRATION_POINTS = [
    "consilium.create",
    "agent.generate",
    "copilot.chat",
    "copilot.ground",
] as const;

export type IntegrationPoint = (typeof INTEGRATION_POINTS)[number];

export interface TenantContext {
    userId: string;
    orgId: string;
}

export interface TenantDefaults {
    userId?: string;
    orgId?: string;
}

export interface ConditionsToolArguments {
    integration_point: IntegrationPoint;
    payload: Record<string, unknown>;
    tenant?: TenantContext;
    request_id?: string;
    hints?: Record<string, unknown>;
}

export interface ConditionsRequest {
    integrationPoint: IntegrationPoint;
    requestId: string;
    tenant: TenantContext;
    payload: Record<string, unknown>;
    hints?: Record<string, unknown>;
}

export function buildConditionsRequest(
    args: ConditionsToolArguments,
    defaults: TenantDefaults = {},
): ConditionsRequest {
    if (!args || !INTEGRATION_POINTS.includes(args.integration_point)) {
        throw new Error(`integration_point must be one of: ${INTEGRATION_POINTS.join(", ")}`);
    }
    if (!args.payload || typeof args.payload !== "object" || Array.isArray(args.payload)) {
        throw new Error("payload must be an object");
    }

    const tenant = args.tenant || {
        userId: defaults.userId || "",
        orgId: defaults.orgId || "",
    };
    if (!tenant.userId || !tenant.orgId) {
        throw new Error(
            "tenant.userId and tenant.orgId are required, either as tool input or AXWISE_USER_ID/AXWISE_ORG_ID",
        );
    }

    return {
        integrationPoint: args.integration_point,
        requestId: args.request_id || randomUUID(),
        tenant,
        payload: args.payload,
        ...(args.hints ? { hints: args.hints } : {}),
    };
}

export async function evaluateConditions(
    client: AxiosInstance,
    args: ConditionsToolArguments,
    defaults: TenantDefaults = {},
): Promise<unknown> {
    const request = buildConditionsRequest(args, defaults);
    const response = await client.post(CONDITIONS_ENDPOINT, request);
    return response.data;
}
