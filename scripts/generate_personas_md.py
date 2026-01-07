#!/usr/bin/env python3
"""
Generate Personas Markdown from Interview Transcript.

Runs the persona formation pipeline and outputs a formatted markdown file
instead of saving to database.

Usage: python scripts/generate_personas_md.py <input_file> [output_file.md]
"""

import asyncio
import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load environment
try:
    from dotenv import load_dotenv
    for env_path in ['backend/.env.oss', '.env.oss', '.env']:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            break
except ImportError:
    pass  # Environment should be set externally

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def format_evidence(evidence_list, indent="  "):
    """Format evidence items as markdown quotes."""
    if not evidence_list:
        return f"{indent}*No supporting evidence available*\n"
    
    lines = []
    for ev in evidence_list[:5]:  # Limit to 5 quotes
        if isinstance(ev, dict):
            quote = ev.get('quote', str(ev))
        else:
            quote = str(ev)
        # Clean and format as blockquote
        quote = quote.strip().replace('\n', ' ')
        if len(quote) > 300:
            quote = quote[:297] + "..."
        lines.append(f'{indent}> "{quote}"')
    return '\n'.join(lines) + '\n'


def format_trait(trait_data, trait_name):
    """Format a persona trait with value and evidence."""
    if not trait_data:
        return ""

    if isinstance(trait_data, str):
        value = trait_data
        evidence = []
    elif isinstance(trait_data, dict):
        value = trait_data.get('value', trait_data.get('description', ''))
        evidence = trait_data.get('evidence', trait_data.get('quotes', []))
    elif isinstance(trait_data, list):
        # Handle list of items
        value = '\n'.join(f"• {item}" if isinstance(item, str) else f"• {item.get('text', str(item))}" for item in trait_data[:10])
        evidence = []
    else:
        return ""

    if not value or value == "Representative quotes":
        return ""

    # Clean up the trait name for display
    display_name = trait_name.replace('_', ' ').title()

    md = f"### {display_name}\n\n"
    md += f"{value}\n\n"

    if evidence:
        md += "**Supporting Evidence:**\n\n"
        md += format_evidence(evidence)

    return md + "\n"


def persona_to_markdown(persona: dict) -> str:
    """Convert a persona dict to formatted markdown."""
    name = persona.get('name', 'Unknown')
    description = persona.get('description', '')
    archetype = persona.get('archetype', persona.get('generated_archetype_name', 'Unknown'))
    confidence = persona.get('overall_confidence', persona.get('confidence', 0.7))
    role = persona.get('role', persona.get('role_in_interview', ''))

    md = f"## {name}\n\n"
    if archetype and archetype.strip():
        md += f"**Archetype:** {archetype}  \n"
    if role:
        md += f"**Role:** {role}  \n"
    md += f"**Confidence:** {confidence:.0%}\n\n"

    if description and description != 'Stakeholder participant sharing insights and experiences':
        md += f"*{description}*\n\n"

    md += "---\n\n"

    # Role context and responsibilities
    role_context = persona.get('role_context')
    if role_context:
        md += f"### Role Context\n\n{role_context}\n\n"

    key_responsibilities = persona.get('key_responsibilities')
    if key_responsibilities:
        md += f"### Key Responsibilities\n\n{key_responsibilities}\n\n"

    # Tools used
    tools_used = persona.get('tools_used')
    if tools_used:
        md += f"### Tools Used\n\n{tools_used}\n\n"

    # Core traits
    for trait_name in ['demographics', 'goals_and_motivations', 'challenges_and_frustrations',
                       'skills_and_expertise', 'workflow_and_environment', 'technology_and_tools',
                       'pain_points', 'needs_and_expectations', 'collaboration_style',
                       'analysis_approach', 'key_quotes']:
        trait_data = persona.get(trait_name)
        md += format_trait(trait_data, trait_name)

    # Patterns if available
    patterns = persona.get('patterns', [])
    if patterns:
        md += "### Behavioral Patterns\n\n"
        for pattern in patterns[:5]:
            if isinstance(pattern, dict):
                pattern_name = pattern.get('name', pattern.get('pattern', ''))
                if pattern_name:
                    md += f"• {pattern_name}\n"
            elif isinstance(pattern, str):
                md += f"• {pattern}\n"
        md += "\n"

    return md


