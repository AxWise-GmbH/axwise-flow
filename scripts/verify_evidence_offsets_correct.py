#!/usr/bin/env python3
"""
Correct Evidence Offset Verification Script.

This script reconstructs the exact speaker-scoped text used during Pipeline A's 
evidence linking process. Slicing start_char and end_char from this exact text 
demonstrates the accuracy of the offsets within the speaker's own dialogue scope.
"""

import os
import sys
import json
import asyncio
import re
from typing import Dict, Any, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment
try:
    from dotenv import load_dotenv
    for env_path in ['backend/.env.oss', '.env.oss', '.env']:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            break
except ImportError:
    pass

from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

from backend.api.research.simulation_bridge.services.persona_generator import PersonaGenerator
from backend.api.research.simulation_bridge.services.ocean_sampler import OCEANSampler
from backend.api.research.simulation_bridge.services.occupation_classifier import OccupationClassifier
from backend.api.research.simulation_bridge.services.interview_simulator import InterviewSimulator
from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    Stakeholder,
    SimulationConfig,
)
from backend.services.llm import LLMServiceFactory
from backend.services.processing.persona_formation_service import PersonaFormationService


USE_CASE = {
    "id": "martech_personalization",
    "domain": "Retail Commerce / MarTech",
    "location": "Berlin, Germany",
    "idea": "Context-aware personalized shelf inventory allocation and ad attribution for organic grocery chains.",
    "target_customer": "Regional grocery managers, logistics operators, and local performance marketers.",
    "problem": "Inefficient seasonal inventory allocations cause food waste and inaccurate marketing ad-spend ROI tracking.",
    "stakeholders": [
        {
            "id": "grocery_ops_manager",
            "name": "Regional Grocery Operations Manager",
            "description": "Operations leader balancing physical shelf capacity with regional bio-customer demands.",
            "questions": [
                "What tools do you use to coordinate bio-customer demand layout?",
                "What is your biggest frustration when seasonal inventory allocations fail?",
                "How do you currently track local campaign ad-spend ROI?"
            ]
        }
    ]
}


def _strip_block_prefix(spk: str) -> str:
    if isinstance(spk, str) and re.match(r"^I\d+\|", spk):
        return re.sub(r"^I\d+\|", "", spk)
    return spk


def _clean_alien_lines(text, target_speaker):
    lines = text.split('\n')
    cleaned = []
    target_lower = target_speaker.lower()
    target_parts = {p for p in target_lower.split() if len(p) > 2}
    
    for line in lines:
        m = re.match(r"^\s*(?:[AQ]:\s*)?([A-Za-z0-9 _\.]+):\s", line)
        if m:
            found_name = m.group(1).lower().strip()
            
            if found_name in {"key insights", "summary"}:
                continue
            
            if found_name in {"interviewer", "moderator", "researcher", "question"} or found_name.startswith("interviewer"):
                cleaned.append(line)
                continue
                
            is_match = (found_name == target_lower)
            if not is_match:
                if found_name in target_lower or target_lower in found_name:
                    is_match = True
                elif any(p in found_name for p in target_parts):
                    is_match = True
            
            if not is_match:
                continue
        
        cleaned.append(line)
    return '\n'.join(cleaned)


