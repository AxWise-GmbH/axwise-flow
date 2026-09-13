#!/usr/bin/env python3
"""
E2E Script to parse the Orqaly × AxWise presentation transcript, extract business context, 
and execute our forward-simulation PersonaGenerator to generate diverse personas with 
authentic, statistically pre-sampled OCEAN Profiles.
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
logger = logging.getLogger("orqaly_persona_pipeline")


def _get_api_key() -> str:
    """Retrieve Gemini API Key from environment."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY or GOOGLE_API_KEY is not configured in the environment.")
        sys.exit(1)
    return api_key


async def analyze_transcript_and_structure_context(transcript_content: str) -> Dict[str, Any]:
    """Use Gemini 3.8 Flash to analyze the pitch transcript and extract business metadata."""
    logger.info("Analyzing transcript using Google GenAI to extract business context & stakeholders...")
    api_key = _get_api_key()
    client = genai.Client(api_key=api_key)
    
    prompt = f"""
Analyze the following Orqaly × AxWise pitch deck transcript.
Identify and extract:
1. Business Context:
   - "business_idea": A clear description of the joint Orqaly × AxWise solution.
   - "target_customer": Who is this platform built for (industry roles, operators, developers).
   - "problem": The primary pain points/bottlenecks in the current AI/operations landscape.
   - "location": Primary geographical focus (if any mentioned, otherwise default "Munich / global").
2. Core Stakeholders:
   - Identify 3 distinct stakeholder roles mentioned or implied in the transcript (e.g., CFO, Lead Designer, Backend Developer/Security Lead).
   - For each stakeholder, provide:
     - "id": A simple unique string id (e.g. "cfo", "designer", "dev").
     - "name": The role name (e.g. "CFO", "Lead Designer").
     - "description": A concise professional description of this role's profile and responsibilities.
     - "questions": A list of 4 highly realistic user interview questions this stakeholder would ask when auditing an operations system.

Return your response strictly as a JSON object with this exact structure:
{{
  "business_context": {{
    "business_idea": "...",
    "target_customer": "...",
    "problem": "...",
    "location": "..."
  }},
  "stakeholders": [
    {{
      "id": "...",
      "name": "...",
      "description": "...",
      "questions": ["...", "...", "...", "..."]
    }},
    ...
  ]
}}

Transcript content to analyze:
---
{transcript_content}
"""

    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"}
    )
    
    try:
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Failed to parse structured JSON context from LLM response: {e}")
        logger.error(f"Raw response: {response.text}")
        raise


