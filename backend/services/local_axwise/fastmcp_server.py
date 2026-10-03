"""Pure-Python FastMCP server for Axwise Local product discovery and PRD specialist tools."""
from __future__ import annotations

import argparse
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

from backend.services.local_axwise.configuration import (ConfigurationError, RuntimeConfiguration, load_runtime_configuration)
from backend.services.local_axwise.engine import execute_tool
from backend.services.local_axwise.kernel import DESCRIPTIONS

mcp = FastMCP(
    name="axwise-local",
    instructions="""Optional local Axwise specialist tools for product discovery, synthetic personas, interviews, analysis, PRDs and delivery briefs.

PRESENTATION & CHAT DISPLAY RULE:
Always display the full generated artifact content (discovery plan, personas, interview analysis, PRD, or delivery brief) directly in the chat response for the user to read immediately. Do not hide, truncate, or reduce the document to just a file path or three bullets unless the user explicitly requests a brief summary.

STORAGE & REFERENCES:
Artifacts are automatically indexed in embedded SQLite (~/.axwise/state/axwise.db) and saved as local Markdown files.
References between steps are resolved automatically to the latest compatible artifacts in the session when omitted.""",
)


_runtime_configuration: RuntimeConfiguration | None = None
_provider = None


def configure_runtime(config_path=None, *, state_dir=None) -> RuntimeConfiguration:
    """Read host-owned settings once at startup; no credentials or model calls."""
    global _runtime_configuration, _provider
    _runtime_configuration = load_runtime_configuration(config_path, state_dir=state_dir)
    _provider = None
    return _runtime_configuration


def runtime_configuration() -> RuntimeConfiguration:
    global _runtime_configuration
    if _runtime_configuration is None:
        configure_runtime()
    return _runtime_configuration


async def _execute(tool_name: str, raw_input: dict[str, Any]):
    global _provider
    config = runtime_configuration()
    if _provider is None:
        _provider = config.create_provider()
    return await execute_tool(tool_name, raw_input, session_id=config.scope_id,
                              provider=_provider, state_dir=config.state_dir)


def _desc(name: str) -> str:
    return (
        DESCRIPTIONS[name]
        + " Returns the full generated Markdown document. Present the complete artifact content directly in your chat response."
    )