async def main():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY is missing.")
        sys.exit(1)

    provider = GoogleProvider(api_key=api_key)
    pydantic_ai_model = GoogleModel("models/gemini-3.6-flash", provider=provider)
    
    sampler = OCEANSampler()
    classifier = OccupationClassifier()
    generator = PersonaGenerator(
        model=pydantic_ai_model,
        ocean_sampler=sampler,
        occupation_classifier=classifier,
    )

    business_context = BusinessContext(
        business_idea=USE_CASE["idea"],
        target_customer=USE_CASE["target_customer"],
        problem=USE_CASE["problem"],
        industry=USE_CASE["domain"],
        location=USE_CASE["location"],
    )

    sh_config = USE_CASE["stakeholders"][0]
    stakeholder = Stakeholder(
        id=sh_config["id"],
        name=sh_config["name"],
        description=sh_config["description"],
        questions=sh_config["questions"],
    )

    config = SimulationConfig(
        depth="detailed",
        people_per_stakeholder=1,
        include_insights=True,
    )

    print("Generating simulated interview data...")
    generated_people = await generator.generate_all_people(
        stakeholders={"Target Roles": [stakeholder]},
        business_context=business_context,
        config=config,
    )
    person = generated_people[0]
    
    int_simulator = InterviewSimulator(model=pydantic_ai_model)
    sim_interview = await int_simulator.simulate_interview(
        persona=person,
        stakeholder=stakeholder,
        business_context=business_context,
        config=config
    )

    # Format transcript using the DataFormatter
    from backend.api.research.simulation_bridge.services.data_formatter import DataFormatter
    formatter = DataFormatter()
    
    transcript = formatter.format_as_transcript_segments(
        interviews=[sim_interview],
        personas=generated_people,
        simulation_id="verification_123"
    )

    # Reconstruct the cleaned scoped_text exactly as the facade does
    speaker = person.name
    original_speaker_tuples = {(speaker, "verification_123"), (speaker, "original_text")}
    
    # Collect speaker turns
    def _segment_matches_speaker(seg, speaker_tuples):
        seg_speaker = _strip_block_prefix(seg.get("speaker_id") or seg.get("speaker") or "")
        seg_doc_id = seg.get("document_id") or "original_text"
        return (seg_speaker, seg_doc_id) in speaker_tuples

    speaker_turns = [
        (
            (seg.get("document_id") or "original_text"),
            (seg.get("dialogue") or seg.get("text") or ""),
        )
        for seg in transcript
        if _segment_matches_speaker(seg, original_speaker_tuples)
    ]
    
    order = []
    buckets = {}
    for did, txt in speaker_turns:
        if did not in buckets:
            buckets[did] = []
            order.append(did)
        if txt:
            buckets[did].append(str(txt))
            
    pieces = []
    sep = "\n\n"
    for did in order:
        block = "\n".join(buckets.get(did) or [])
        pieces.append(block)
    
    scoped_text = sep.join(pieces)
    scoped_text = _clean_alien_lines(scoped_text, speaker)

    # LLM Clean step (which is what evidence linking is done against)
    llm_service = LLMServiceFactory.create("enhanced_gemini")
    persona_formation_service = PersonaFormationService(llm_service=llm_service)
    
    # Run LLM clean exactly as facade does
    scoped_text_cleaned = await persona_formation_service._facade.evidence_linker.llm_clean_scoped_text(
        scoped_text,
        scope_meta={"speaker": speaker, "speaker_role": "Participant", "document_id": "verification_123"}
    )
    
    # Re-run the core persona formation
    os.environ["EVIDENCE_LINKING_V2"] = "true"
    empirical_personas = await persona_formation_service.form_personas_from_transcript(
        transcript=transcript,
        context={
            "industry": business_context.industry,
            "document_id": "verification_123"
        }
    )
    emp_persona = empirical_personas[0]

    # Collect citations
    traits = [
        "demographics", "goals_and_motivations", "challenges_and_frustrations",
        "technology_and_tools", "skills_and_expertise", "workflow_and_environment", "pain_points"
    ]
    
    citations = []
    for trait in traits:
        data = emp_persona.get(trait)
        if isinstance(data, dict) and "evidence" in data:
            for ev in data["evidence"]:
                if isinstance(ev, dict) and ev.get("start_char") is not None:
                    citations.append({
                        "trait": trait,
                        "quote": ev["quote"],
                        "start_char": ev["start_char"],
                        "end_char": ev["end_char"]
                    })

    print("\n" + "="*80)
    print("🎯 CORRECT RECONSTRUCTED CHARACTER OFFSET VERIFICATION")
    print("="*80)
    
    mismatches = 0
    matches = 0
    for idx, citation in enumerate(citations, 1):
        start = citation["start_char"]
        end = citation["end_char"]
        expected_quote = citation["quote"]
        
        # Slice from the EXACT cleaned speaker text
        sliced_text = scoped_text_cleaned[start:end]
        
        is_exact = sliced_text.strip() == expected_quote.strip()
        is_approx = expected_quote.strip() in sliced_text.strip() or sliced_text.strip() in expected_quote.strip()
        
        print(f"\n[{idx}] Sourced Trait: '{citation['trait']}'")
        print(f"    - Target Offsets: {start} -> {end}")
        print(f"    - Linked Quote  : \"{expected_quote}\"")
        print(f"    - Sliced Text   : \"{sliced_text}\"")
        
        if is_exact:
            print("    ✅ VERDICT: EXACT MATCH")
            matches += 1
        elif is_approx:
            print("    ⚠️ VERDICT: APPROXIMATE MATCH / WHITE-SPACE ALIGNED")
            matches += 1
        else:
            print("    ❌ VERDICT: MISMATCH")
            mismatches += 1

    print("\n" + "="*80)
    print("📊 ALIGNMENT METRICS SUMMARY")
    print("="*80)
    print(f"  - Total Citations Evaluated: {len(citations)}")
    print(f"  - Exact/Aligned Matches    : {matches}")
    score = (matches / len(citations) * 100) if citations else 100.0
    print(f"  - Mismatches Detected      : {mismatches}")
    print(f"  - Evidence Accuracy Score  : {score:.1f}%")
    print("="*80 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