async def main():
    api_key = _get_api_key()
    transcript_path = "orqaly_deck_transcript.txt"
    output_path = "orqaly_ocean_personas.md"
    
    if not os.path.exists(transcript_path):
        print(f"❌ Error: File '{transcript_path}' not found. Please verify the current path.")
        sys.exit(1)
        
    with open(transcript_path, "r", encoding="utf-8") as f:
        transcript = f.read()
        
    # Step 1: Analyze transcript & extract structured context
    structured_data = await analyze_transcript_and_structure_context(transcript)
    
    bc_dict = structured_data["business_context"]
    sh_list = structured_data["stakeholders"]
    
    business_context = BusinessContext(
        business_idea=bc_dict["business_idea"],
        target_customer=bc_dict["target_customer"],
        problem=bc_dict["problem"],
        location=bc_dict.get("location", "Munich / global"),
    )
    
    # Structure stakeholders as Dict[str, List[Stakeholder]]
    stakeholders_dict = {
        "Primary Stakeholders": [
            Stakeholder(
                id=sh["id"],
                name=sh["name"],
                description=sh["description"],
                questions=sh["questions"],
            ) for sh in sh_list
        ]
    }
    
    # Step 2: Initialize Forward-Simulation PersonaGenerator with OCEANSampler
    logger.info("Initializing Forward-Simulation PersonaGenerator and OCEAN Sampler...")
    provider = GoogleProvider(api_key=api_key)
    model = GoogleModel("models/gemini-3.8-flash", provider=provider)
    
    sampler = OCEANSampler()
    classifier = OccupationClassifier()
    generator = PersonaGenerator(
        model=model,
        ocean_sampler=sampler,
        occupation_classifier=classifier,
    )
    
    # Configure generation parameters
    config = SimulationConfig(
        depth="detailed",
        people_per_stakeholder=1,  # Generate 1 distinct individual persona per stakeholder
        include_insights=True,
    )
    
    # Step 3: Run pipeline to generate people with authentic OCEAN scores
    logger.info("Executing PersonaGenerator.generate_all_people()...")
    generated_people: List[SimulatedPerson] = await generator.generate_all_people(
        stakeholders=stakeholders_dict,
        business_context=business_context,
        config=config,
    )
    
    # Step 4: Write output report
    logger.info(f"Successfully generated {len(generated_people)} OCEAN-modulated personas! Compiling Markdown report...")
    
    report_lines = []
    report_lines.append("# Orqaly × AxWise: Forward-Simulation Persona Generation Report")
    report_lines.append("\nThis report presents simulated personas generated by our **OCEAN-modulated forward-simulation pipeline**. Every persona has been structured strictly around pre-sampled, standard personality vectors representing their respective industry occupations.")
    
    report_lines.append("\n## I. Structured Business Context")
    report_lines.append(f"- **Business Idea**: {business_context.business_idea}")
    report_lines.append(f"- **Target Customer**: {business_context.target_customer}")
    report_lines.append(f"- **Core Problem**: {business_context.problem}")
    report_lines.append(f"- **Primary Region**: {business_context.location}")
    
    report_lines.append("\n## II. Generated OCEAN Personas")
    
    for idx, person in enumerate(generated_people):
        ocean = person.ocean_profile
        report_lines.append(f"\n### {idx + 1}. {person.name} ({person.stakeholder_type})")
        report_lines.append(f"- **Age**: {person.age}")
        report_lines.append(f"- **Background**: {person.background}")
        report_lines.append(f"- **Physical Description (Imagen 4 Ready)**: *\"{person.physical_description}\"*")
        report_lines.append(f"- **Demographic Details**: {person.demographic_details}")
        report_lines.append(f"- **Communication Style**: {person.communication_style}")
        
        report_lines.append("\n**🔑 Motivations**:")
        for m in person.motivations:
            report_lines.append(f"- {m}")
            
        report_lines.append("\n**⚠️ Pain Points**:")
        for p in person.pain_points:
            report_lines.append(f"- {p}")
            
        if ocean:
            report_lines.append("\n**📊 Pre-Sampled OCEAN Personality Vector**:")
            report_lines.append(f"- **Openness**: `{ocean.openness:.2f}` (Trait bias: *{'_Innovative/Curious_' if ocean.openness > 0.6 else '_Traditional/Pragmatic_'}*)")
            report_lines.append(f"- **Conscientiousness**: `{ocean.conscientiousness:.2f}` (Trait bias: *{'_Methodical/Structured_' if ocean.conscientiousness > 0.6 else '_Adaptable/Spontaneous_'}*)")
            report_lines.append(f"- **Extraversion**: `{ocean.extraversion:.2f}` (Trait bias: *{'_Assertive/Talkative_' if ocean.extraversion > 0.6 else '_Reserved/Quiet_'}*)")
            report_lines.append(f"- **Agreeableness**: `{ocean.agreeableness:.2f}` (Trait bias: *{'_Collaborative/Empathetic_' if ocean.agreeableness > 0.6 else '_Critical/Adversarial_'}*)")
            report_lines.append(f"- **Neuroticism**: `{ocean.neuroticism:.2f}` (Trait bias: *{'_Risk-Sensitive/Skeptical_' if ocean.neuroticism > 0.6 else '_Calm/Optimistic_'}*)")
            report_lines.append(f"- **Occupation Code**: `{ocean.occupation_code}`")
            
        report_lines.append("\n---")
        
    with open(output_path, "w", encoding="utf-8") as out:
        out.write("\n".join(report_lines))
        
    print(f"\n🎉 Success! E2E OCEAN Persona Report written to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
