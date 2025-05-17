"""
Example of using the prompt template system.

This module demonstrates how to use the prompt template system with
existing prompts.
"""

import logging
from typing import Dict, Any

from backend.services.llm.prompts.template import registry, PromptTemplate

logger = logging.getLogger(__name__)

# Register a pattern recognition template
pattern_recognition_template = """
You are a design thinking analysis assistant. Analyze the following interview transcript to identify recurring patterns.

For each pattern, provide:
1. A descriptive name
2. A category ({{categories}})
3. A detailed description
4. Supporting evidence from the text
5. A sentiment score (-1.0 to 1.0)
6. A frequency score (0.0 to 1.0)
7. Impact assessment
8. Suggested actions

{{industry_guidance}}

FORMAT YOUR RESPONSE AS JSON with the following structure:
{
  "patterns": [
    {
      "name": "Pattern Name",
      "category": "Pattern Category",
      "description": "Detailed description of the pattern",
      "evidence": ["Evidence 1", "Evidence 2"],
      "sentiment": 0.5,
      "frequency": 0.7,
      "impact": "Description of impact",
      "suggested_actions": ["Action 1", "Action 2"]
    }
  ]
}

EXTREMELY IMPORTANT: Your response MUST be a valid JSON object with a "patterns" array, even if you only identify one pattern. If you cannot identify any patterns, return an empty array like this:
{
  "patterns": []
}

DO NOT return a raw array or any other format. The response MUST be a JSON object with a "patterns" key containing an array of pattern objects.

Identify at least {{min_patterns}}-{{max_patterns}} distinct patterns. Focus on behaviors, needs, pain points, and workflows that appear multiple times.
"""

registry.register(
    name="pattern_recognition",
    template=pattern_recognition_template,
    version="1.0.0",
    description="Template for pattern recognition analysis",
    required_vars=["categories", "min_patterns", "max_patterns"],
    optional_vars={
        "industry_guidance": "",
        "min_patterns": 5,
        "max_patterns": 7
    },
    metadata={
        "task": "pattern_recognition",
        "author": "AI Team",
        "tags": ["pattern", "analysis", "design thinking"]
    }
)

# Register an insight generation template
insight_generation_template = """
You are a design thinking insights generator. Based on the following analysis, generate actionable insights.

{{#if themes}}
THEMES:
{{themes}}
{{/if}}

{{#if patterns}}
PATTERNS:
{{patterns}}
{{/if}}

FORMAT YOUR RESPONSE AS JSON with the following structure:
{
  "insights": [
    {
      "topic": "Insight Topic",
      "observation": "What was observed",
      "evidence": ["Evidence 1", "Evidence 2"],
      "implication": "What this means for the design",
      "recommendation": "Suggested action",
      "priority": "{{priority_levels}}"
    }
  ],
  "metadata": {
    "quality_score": 0.8,
    "confidence_scores": {
      "themes": 0.7,
      "patterns": 0.8,
      "sentiment": 0.6
    }
  }
}

Generate {{num_insights}} high-quality, actionable insights. Focus on implications for design and concrete recommendations.
"""

registry.register(
    name="insight_generation",
    template=insight_generation_template,
    version="1.0.0",
    description="Template for insight generation",
    required_vars=["priority_levels", "num_insights"],
    optional_vars={
        "themes": "",
        "patterns": "",
        "priority_levels": "High/Medium/Low",
        "num_insights": "3-5"
    },
    metadata={
        "task": "insight_generation",
        "author": "AI Team",
        "tags": ["insights", "analysis", "design thinking"]
    }
)

def get_pattern_recognition_prompt(data: Dict[str, Any]) -> str:
    """
    Get pattern recognition prompt using the template system.
    
    Args:
        data: Request data
        
    Returns:
        Prompt string
    """
    # Extract industry guidance if available
    industry_guidance = ""
    if "industry" in data:
        from backend.services.llm.prompts.industry_guidance import IndustryGuidance
        industry_guidance = IndustryGuidance.get_pattern_guidance(data["industry"])
    
    # Prepare variables for template rendering
    variables = {
        "categories": "Workflow, Coping Strategy, Decision Process, Workaround, Habit, Collaboration, Communication",
        "min_patterns": 5,
        "max_patterns": 7,
        "industry_guidance": industry_guidance
    }
    
    # Render the template
    return registry.render("pattern_recognition", variables)

def get_insight_generation_prompt(data: Dict[str, Any]) -> str:
    """
    Get insight generation prompt using the template system.
    
    Args:
        data: Request data
        
    Returns:
        Prompt string
    """
    # Get themes and patterns from request
    themes = data.get("themes", [])
    patterns = data.get("patterns", [])
    
    # Format themes and patterns as text
    theme_text = "\n".join([f"- {t.get('name', 'Unnamed')}: {t.get('definition', '')}" for t in themes[:5]])
    pattern_text = "\n".join([f"- {p.get('name', 'Unnamed')}: {p.get('description', '')}" for p in patterns[:5]])
    
    # Prepare variables for template rendering
    variables = {
        "themes": theme_text,
        "patterns": pattern_text,
        "priority_levels": "High/Medium/Low",
        "num_insights": "3-5"
    }
    
    # Render the template
    return registry.render("insight_generation", variables)

# Example usage
if __name__ == "__main__":
    # Example data
    example_data = {
        "industry": "healthcare",
        "themes": [
            {"name": "Data Access", "definition": "Challenges accessing patient data"},
            {"name": "Workflow Interruptions", "definition": "Frequent interruptions in clinical workflow"}
        ],
        "patterns": [
            {"name": "Workaround Documentation", "description": "Clinicians document workarounds for system limitations"},
            {"name": "Multiple System Navigation", "description": "Users navigate between multiple systems to complete tasks"}
        ]
    }
    
    # Get prompts
    pattern_prompt = get_pattern_recognition_prompt(example_data)
    insight_prompt = get_insight_generation_prompt(example_data)
    
    print("Pattern Recognition Prompt:")
    print(pattern_prompt)
    print("\nInsight Generation Prompt:")
    print(insight_prompt)