async def run_persona_generation(input_path: str) -> dict:
    """Run the persona formation pipeline."""
    from backend.services.llm import LLMServiceFactory
    from backend.services.nlp import get_nlp_processor
    from backend.core.processing_pipeline import process_data

    logger.info(f"Reading transcript: {input_path}")
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()

    logger.info(f"Transcript length: {len(content)} chars")

    # Initialize services
    llm_service = LLMServiceFactory.create("enhanced_gemini")
    NLPProcessor = get_nlp_processor()
    nlp_processor = NLPProcessor()

    # Run full analysis pipeline
    logger.info("Running persona formation pipeline...")
    result = await process_data(
        nlp_processor=nlp_processor,
        llm_service=llm_service,
        data=content,
        config={
            "use_enhanced_theme_analysis": True,
            "use_reliability_check": False,
            "industry": "Technology",
        }
    )

    return result


def themes_to_markdown(themes: list) -> str:
    """Convert themes to markdown."""
    if not themes:
        return ""

    md = "# Key Themes\n\n"
    for i, theme in enumerate(themes, 1):
        if isinstance(theme, dict):
            name = theme.get('name', theme.get('theme', f'Theme {i}'))
            description = theme.get('description', theme.get('summary', ''))
            evidence = theme.get('evidence', theme.get('statements', []))
        else:
            name = str(theme)
            description = ""
            evidence = []

        md += f"## {i}. {name}\n\n"
        if description:
            md += f"{description}\n\n"
        if evidence:
            md += "**Supporting Evidence:**\n\n"
            md += format_evidence(evidence[:3])
        md += "\n"

    return md + "---\n\n"


def patterns_to_markdown(patterns: list) -> str:
    """Convert patterns to markdown."""
    if not patterns:
        return ""

    md = "# Behavioral Patterns\n\n"
    for i, pattern in enumerate(patterns, 1):
        if isinstance(pattern, dict):
            name = pattern.get('name', pattern.get('pattern', f'Pattern {i}'))
            description = pattern.get('description', '')
            category = pattern.get('category', '')
            impact = pattern.get('impact', '')
        else:
            name = str(pattern)
            description = ""
            category = ""
            impact = ""

        md += f"### {i}. {name}\n\n"
        if category:
            md += f"**Category:** {category}\n\n"
        if description:
            md += f"{description}\n\n"
        if impact:
            md += f"**Impact:** {impact}\n\n"

    return md + "---\n\n"


async def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_personas_md.py <input_file> [output_file.md]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) >= 3 else input_path.rsplit('.', 1)[0] + '_personas.md'

    result = await run_persona_generation(input_path)

    personas = result.get('personas', [])
    themes = result.get('enhanced_themes', result.get('themes', []))
    patterns = result.get('patterns', [])

    logger.info(f"Generated {len(personas)} personas, {len(themes)} themes, {len(patterns)} patterns")

    # Build markdown
    md = f"# Interview Analysis Report\n\n"
    md += f"**Source:** {os.path.basename(input_path)}  \n"
    md += f"**Generated:** {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}  \n"
    md += f"**Total Personas:** {len(personas)}  \n"
    md += f"**Total Themes:** {len(themes)}  \n"
    md += f"**Total Patterns:** {len(patterns)}\n\n"
    md += "---\n\n"

    # Add themes section
    md += themes_to_markdown(themes)

    # Add patterns section
    md += patterns_to_markdown(patterns)

    # Add personas section
    md += "# Personas\n\n"
    for persona in personas:
        md += persona_to_markdown(persona)
        md += "\n---\n\n"

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(md)

    logger.info(f"Wrote report to: {output_path}")
    print(f"\n✅ Generated report with {len(personas)} personas, {len(themes)} themes, {len(patterns)} patterns -> {output_path}")


if __name__ == "__main__":
    asyncio.run(main())

