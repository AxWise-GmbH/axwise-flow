#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    ListToolsRequestSchema,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

import {
    CONDITIONS_ENDPOINT,
    evaluateConditions,
    type ConditionsToolArguments,
    type TenantDefaults,
} from "./conditions-client.js";

dotenv.config();

const AXWISE_API_KEY = process.env.AXWISE_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
const tenantDefaults: TenantDefaults = {
    userId: process.env.AXWISE_USER_ID,
    orgId: process.env.AXWISE_ORG_ID,
};

if (!AXWISE_API_KEY) {
    console.error("CRITICAL ERROR: AXWISE_API_KEY environment variable is required.");
    process.exit(1);
}

const server = new Server(
    { name: "axwise-cognitive-conditions", version: "1.1.0" },
    { capabilities: { tools: {}, prompts: {} } },
);

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "x-axwise-key": AXWISE_API_KEY,
        "Content-Type": "application/json",
    },
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "axwise_evaluate_conditions",
            description:
                "Evaluate a scoped orchestration event through AxWise for governance, persona/tone, security, classification, or grounding outputs.",
            inputSchema: {
                type: "object",
                properties: {
                    integration_point: {
                        type: "string",
                        enum: ["consilium.create", "agent.generate", "copilot.chat", "copilot.ground"],
                        description: "The orchestration event whose conditions should be evaluated.",
                    },
                    payload: {
                        type: "object",
                        description: "Local facts for the selected integration point.",
                        additionalProperties: true,
                    },
                    tenant: {
                        type: "object",
                        description: "Explicit tenant scope. May be omitted when AXWISE_USER_ID and AXWISE_ORG_ID are configured.",
                        properties: {
                            userId: { type: "string" },
                            orgId: { type: "string" },
                        },
                        required: ["userId", "orgId"],
                        additionalProperties: false,
                    },
                    request_id: {
                        type: "string",
                        description: "Optional UUID used for tracing and idempotency; generated when omitted.",
                    },
                    hints: {
                        type: "object",
                        additionalProperties: true,
                    },
                },
                required: ["integration_point", "payload"],
                additionalProperties: false,
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "axwise_evaluate_conditions") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    try {
        const result = await evaluateConditions(
            apiClient,
            request.params.arguments as unknown as ConditionsToolArguments,
            tenantDefaults,
        );
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    } catch (error: any) {
        const status = error.response?.status;
        const detail = error.response?.data?.detail || error.message;
        const prefix = status ? `AxWise returned HTTP ${status}` : "AxWise request failed";
        throw new McpError(ErrorCode.InternalError, `${prefix}: ${detail}`);
    }
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
        {
            name: "axwise_cognitive_gate",
            description: "Use AxWise as a policy and cognitive decision point for an orchestration event.",
        },
    ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "axwise_cognitive_gate") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${request.params.name}`);
    }

    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `When an orchestration decision needs governance, security, persona/tone, classification, or grounding, call axwise_evaluate_conditions. Select the integration point that matches the event and pass only the facts needed for that decision. Treat applicableConditions and processedOutputs as decision support, preserve the returned traceId, and never claim that AxWise executed work beyond ${CONDITIONS_ENDPOINT}.`,
                },
            },
        ],
    };
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`AxWise MCP connector running on stdio; gateway=${CONDITIONS_ENDPOINT}`);
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
