"""
PRD generation prompt templates for LLM services.
"""

from typing import Dict, Any
from backend.services.llm.prompts.industry_guidance import IndustryGuidance
import logging

logger = logging.getLogger(__name__)

class PRDGenerationPrompts:
    """
    PRD generation prompt templates.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get PRD generation prompt.

        Args:
            data: Request data

        Returns:
            Prompt string
        """
        # Add support for direct PRD prompts if provided
        if "prompt" in data and data["prompt"]:
            # Use the prompt provided directly
            return data["prompt"]

        # Extract data for PRD generation
        text = data.get("text", "")
        personas = data.get("personas", [])
        patterns = data.get("patterns", [])
        insights = data.get("insights", [])
        themes = data.get("themes", [])
        industry = data.get("industry")
        prd_type = data.get("prd_type", "both")  # "operational", "technical", or "both"

        # Create context from available data
        context = PRDGenerationPrompts._create_context(text, personas, patterns, insights, themes)

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_prd_guidance(industry)
            return PRDGenerationPrompts.industry_specific_prompt(industry, industry_guidance, context, prd_type)

        # Fallback to standard PRD generation prompt
        return PRDGenerationPrompts.standard_prompt(context, prd_type)

    @staticmethod
    def _create_context(text: str, personas: list, patterns: list, insights: list, themes: list) -> str:
        """
        Create context for PRD generation.

        Args:
            text: Interview text
            personas: List of personas
            patterns: List of patterns
            insights: List of insights
            themes: List of themes

        Returns:
            Context string
        """
        context = ""

        # Add personas summary
        if personas:
            context += "\n## PERSONAS\n"
            for i, persona in enumerate(personas[:2]):  # Limit to 2 personas for context
                # Handle both dictionary and Pydantic object formats
                if hasattr(persona, 'dict') and callable(getattr(persona, 'dict')):
                    # It's a Pydantic model
                    persona_dict = persona.dict()
                    name = persona_dict.get('name', 'Unnamed')
                    description = persona_dict.get('description', 'No description')
                elif isinstance(persona, dict):
                    # It's a dictionary
                    persona_dict = persona
                    name = persona.get('name', 'Unnamed')
                    description = persona.get('description', 'No description')
                else:
                    # It's some other object, try to get attributes directly
                    name = getattr(persona, 'name', 'Unnamed')
                    description = getattr(persona, 'description', 'No description')
                    # Create a dictionary representation for consistent access below
                    persona_dict = {}
                    for field in ['challenges_and_frustrations', 'needs_and_desires', 'pain_points', 'patterns']:
                        if hasattr(persona, field):
                            persona_dict[field] = getattr(persona, field)

                context += f"\nPersona {i+1}: {name}\n"
                context += f"Description: {description}\n"

                # Add key fields
                for field in ['challenges_and_frustrations', 'needs_and_desires', 'pain_points']:
                    if field in persona_dict:
                        field_data = persona_dict[field]
                        if isinstance(field_data, dict) and 'value' in field_data:
                            context += f"{field.replace('_', ' ').title()}: {field_data['value']}\n"

                # Add patterns if available
                if 'patterns' in persona_dict and isinstance(persona_dict['patterns'], list):
                    context += "Key Patterns:\n"
                    for pattern in persona_dict['patterns'][:5]:  # Limit to 5 patterns
                        context += f"- {pattern}\n"

        # Add patterns summary
        if patterns:
            context += "\n## PATTERNS\n"
            for pattern in patterns[:10]:  # Limit to 10 patterns
                if isinstance(pattern, dict):
                    context += f"- {pattern.get('pattern', pattern.get('name', 'Unnamed pattern'))}\n"
                elif isinstance(pattern, str):
                    context += f"- {pattern}\n"

        # Add insights summary
        if insights:
            context += "\n## INSIGHTS\n"
            for insight in insights[:10]:  # Limit to 10 insights
                if isinstance(insight, dict):
                    context += f"- {insight.get('topic', 'Unnamed')}: {insight.get('observation', '')}\n"
                    if 'implication' in insight:
                        context += f"  Implication: {insight['implication']}\n"
                    if 'recommendation' in insight:
                        context += f"  Recommendation: {insight['recommendation']}\n"
                    if 'priority' in insight:
                        context += f"  Priority: {insight['priority']}\n"

        # Add themes summary
        if themes:
            context += "\n## THEMES\n"
            for theme in themes[:10]:  # Limit to 10 themes
                if isinstance(theme, dict):
                    context += f"- {theme.get('name', 'Unnamed')}: {theme.get('definition', '')}\n"

        return context

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str, context: str, prd_type: str) -> str:
        """
        Get industry-specific PRD generation prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            context: Analysis context
            prd_type: Type of PRD to generate

        Returns:
            Prompt string
        """
        base_prompt = PRDGenerationPrompts.standard_prompt(context, prd_type)

        # Add industry-specific guidance
        industry_section = f"""
        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        Ensure all requirements and user stories are tailored to the specific needs and constraints of the {industry} industry.
        """

        # Insert industry guidance before the final instructions
        return base_prompt.replace("FORMAT YOUR RESPONSE AS JSON", f"{industry_section}\n\nFORMAT YOUR RESPONSE AS JSON")

    @staticmethod
    def standard_prompt(context: str, prd_type: str) -> str:
        """
        Get standard PRD generation prompt.

        Args:
            context: Analysis context
            prd_type: Type of PRD to generate ("operational", "technical", or "both")

        Returns:
            Prompt string
        """
        # Base prompt with instructions
        base_prompt = f"""
        You are a Product Requirements Document (PRD) generator. Based on the following analysis of user research data, generate a comprehensive PRD that product teams can use for development planning.

        {context}

        """

        # Add specific instructions based on PRD type
        if prd_type == "operational":
            base_prompt += """
            Generate an Operational PRD that focuses on user-facing features, workflows, and business requirements.

            Your PRD should include the following sections:
            1. Objectives - Clear goals the product should achieve
            2. Scope - What's included and excluded from the product
            3. User Stories - Comprehensive user stories with acceptance criteria in Gherkin format
            4. Requirements - Detailed functional and non-functional requirements
            5. Success Metrics - How success will be measured

            For each user story, include:
            - "As a [user role], I want to [action/feature] so that [benefit/outcome]"
            - Acceptance criteria in Gherkin format (Given/When/Then)
            - A "What, Why, How" section explaining:
              * What: The specific feature or functionality being requested
              * Why: The business or user value this provides (go deep on the why)
              * How: A high-level approach to implementing this feature
            """
        elif prd_type == "technical":
            base_prompt += """
            Generate a Technical PRD that focuses on implementation details, architecture changes, and development requirements.

            Your PRD should include the following sections:
            1. Objectives - Technical goals and constraints
            2. Scope - Technical boundaries and limitations
            3. Architecture - System design and component interactions
            4. Implementation Requirements - Detailed technical specifications
            5. Testing & Validation - How the implementation will be verified
            6. Success Metrics - Technical performance indicators

            For each technical requirement, include:
            - A clear description of what needs to be implemented
            - Technical constraints and considerations
            - Dependencies on other systems or components
            - Performance expectations and metrics
            """
        else:  # "both" or any other value
            base_prompt += """
            Generate both an Operational PRD and a Technical PRD.

            The Operational PRD should focus on user-facing features, workflows, and business requirements, including:
            1. Objectives - Clear goals the product should achieve
            2. Scope - What's included and excluded from the product
            3. User Stories - Comprehensive user stories with acceptance criteria in Gherkin format
            4. Requirements - Detailed functional and non-functional requirements
            5. Success Metrics - How success will be measured

            For each user story, include:
            - "As a [user role], I want to [action/feature] so that [benefit/outcome]"
            - Acceptance criteria in Gherkin format (Given/When/Then)
            - A "What, Why, How" section explaining:
              * What: The specific feature or functionality being requested
              * Why: The business or user value this provides (go deep on the why)
              * How: A high-level approach to implementing this feature

            The Technical PRD should focus on implementation details, architecture changes, and development requirements, including:
            1. Objectives - Technical goals and constraints
            2. Scope - Technical boundaries and limitations
            3. Architecture - System design and component interactions
            4. Implementation Requirements - Detailed technical specifications
            5. Testing & Validation - How the implementation will be verified
            6. Success Metrics - Technical performance indicators
            """

        # Add formatting instructions
        base_prompt += """
        FORMAT YOUR RESPONSE AS JSON with the following structure:
        {
          "prd_type": "operational", // or "technical", or "both"
          "operational_prd": { // Include if prd_type is "operational" or "both"
            "objectives": [
              {
                "title": "Objective Title",
                "description": "Detailed description"
              }
            ],
            "scope": {
              "included": ["Item 1", "Item 2"],
              "excluded": ["Item 1", "Item 2"]
            },
            "user_stories": [
              {
                "story": "As a [user role], I want to [action/feature] so that [benefit/outcome]",
                "acceptance_criteria": [
                  "Given [context]",
                  "When [action]",
                  "Then [outcome]"
                ],
                "what": "Description of the feature",
                "why": "Business or user value",
                "how": "High-level implementation approach"
              }
            ],
            "requirements": [
              {
                "id": "REQ-001",
                "title": "Requirement Title",
                "description": "Detailed description",
                "priority": "High/Medium/Low",
                "related_user_stories": ["US-001", "US-002"]
              }
            ],
            "success_metrics": [
              {
                "metric": "Metric Name",
                "target": "Target Value",
                "measurement_method": "How it will be measured"
              }
            ]
          },
          "technical_prd": { // Include if prd_type is "technical" or "both"
            "objectives": [
              {
                "title": "Technical Objective",
                "description": "Detailed description"
              }
            ],
            "scope": {
              "included": ["Component 1", "Component 2"],
              "excluded": ["Component 3", "Component 4"]
            },
            "architecture": {
              "overview": "High-level architecture description",
              "components": [
                {
                  "name": "Component Name",
                  "purpose": "Component Purpose",
                  "interactions": ["Interaction with other components"]
                }
              ],
              "data_flow": "Description of data flow"
            },
            "implementation_requirements": [
              {
                "id": "TECH-001",
                "title": "Technical Requirement",
                "description": "Detailed description",
                "priority": "High/Medium/Low",
                "dependencies": ["TECH-002"]
              }
            ],
            "testing_validation": [
              {
                "test_type": "Test Type",
                "description": "Test Description",
                "success_criteria": "Success Criteria"
              }
            ],
            "success_metrics": [
              {
                "metric": "Technical Metric",
                "target": "Target Value",
                "measurement_method": "How it will be measured"
              }
            ]
          }
        }

        IMPORTANT:
        - Focus on the highest priority insights from the analysis
        - Ensure all requirements are specific, measurable, achievable, relevant, and time-bound (SMART)
        - Make user stories detailed and actionable
        - Include only information that can be reasonably inferred from the provided analysis
        """

        return base_prompt
