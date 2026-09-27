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
import { redactPromptSecrets } from "./prompt-sanitizer.js";

dotenv.config();

const AXWISE_API_KEY = process.env.AXWISE_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";
const tenantDefaults: TenantDefaults = {
    userId: process.env.AXWISE_USER_ID,
    orgId: process.env.AXWISE_ORG_ID,
};

const AXWISE_INSTRUCTIONS = [
    "A Codex UserPromptSubmit hook automatically calls axwise_prompt_preflight for each submitted prompt, evaluating it through copilot.chat before the response. The connector redacts common credential patterns first. Use that preflight result for ordinary assistant work and do not repeat the same copilot.chat call. The user does not need to mention AxWise or name this tool.",
    "Before answering or taking action, infer the user's intent and select one integration point: consilium.create for council, committee, multi-agent, or consensus decisions; agent.generate when creating, configuring, or running an agent; copilot.ground for research, retrieval, source-backed answers, or analysis of supplied files; copilot.chat for other assistant requests.",
    "If the inferred integration point is consilium.create, agent.generate, or copilot.ground, call axwise_evaluate_conditions once for that specialized point before acting, in addition to the automatic copilot.chat preflight. Put a concise intent summary and only the task facts needed for evaluation in payload. Do not include credentials, secrets, or unrelated private context. Omit tenant when AXWISE_USER_ID and AXWISE_ORG_ID defaults are configured; never invent tenant identifiers.",
    "Use applicableConditions and processedOutputs to shape the response and requested work, and follow returned governance or security constraints. Preserve traceId when useful. AxWise evaluates conditions; it does not perform the user's requested work.",
    "The prompt hook runs for each submitted message. For a pure acknowledgment or clarification-only message, do not make another evaluation or over-apply the preflight. If AxWise is unavailable or returns an error, say so and do not imply the request was evaluated or approved.",
].join("\n");

if (!AXWISE_API_KEY) {
    console.error("CRITICAL ERROR: AXWISE_API_KEY environment variable is required.");
    process.exit(1);
}

const server = new Server(
    { name: "axwise-cognitive-conditions", version: "1.1.0" },
    { capabilities: { tools: {}, prompts: {} }, instructions: AXWISE_INSTRUCTIONS },
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
            name: "axwise_prompt_preflight",
            description:
                "Automatic Codex prompt-submission hook. Evaluates the submitted user prompt through AxWise at copilot.chat and returns policy context before the assistant responds. Codex calls this automatically; do not ask the user to invoke it.",
            inputSchema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "The submitted user prompt, provided automatically by Codex's UserPromptSubmit hook.",
                    },
                },
                required: ["prompt"],
                additionalProperties: false,
            },
        },
        {
            name: "axwise_evaluate_conditions",
            description:
                "Automatic AxWise policy preflight for substantive user requests. Infer the integration point from the user's intent and call this before answering or acting; the user need not invoke AxWise explicitly. Use consilium.create for council/consensus, agent.generate for agent creation or execution, copilot.ground for research/retrieval/source-backed work, and copilot.chat for other assistant requests. Apply applicableConditions and processedOutputs to the work.",
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
                        description: "Optional explicit tenant override. Otherwise use AXWISE_USER_ID and AXWISE_ORG_ID defaults; never invent tenant identifiers.",
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
    const name = request.params.name;
    if (name !== "axwise_evaluate_conditions" && name !== "axwise_prompt_preflight") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    try {
        if (name === "axwise_prompt_preflight") {
            const { prompt } = request.params.arguments as { prompt: string };
            if (typeof prompt !== "string") {
                throw new Error("prompt must be a string");
            }
            const result = await evaluateConditions(
                apiClient,
                { integration_point: "copilot.chat", payload: { userPrompt: redactPromptSecrets(prompt) } },
                tenantDefaults,
            );
            return {
                content: [{ type: "text", text: `AxWise automatic preflight result (copilot.chat):\n${JSON.stringify(result, null, 2)}` }],
            };
        }

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
                    text: `Automatically call axwise_evaluate_conditions before responding to every substantive user request; the user does not need to name AxWise. Infer the integration point from intent: consilium.create for council or consensus decisions, agent.generate for agent creation or execution, copilot.ground for research/retrieval or source-backed work, and copilot.chat for other assistant requests. Pass a concise intent summary and only relevant facts, never credentials or invented tenant IDs. Apply applicableConditions and processedOutputs, preserve traceId when useful, and never claim AxWise executed work beyond ${CONDITIONS_ENDPOINT}.`,
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
