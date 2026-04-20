#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ErrorCode,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const AXWISE_API_KEY = process.env.AXWISE_API_KEY;
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8000";

if (!AXWISE_API_KEY) {
    console.error("CRITICAL ERROR: AXWISE_API_KEY environment variable is required.");
    process.exit(1);
}

const server = new Server(
    {
        name: "axwise-engine",
        version: "1.0.0",
    },
    {
        capabilities: {
            resources: {},
            tools: {},
            prompts: {},
        },
    }
);

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "X-AxWise-Api-Key": AXWISE_API_KEY,
        "Content-Type": "application/json",
    },
});

// Setup Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "axwise://context/twin",
                name: "AxWise Digital Twin Context",
                description: "Provides the stakeholder profiling context of the current user.",
                mimeType: "text/markdown",
            },
        ],
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== "axwise://context/twin") {
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${request.params.uri}`);
    }

    try {
        const response = await axiosInstance.get("/api/v1/mcp/twin");
        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: "text/markdown",
                    text: response.data.twin_context,
                },
            ],
        };
    } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, `Failed to fetch twin context: ${error?.message}`);
    }
});

// Setup Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "axwise_map_stakeholders",
                description: "Crucial: Call this tool during your Extended Thinking/Reasoning phase whenever the user asks for business, product, or communication advice. Pass a 1-sentence anonymized summary of their goal.",
                inputSchema: {
                    type: "object",
                    properties: {
                        anonymized_intent: {
                            type: "string",
                            description: "A 1-sentence anonymized summary of the user's generic workplace intent.",
                        },
                    },
                    required: ["anonymized_intent"],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "axwise_map_stakeholders") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }

    const anonymized_intent = request.params.arguments?.anonymized_intent;
    if (!anonymized_intent || typeof anonymized_intent !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "anonymized_intent is required and must be a string");
    }

    try {
        const response = await axiosInstance.post("/api/v1/mcp/session/stakeholders", {
            anonymized_intent,
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response.data, null, 2),
                },
            ],
        };
    } catch (error: any) {
        const errorDetails = error.response?.data?.detail || error.message;
        throw new McpError(ErrorCode.InternalError, `Failed to map stakeholders: ${errorDetails}`);
    }
});

// Setup Prompts (Phase 4)
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: [
            {
                name: "axwise_session_start",
                description: "Start a session with AxWise behavioral middleware injected.",
            },
        ],
    };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "axwise_session_start") {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${request.params.name}`);
    }

    const overridePrompt = `[AXWISE MIDDLEWARE ENGAGED]
You are operating as an AxWise-enhanced agent. You must allocate your reasoning/thinking budget to execute the following pipeline before outputting a response:

Identity Sync: Read the axwise://context/twin resource to understand my exact role, constraints, and the delivery pressures I am under.

Stakeholder Mapping: Extract the core intent of my prompt/image. Anonymize it, and immediately call the axwise_map_stakeholders tool to understand who I am presenting this to.

Constraint Enforcement: Work AGAINST your default LLM behavior. Do NOT give generic, empathetic, or academic UX advice.

Synthesis (Inside Thinking Block): Translate my technical/UX insights strictly into the business language, KPIs, and risk-mitigation framing demanded by the stakeholder profile you just generated.

Output: Give me the script, the mathematical framing, or the exact code required to win this argument. Keep it brief and ruthless.`;

    return {
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: overridePrompt,
                },
            },
        ],
    };
});

// Start Server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("AxWise MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
