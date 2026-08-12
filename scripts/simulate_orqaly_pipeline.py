#!/usr/bin/env python3
"""
E2E Script to run the complete Orqaly × AxWise pipeline for the Bremen & Munich Logistics project.
Processes a business request, identifies the problem & target customers, maps them to standard 
occupation baselines, samples OCEAN profiles via the OCEANSampler, and outputs a 
comprehensive deployment report detailing both Customers (to serve) and Internal Hires (to build it).
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
logger = logging.getLogger("orqaly_e2e_pipeline")


def _get_api_key() -> str:
    """Retrieve Gemini API Key from environment."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY or GOOGLE_API_KEY is not configured in the environment.")
        sys.exit(1)
    return api_key


async def extract_business_and_stakeholders(project_idea: str) -> Dict[str, Any]:
    """Uses Gemini 2.5 Flash to automatically identify the problem, target customers, and required team hires."""
    logger.info("Extracting business context, customers, and hiring profiles using Google GenAI...")
    api_key = _get_api_key()
    client = genai.Client(api_key=api_key)

    prompt = f"""
We want to analyze the following business idea:
---
{project_idea}
---

Identify and extract:
1. Target Customer Segment (The external people for whom we are building the product/solving the problem):
   - Provide 2 distinct roles of customers/users (e.g., Fleet Operator, Freight Coordinator).
2. Internal Hiring Team (The people we need to hire internally to build the technical operating system):
   - Identify 2 critical technical roles we need to hire (e.g., AI Orchestration Dev, Sandbox Security Engineer).

For each identified role (across both Customers and Hires), structure:
- "id": Unique role code (e.g., "dispatcher", "cfo", "orchestration_engineer").
- "role_group": Either "Customer Profile (Operational Target)" or "Internal Hire Profile (Team to Hire)".
- "role_name": Professional role name.
- "description": Key responsibilities, professional context, and goals of this role.
- "questions": A list of 3 highly specific diagnostic questions this role would ask regarding system performance, budgets, or usability.

Return your response strictly as a JSON object with this exact structure:
{{
  "business_context": {{
    "business_idea": "An agentic operational monitoring system for cargo escalation routing.",
    "target_customer": "Logistics dispatch operators and management boards.",
    "problem": "Manual shipping escalations are prone to delay and human errors during out-of-office periods.",
    "location": "Munich / global"
  }},
  "roles": [
    {{
      "id": "...",
      "role_group": "...",
      "role_name": "...",
      "description": "...",
      "questions": ["...", "...", "..."]
    }},
    ...
  ]
}}
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
        config={"response_mime_type": "application/json"}
    )

    try:
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Failed to parse structured JSON: {e}")
        logger.error(f"Raw response: {response.text}")
        raise


async def generate_landing_page_concept(business_context: BusinessContext, customers: List[Any]) -> str:
    """Uses Gemini 3.5 Flash to automatically generate a tailored, high-converting Landing Page concept and copy structure based on target customer personas."""
    logger.info("Generating landing page concept and copywriting structure tailored to the generated customer personas...")
    api_key = _get_api_key()
    client = genai.Client(api_key=api_key)

    personas_summary = ""
    for idx, p in enumerate(customers):
        personas_summary += f"\nPersona {idx+1}: {p.name} ({p.stakeholder_type})\n"
        personas_summary += f"- Background: {p.background}\n"
        personas_summary += f"- Motivations: {', '.join(p.motivations)}\n"
        personas_summary += f"- Pain Points: {', '.join(p.pain_points)}\n"

    prompt = f"""
We have the following business context:
- Business Idea: {business_context.business_idea}
- Problem: {business_context.problem}
- Target Customers: {business_context.target_customer}
- Location: {business_context.location}

And the following target customer personas:
{personas_summary}

Please generate a high-converting, psychologically-optimized Landing Page Concept & Copywriting Strategy for this car service campaign in Bremen.
Structure your output beautifully in Markdown, including:
1. **Targeting Strategy**: How the page speaks directly to both the busy private commuters (like Lukas Becker) and the methodical SME fleet operations managers (like Jens Osterkamp).
2. **Hero Section (Above the Fold)**:
   - Catchy, high-impact headline (incorporate the Bremen context & Autumn transition).
   - Benefit-driven sub-headline.
   - Primary Call-to-Action (CTA) button copy (geared towards the automated booking twin/conversational booking widget).