@mcp.tool(name="prepare_discovery", description=_desc("prepare_discovery"))
async def prepare_discovery(
    brief: str,
    depth: str = "standard",
    sources: Optional[list[dict[str, Any]]] = None,
    region: Optional[str] = None,
    exclusions: Optional[list[str]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "brief": brief,
        "depth": depth,
    }
    if sources:
        raw_input["sources"] = sources
    if region:
        raw_input["region"] = region
    if exclusions:
        raw_input["exclusions"] = exclusions
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("prepare_discovery", raw_input)
    return result["content"]


@mcp.tool(name="research_market", description=_desc("research_market"))
async def research_market(
    brief: str,
    depth: str = "standard",
    sources: Optional[list[dict[str, Any]]] = None,
    questions: Optional[list[str]] = None,
    region: Optional[str] = None,
    exclusions: Optional[list[str]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "brief": brief,
        "depth": depth,
    }
    if sources:
        raw_input["sources"] = sources
    if questions:
        raw_input["questions"] = questions
    if region:
        raw_input["region"] = region
    if exclusions:
        raw_input["exclusions"] = exclusions
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("research_market", raw_input)
    return result["content"]


@mcp.tool(name="generate_personas", description=_desc("generate_personas"))
async def generate_personas(
    brief: Optional[str] = None,
    depth: str = "standard",
    stakeholders: Optional[list[dict[str, Any]]] = None,
    sources: Optional[list[dict[str, Any]]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "depth": depth,
    }
    if brief:
        raw_input["brief"] = brief
    if stakeholders:
        raw_input["stakeholders"] = stakeholders
    if sources:
        raw_input["sources"] = sources
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("generate_personas", raw_input)
    return result["content"]


@mcp.tool(name="simulate_interviews", description=_desc("simulate_interviews"))
async def simulate_interviews(
    depth: str = "standard",
    scenario: Optional[str] = None,
    targetAudience: Optional[str] = None,
    problem: Optional[str] = None,
    stakeholders: Optional[list[dict[str, Any]]] = None,
    seed: int = 0,
    responseStyle: str = "mixed",
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "depth": depth,
        "seed": seed,
        "responseStyle": responseStyle,
    }
    if scenario:
        raw_input["scenario"] = scenario
    if targetAudience:
        raw_input["targetAudience"] = targetAudience
    if problem:
        raw_input["problem"] = problem
    if stakeholders:
        raw_input["stakeholders"] = stakeholders
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("simulate_interviews", raw_input)
    return result["content"]


@mcp.tool(name="chat_with_persona", description=_desc("chat_with_persona"))
async def chat_with_persona(
    personaId: str,
    message: str,
    depth: str = "standard",
    documentReference: Optional[dict[str, Any]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "personaId": personaId,
        "message": message,
        "depth": depth,
    }
    if documentReference:
        raw_input["documentReference"] = documentReference
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("chat_with_persona", raw_input)
    return result["content"]


@mcp.tool(name="analyze_interviews", description=_desc("analyze_interviews"))
async def analyze_interviews(
    decisionQuestion: str,
    depth: str = "standard",
    questions: Optional[list[str]] = None,
    transcripts: Optional[list[dict[str, Any]]] = None,
    outputs: Optional[list[str]] = None,
    views: Optional[list[str]] = None,
    hostContext: Optional[dict[str, Any]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "decisionQuestion": decisionQuestion,
        "depth": depth,
        "outputs": outputs or ["jobs_pains"],
    }
    if questions:
        raw_input["questions"] = questions
    if transcripts:
        raw_input["transcripts"] = transcripts
    if views:
        raw_input["views"] = views
    if hostContext is not None:
        raw_input["hostContext"] = hostContext
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("analyze_interviews", raw_input)
    return result["content"]


@mcp.tool(name="create_prd", description=_desc("create_prd"))
async def create_prd(
    brief: str,
    depth: str = "standard",
    artifactType: str = "product_prd",
    sources: Optional[list[dict[str, Any]]] = None,
    analysisArtifact: Optional[dict[str, Any]] = None,
    revisionEdits: Optional[list[dict[str, Any]]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "brief": brief,
        "depth": depth,
        "artifactType": artifactType,
    }
    if sources:
        raw_input["sources"] = sources
    if analysisArtifact:
        raw_input["analysisArtifact"] = analysisArtifact
    if revisionEdits:
        raw_input["revisionEdits"] = revisionEdits
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("create_prd", raw_input)
    return result["content"]


@mcp.tool(name="create_delivery_brief", description=_desc("create_delivery_brief"))
async def create_delivery_brief(
    brief: str = "Prepare a proposed development handoff from the selected PRD.",
    depth: str = "standard",
    requirementIds: Optional[list[str]] = None,
    references: Optional[list[dict[str, Any]]] = None,
    revisionOf: Optional[dict[str, Any]] = None,
) -> str:
    raw_input: dict[str, Any] = {
        "brief": brief,
        "depth": depth,
    }
    if requirementIds:
        raw_input["requirementIds"] = requirementIds
    if references:
        raw_input["references"] = references
    if revisionOf:
        raw_input["revisionOf"] = revisionOf

    result = await _execute("create_delivery_brief", raw_input)
    return result["content"]


@mcp.tool(
    name="run_full_discovery",
    description=(
        "Execute a complete end-to-end product discovery pipeline in one shot: "
        "Framing (prepare_discovery) -> Personas (generate_personas) -> "
        "Interview Simulation (simulate_interviews) -> Qualitative Analysis (analyze_interviews) -> "
        "Evidence-Linked PRD (create_prd) [-> Optional Delivery Brief (create_delivery_brief)]. "
        "All intermediate artifacts are automatically saved and linked in SQLite and local Markdown files. "
        "Returns the complete synthesis and full PRD directly in chat."
    ),
)
async def run_full_discovery(
    brief: str,
    depth: str = "standard",
    include_delivery_brief: bool = False,
) -> str:
    # 1. Framing
    await prepare_discovery(brief=brief, depth=depth)

    # 2. Personas (select within depth budget if needed)
    from backend.services.local_axwise.storage import find_latest_artifact
    config = runtime_configuration()
    latest_disc = find_latest_artifact(["prepare_discovery"], session_id=config.scope_id, state_dir=config.state_dir)
    role_limit = 3 if depth == "standard" else 4
    stakeholders = None
    if latest_disc:
        saved_roles = latest_disc.get("artifact", {}).get("stakeholders", [])
        if len(saved_roles) > role_limit:
            stakeholders = [
                {
                    "id": s["id"],
                    "label": s["label"],
                    "description": s["description"],
                    "participants": min(s.get("participants", 1), 2 if depth == "standard" else 3),
                    **({"countryCode": s["countryCode"]} if s.get("countryCode") else {}),
                    **({"locality": s["locality"]} if s.get("locality") else {}),
                }
                for s in saved_roles[:role_limit]
            ]

    await generate_personas(depth=depth, stakeholders=stakeholders)

    # 3. Simulate interviews
    await simulate_interviews(depth=depth)

    # 4. Analyze interviews
    await analyze_interviews(
        decisionQuestion=f"What are the core user requirements, friction points, and architectural constraints for: {brief}?",
        depth=depth,
    )

    # 5. Create PRD
    prd_res = await create_prd(brief=brief, depth=depth)

    delivery_res = None
    if include_delivery_brief:
        delivery_res = await create_delivery_brief(
            brief=f"Development handoff for {brief}", depth=depth
        )

    sections = [
        f"# End-to-End Discovery Pipeline: {brief}\n",
        "## Pipeline Milestones Completed",
        "- [x] **01 / Frame:** Discovery brief and stakeholder questions prepared.",
        "- [x] **02 / Explore:** Synthetic personas generated.",
        "- [x] **03 / Simulate:** Simulated user interviews conducted across cohort.",
        "- [x] **04 / Analyze:** Structured qualitative findings and jobs-to-be-done extracted.",
        "- [x] **05 / Shape:** Evidence-linked Product Requirements Document synthesized.",
    ]
    if include_delivery_brief:
        sections.append("- [x] **06 / Deliver:** Engineering handoff and test matrix created.")

    sections.extend(["\n---\n", prd_res])
    if delivery_res:
        sections.extend(["\n---\n", delivery_res])

    return "\n".join(sections)


def main(argv=None):
    parser = argparse.ArgumentParser(description="AxWise Local FastMCP server")
    parser.add_argument("--config", default=None, help="Optional BYOK configuration JSON")
    parser.add_argument("--transport", default="stdio", choices=["stdio", "sse"])
    parser.add_argument("--state-dir", default=None, help="Directory to store SQLite database and artifacts")
    args = parser.parse_args(argv)

    try:
        configure_runtime(args.config, state_dir=args.state_dir)
    except ConfigurationError as error:
        parser.error(str(error))

    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()
