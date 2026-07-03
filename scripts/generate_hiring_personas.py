#!/usr/bin/env python3
"""
E2E Script to generate internal hiring personas (talent profiles) we need to hire to build 
and scale Orqaly. It leverages our forward-simulation PersonaGenerator to sample statistically 
authentic OCEAN profiles appropriate for deep-tech internal engineering and security roles.
"""

import os
import sys
import json
import asyncio
import logging
from typing import Dict, List, Any

# Ensure project root is in python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import from backend architecture
from google import genai
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

from backend.api.research.simulation_bridge.services.persona_generator import PersonaGenerator
from backend.api.research.simulation_bridge.services.ocean_sampler import OCEANSampler
from backend.api.research.simulation_bridge.services.occupation_classifier import OccupationClassifier
from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    Stakeholder,
    SimulationConfig,
    SimulatedPerson,
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("orqaly_hiring_pipeline")


def _get_api_key() -> str:
    """Retrieve Gemini API Key from environment."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY or GOOGLE_API_KEY is not configured in the environment.")
        sys.exit(1)
    return api_key


async def main():
    api_key = _get_api_key()
    output_path = "orqaly_hiring_personas.md"
    
    # Define our internal engineering / hiring business context
    business_context = BusinessContext(
        business_idea="We are building Orqaly: an enterprise-grade agentic operating system. It features a Consilium (multi-agent council) that decomposes plain-language goals, schedules parallel tasks in sandboxed containers with USD budget capping, enforces strict RBAC gateways, maintains a 100% tamper-proof audit trail, and scales real-time cognitive grounding (RAG) namespaces using pgvector.",
        target_customer="Hiring Core Internal Technical Team",
        problem="Building highly complex multi-agent orchestration engines, securing code-execution sandboxes against arbitrary code injection, implementing real-time high-throughput vector grounding fallbacks, and maintaining a high-quality unit-economic token monitoring pipeline.",
        location="Munich / Remote",
    )
    
    # Define the 3 critical hiring profiles as stakeholders to generate
    hiring_roles = {
        "Internal Technical Hires": [
            Stakeholder(
                id="agent_orchestration_eng",
                name="Lead AI Orchestration & Multi-Agent Engineer",
                description="Responsible for building the Consilium engine, parallel task division, agent self-healing loops, state synchronization across agents, and dollar-budget token gating. Requires expert knowledge of LLM orchestrations, async python, and state-machine pattern design.",
                questions=[
                    "How do we handle state recovery and self-healing when a sub-agent fails mid-workflow?",
                    "What strategies optimize real-time token tracking and strict USD billing thresholds across asynchronous LLM calls?",
                    "How do we represent multi-agent dependencies and parallelize task execution without deadlock?",
                ]
            ),
            Stakeholder(
                id="security_sandboxing_eng",
                name="Lead Security & Sandboxing Platform Engineer",
                description="Responsible for designing secure containerized runtime sandboxes (Docker/gVisor/Wasm) for agent execution, hardening the platform against malicious prompt-injection or tool-abuse, implementing cryptographically signed audit logs, and maintaining fine-grained Role-Based Access Control (RBAC) gateways.",
                questions=[
                    "How do we completely isolate tool execution in sandboxes while retaining high-throughput network access to selected enterprise APIs?",
                    "What defense-in-depth mechanisms prevent model prompt-injection from executing unauthorized shell commands?",
                    "How do we cryptographically bind and seal the multi-agent execution steps into an immutable ledger?",
                ]
            ),
            Stakeholder(
                id="rag_grounding_eng",
                name="Senior RAG & Cognitive Grounding Engineer",
                description="Responsible for designing and scaling Phase 2 Cognitive Grounding. Optimizes text splitters, manages pgvector database layouts with HNSW index optimizations on Postgres, implements lightweight SQLite similarity fallbacks for local/offline runtimes, and manages high-throughput batched text embeddings.",
                questions=[
                    "What sliding-window segmentation strategies ensure maximum semantic cohesion across heterogeneous enterprise PDFs and docx sheets?",
                    "How do we optimize HNSW indexing to support millions of vectors namespaced by thousands of tenant partitions?",
                    "How do we implement a performant vector-similarity fallback directly in Python/SQLite that mirrors pgvector distance outputs exactly for testing?",
                ]
            )
        ]
    }
    
    # Initialize Forward-Simulation PersonaGenerator
    logger.info("Initializing Forward-Simulation PersonaGenerator with OCEANSampler for internal hiring...")
    provider = GoogleProvider(api_key=api_key)
    model = GoogleModel("models/gemini-3.5-flash", provider=provider)
    
    sampler = OCEANSampler()
    classifier = OccupationClassifier()
    generator = PersonaGenerator(
        model=model,
        ocean_sampler=sampler,
        occupation_classifier=classifier,
    )
    
    config = SimulationConfig(
        depth="detailed",
        people_per_stakeholder=1,  # Generate 1 realistic target profile candidate per role
        include_insights=True,
    )
    
    # Execute PersonaGenerator
    logger.info("Generating internal technical hiring profiles with pre-sampled OCEAN vectors...")
    generated_hires: List[SimulatedPerson] = await generator.generate_all_people(
        stakeholders=hiring_roles,
        business_context=business_context,
        config=config,
    )
    
    # Format and save report
    logger.info("Compiling internal hiring report...")
    report = []
    report.append("# Orqaly × AxWise: Internal Engineering & Technical Hiring Report")
    report.append("\nTo solve the fundamental engineering bottlenecks of Orqaly (dynamic multi-agent coordination, zero-trust secure sandboxing, and real-time enterprise cognitive grounding), we must hire specialized engineering talent.")
    report.append("\nThis report presents **3 core hiring profiles**. Each profile is modeled as an individual simulated candidate with **demographics, physical description, professional background, motivators, and pre-sampled OCEAN vectors** tailored specifically for high-impact deep-tech execution.")
    
    report.append("\n## I. Core Engineering Problems to Solve")
    report.append("1. **Agentic Coordination & USD Billing**: Building a robust state-machine scheduler that respects budget caps.")
    report.append("2. **Runtime Isolation (Sandbox Security)**: Preventing agents from executing destructive shell commands or leaking API keys.")
    report.append("3. **Real-time Cognitive Grounding (Phase 2)**: Designing sub-millisecond document segmentation, vector search, and SQLite fallbacks.")
    
    report.append("\n## II. Ideal Internal Hiring Candidates (Forward-Simulated Profiles)")
    
    for idx, candidate in enumerate(generated_hires):
        ocean = candidate.ocean_profile
        report.append(f"\n### {idx + 1}. {candidate.name}")
        report.append(f"**Target Role**: {candidate.stakeholder_type}")
        report.append(f"- **Age**: {candidate.age}")
        report.append(f"- **Professional Background**: {candidate.background}")
        report.append(f"- **Physical Description (Imagen 4 Ready)**: *\"{candidate.physical_description}\"*")
        report.append(f"- **Demographics**: {candidate.demographic_details}")
        report.append(f"- **Communication Style**: {candidate.communication_style}")
        
        report.append("\n**🔑 Professional Motivations (What drives them to build Orqaly)**:")
        for m in candidate.motivations:
            report.append(f"- {m}")
            
        report.append("\n**⚠️ Pain Points & Friction (What frustrates them in current development systems)**:")
        for p in candidate.pain_points:
            report.append(f"- {p}")
            
        if ocean:
            report.append("\n**📊 Pre-Sampled OCEAN Personality Fit (Why they excel in this role)**:")
            report.append(f"- **Openness**: `{ocean.openness:.2f}` (Trait bias: *{'_Highly Innovative / Experimental_' if ocean.openness > 0.6 else '_Traditional / Pragmatic_'}*)")
            report.append(f"- **Conscientiousness**: `{ocean.conscientiousness:.2f}` (Trait bias: *{'_Extremely Structured / High-Integrity_' if ocean.conscientiousness > 0.6 else '_Fast-paced / Spontaneous_'}*)")
            report.append(f"- **Extraversion**: `{ocean.extraversion:.2f}` (Trait bias: *{'_Outspoken / Communicative_' if ocean.extraversion > 0.6 else '_Introspective / Terse_'}*)")
            report.append(f"- **Agreeableness**: `{ocean.agreeableness:.2f}` (Trait bias: *{'_Collaborative / Mentor_' if ocean.agreeableness > 0.6 else '_Skeptical / Adversarial Auditor_'}*)")
            report.append(f"- **Neuroticism**: `{ocean.neuroticism:.2f}` (Trait bias: *{'_High Risk-Sensitivity / Vigilant_' if ocean.neuroticism > 0.6 else '_Calm under pressure / Stable_'}*)")
            report.append(f"- **Sampled Occupation Code**: `{ocean.occupation_code}`")
            
        report.append("\n---")
        
    with open(output_path, "w", encoding="utf-8") as out:
        out.write("\n".join(report))
        
    print(f"\n🎉 Success! E2E Internal Hiring Report written to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