3. **Double-Sided Value Proposition Layout (The "Choose Your Path" Section)**:
   - **Path A: Individual Commuters** (Visual cue, copywriting headline, bullet points solving their exact pain points like tire reservations, zero waiting times, automated text notifications).
   - **Path B: SME Fleet Managers** (Visual cue, copywriting headline, bullet points highlighting bulk capacity reservation, direct calendar sync/API logs, and zero double-booking SLAs).
4. **Interactive Conversational Booking Twin Widget Preview**:
   - Describe how the widget looks and a short simulated dialogue (e.g., user booking winter-tire service via WhatsApp/Webchat, and the digital twin of the workshop capacity instantly verifying and booking).
5. **Trust, Social Proof, and Urgency Signals (Bremen-localized)**:
   - Seasonal urgency headline (first frost warnings).
   - Local trust signals (e.g., "Certified Master Mechanics of Bremen Neustadt", "Serving Weser area fleets since 2015").
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt
    )
    return response.text


project_idea_text = """
I want to create a marketing campaign for my car service in Bremen, Germany in Autumn.
The primary service offer focuses on pre-winter automotive maintenance (coolant flushes, battery health testing, winter tire fitting, brake checks).
I want to automate booking processes using local digital twins, keep track of our ad spends, and ground our scheduling guidelines to avoid manual errors when mechanics are fully booked.
We need to understand both the target customers who will consume this service in Bremen and the internal engineering team we must hire to build the booking-agent operating system.
"""


async def main():
    api_key = _get_api_key()
    output_path = "bremen_car_service_campaign.md"
    
    # 1. Parse raw concept into structured contexts
    parsed_data = await extract_business_and_stakeholders(project_idea_text)
    bc_dict = parsed_data["business_context"]
    extracted_roles = parsed_data["roles"]
    
    business_context = BusinessContext(
        business_idea=bc_dict["business_idea"],
        target_customer=bc_dict["target_customer"],
        problem=bc_dict["problem"],
        location=bc_dict.get("location", "Bremen, Germany"),
    )

    logger.info(f"Structured Business Context: {business_context.business_idea}")
    
    # Group roles into Stakeholder structures to feed our pipeline
    stakeholders_dict = {
        "Target Roles": [
            Stakeholder(
                id=role["id"],
                name=role["role_name"],
                description=f"Group: {role['role_group']} | {role['description']}",
                questions=role["questions"],
            ) for role in extracted_roles
        ]
    }
    
    # 2. Run Forward-Simulation Pipeline with OCEANSampler
    logger.info("Initializing Forward-Simulation Pipeline...")
    provider = GoogleProvider(api_key=api_key)
    model = GoogleModel("models/gemini-3.6-flash", provider=provider)
    
    sampler = OCEANSampler()
    classifier = OccupationClassifier()
    generator = PersonaGenerator(
        model=model,
        ocean_sampler=sampler,
        occupation_classifier=classifier,
    )
    
    config = SimulationConfig(
        depth="detailed",
        people_per_stakeholder=1,
        include_insights=True,
    )
    
    logger.info("Generating personalities governed by pre-sampled OCEAN vectors...")
    generated_personas = await generator.generate_all_people(
        stakeholders=stakeholders_dict,
        business_context=business_context,
        config=config,
    )
    
    # 3. Compile beautiful Markdown Report
    logger.info(f"Pipeline executed successfully. Writing consolidated results to {output_path}...")
    
    report = []
    report.append("# Orqaly × AxWise: Bremen Car Service Autumn Campaign & Team Generation Report")
    report.append(f"\n**Campaign Goal**: {project_idea_text.strip()}")
    
    report.append("\n## I. Extracted Business Context")
    report.append(f"- **Unified Solution Concept**: {business_context.business_idea}")
    report.append(f"- **Target Customer Segment**: {business_context.target_customer}")
    report.append(f"- **Core Problem**: {business_context.problem}")
    report.append(f"- **Primary Region**: {business_context.location}")
    
    report.append("\n## II. Customer vs. Internal Hire Segments (OCEAN Modulated)")
    
    # Strictly split by looking at the Stakeholder's pre-defined Group from extracted_roles
    # We mapped role['role_group'] into description of Stakeholder, which becomes person.background's pre-assigned context
    customers = []
    hires = []
    
    # Establish lookup by matching generated persona's stakeholder_type back to extracted_roles groups
    for person in generated_personas:
        # Find corresponding role group
        role_group = "Customer Profile"
        for role in extracted_roles:
            if role["role_name"] == person.stakeholder_type:
                role_group = role["role_group"]
                break
        
        if "Customer" in role_group:
            customers.append(person)
        else:
            hires.append(person)
        
    report.append("\n### A. Target Customers / Consumers")
    report.append("These are the local consumers in Bremen who have the seasonal need and for whom we build the booking system:")
    
    for idx, person in enumerate(customers):
        ocean = person.ocean_profile
        report.append(f"\n#### A.{idx + 1}. {person.name} ({person.stakeholder_type})")
        report.append(f"- **Background**: {person.background}")
        report.append(f"- **Demographics**: {person.demographic_details}")
        report.append(f"- **Physical Description**: *\"{person.physical_description}\"*")
        report.append(f"- **Communication Style**: {person.communication_style}")
        
        report.append("\n**🔑 Motivations**:")
        for m in person.motivations:
            report.append(f"  - {m}")
            
        report.append("\n**⚠️ Pain Points**:")
        for p in person.pain_points:
            report.append(f"  - {p}")
            
        if ocean:
            report.append("\n**📊 Sampled OCEAN Profile**:")
            report.append(f"  - **Openness**: `{ocean.openness:.2f}`")
            report.append(f"  - **Conscientiousness**: `{ocean.conscientiousness:.2f}`")
            report.append(f"  - **Extraversion**: `{ocean.extraversion:.2f}`")
            report.append(f"  - **Agreeableness**: `{ocean.agreeableness:.2f}`")
            report.append(f"  - **Neuroticism**: `{ocean.neuroticism:.2f}`")
            report.append(f"  - **Occupation Mapped Code**: `{ocean.occupation_code}`")
        report.append("\n---")
        
    if hires:
        report.append("\n### B. Internal Hiring Team (Required to Build Orqaly)")
        report.append("These are the engineering profiles we must recruit to develop and secure the automated scheduling operating system:")
        
        for idx, person in enumerate(hires):
            ocean = person.ocean_profile
            report.append(f"\n#### B.{idx + 1}. {person.name} ({person.stakeholder_type})")
            report.append(f"- **Background**: {person.background}")
            report.append(f"- **Demographics**: {person.demographic_details}")
            report.append(f"- **Physical Description**: *\"{person.physical_description}\"*")
            report.append(f"- **Communication Style**: {person.communication_style}")
            
            report.append("\n**🔑 Professional Motivations**:")
            for m in person.motivations:
                report.append(f"  - {m}")
                
            report.append("\n**⚠️ Development Pain Points**:")
            for p in person.pain_points:
                report.append(f"  - {p}")
                
            if ocean:
                report.append("\n**📊 Sampled OCEAN Profile**:")
                report.append(f"  - **Openness**: `{ocean.openness:.2f}`")
                report.append(f"  - **Conscientiousness**: `{ocean.conscientiousness:.2f}`")
                report.append(f"  - **Extraversion**: `{ocean.extraversion:.2f}`")
                report.append(f"  - **Agreeableness**: `{ocean.agreeableness:.2f}`")
                report.append(f"  - **Neuroticism**: `{ocean.neuroticism:.2f}`")
                report.append(f"  - **Occupation Mapped Code**: `{ocean.occupation_code}`")
            report.append("\n---")
            
    # Generate high-converting landing page strategy
    landing_page_concept = await generate_landing_page_concept(business_context, customers)
    report.append("\n## III. High-Converting Landing Page Strategy (Generated)")
    report.append(landing_page_concept)
            
    with open(output_path, "w", encoding="utf-8") as out:
        out.write("\n".join(report))
        
    print(f"\n🎉 Success! E2E Bremen Car Service Report written to: {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
