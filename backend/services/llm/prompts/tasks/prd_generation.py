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
        context = PRDGenerationPrompts._create_context(
            text, personas, patterns, insights, themes
        )

        # Get industry-specific guidance if available
        if industry:
            industry_guidance = IndustryGuidance.get_prd_guidance(industry)
            return PRDGenerationPrompts.industry_specific_prompt(
                industry, industry_guidance, context, prd_type
            )

        # Fallback to standard PRD generation prompt
        return PRDGenerationPrompts.standard_prompt(context, prd_type)

    @staticmethod
    def _extract_field_value(field_data) -> str:
        """Extract value from various field formats (AttributedField, dict, string)."""
        if field_data is None:
            return ""
        if isinstance(field_data, str):
            return field_data
        if isinstance(field_data, dict):
            # AttributedField format: {"value": "...", "evidence": [...]}
            if "value" in field_data:
                return str(field_data["value"])
            # Sometimes just a plain dict with content
            return str(field_data)
        return str(field_data)

    @staticmethod
    def _extract_evidence(field_data) -> list:
        """Extract evidence/quotes from field data as plain strings."""
        if field_data is None:
            return []
        if isinstance(field_data, dict):
            if "evidence" in field_data and isinstance(field_data["evidence"], list):
                quotes = []
                for item in field_data["evidence"]:
                    if isinstance(item, dict):
                        # Extract the quote text from evidence object
                        quote_text = item.get("quote", item.get("text", ""))
                        if quote_text:
                            quotes.append(quote_text)
                    elif isinstance(item, str):
                        quotes.append(item)
                return quotes
        return []

    @staticmethod
    def _create_context(
        text: str, personas: list, patterns: list, insights: list, themes: list
    ) -> str:
        """
        Create comprehensive context for PRD generation using ALL analysis data.

        Args:
            text: Interview text
            personas: List of personas (ALL personas from analysis)
            patterns: List of patterns (ALL patterns from analysis)
            insights: List of insights (ALL insights from analysis)
            themes: List of themes (ALL themes from analysis)

        Returns:
            Context string with full analysis data
        """
        context = ""

        # Add ALL personas with complete details
        if personas:
            context += "\n## PERSONAS (ALL STAKEHOLDERS FROM ANALYSIS)\n"
            for i, persona in enumerate(personas):  # Include ALL personas
                # Handle both dictionary and Pydantic object formats
                if hasattr(persona, "model_dump") and callable(getattr(persona, "model_dump")):
                    persona_dict = persona.model_dump()
                elif hasattr(persona, "dict") and callable(getattr(persona, "dict")):
                    persona_dict = persona.dict()
                elif isinstance(persona, dict):
                    persona_dict = persona
                else:
                    # Convert object attributes to dict
                    persona_dict = {}
                    for field in ["name", "description", "archetype", "demographics",
                                  "goals_and_motivations", "challenges_and_frustrations",
                                  "needs_and_desires", "pain_points", "patterns",
                                  "key_quotes", "supporting_evidence_summary",
                                  "overall_confidence"]:
                        if hasattr(persona, field):
                            persona_dict[field] = getattr(persona, field)

                name = persona_dict.get("name", "Unnamed")
                description = persona_dict.get("description", "No description")
                archetype = persona_dict.get("archetype", "")

                context += f"\n### Persona {i+1}: {name}\n"
                if archetype:
                    context += f"Archetype: {archetype}\n"
                context += f"Description: {description}\n"

                # Demographics
                demographics = persona_dict.get("demographics")
                if demographics:
                    demo_value = PRDGenerationPrompts._extract_field_value(demographics)
                    if demo_value:
                        context += f"Demographics: {demo_value}\n"

                # Goals and Motivations
                goals = persona_dict.get("goals_and_motivations")
                if goals:
                    goals_value = PRDGenerationPrompts._extract_field_value(goals)
                    if goals_value:
                        context += f"Goals & Motivations: {goals_value}\n"
                    goals_evidence = PRDGenerationPrompts._extract_evidence(goals)
                    if goals_evidence:
                        context += "  Supporting Quotes:\n"
                        for quote in goals_evidence[:3]:
                            context += f"    - \"{quote}\"\n"

                # Challenges and Frustrations
                challenges = persona_dict.get("challenges_and_frustrations")
                if challenges:
                    challenges_value = PRDGenerationPrompts._extract_field_value(challenges)
                    if challenges_value:
                        context += f"Challenges & Frustrations: {challenges_value}\n"
                    challenges_evidence = PRDGenerationPrompts._extract_evidence(challenges)
                    if challenges_evidence:
                        context += "  Supporting Quotes:\n"
                        for quote in challenges_evidence[:3]:
                            context += f"    - \"{quote}\"\n"

                # Needs and Desires
                needs = persona_dict.get("needs_and_desires")
                if needs:
                    needs_value = PRDGenerationPrompts._extract_field_value(needs)
                    if needs_value:
                        context += f"Needs & Desires: {needs_value}\n"
                    needs_evidence = PRDGenerationPrompts._extract_evidence(needs)
                    if needs_evidence:
                        context += "  Supporting Quotes:\n"
                        for quote in needs_evidence[:3]:
                            context += f"    - \"{quote}\"\n"

                # Pain Points
                pain_points = persona_dict.get("pain_points")
                if pain_points:
                    pain_value = PRDGenerationPrompts._extract_field_value(pain_points)
                    if pain_value:
                        context += f"Pain Points: {pain_value}\n"

                # Key Quotes
                key_quotes = persona_dict.get("key_quotes")
                if key_quotes:
                    quotes_value = PRDGenerationPrompts._extract_field_value(key_quotes)
                    if quotes_value:
                        context += f"Key Quotes: {quotes_value}\n"

                # Behavioral Patterns for this persona
                persona_patterns = persona_dict.get("patterns")
                if persona_patterns and isinstance(persona_patterns, list):
                    context += "Behavioral Patterns:\n"
                    for pattern in persona_patterns:
                        context += f"  - {pattern}\n"

                # Supporting Evidence Summary
                evidence_summary = persona_dict.get("supporting_evidence_summary")
                if evidence_summary and isinstance(evidence_summary, list):
                    context += "Key Evidence:\n"
                    for evidence in evidence_summary[:5]:
                        context += f"  - \"{evidence}\"\n"

                # Confidence score
                confidence = persona_dict.get("overall_confidence")
                if confidence is not None:
                    context += f"Confidence Score: {confidence}\n"

        # Add ALL patterns with complete details
        if patterns:
            context += "\n## PATTERNS (ALL BEHAVIORAL PATTERNS FROM ANALYSIS)\n"
            for i, pattern in enumerate(patterns):  # Include ALL patterns
                if isinstance(pattern, dict):
                    name = pattern.get("name", pattern.get("pattern", "Unnamed pattern"))
                    category = pattern.get("category", "")
                    description = pattern.get("description", "")
                    frequency = pattern.get("frequency", "")
                    impact = pattern.get("impact", "")
                    evidence = pattern.get("evidence", [])
                    suggested_actions = pattern.get("suggested_actions", [])

                    context += f"\n### Pattern {i+1}: {name}\n"
                    if category:
                        context += f"Category: {category}\n"
                    if description:
                        context += f"Description: {description}\n"
                    if frequency:
                        context += f"Frequency: {frequency}\n"
                    if impact:
                        context += f"Impact: {impact}\n"
                    if evidence and isinstance(evidence, list):
                        context += "Evidence:\n"
                        for quote in evidence[:3]:
                            context += f"  - \"{quote}\"\n"
                    if suggested_actions and isinstance(suggested_actions, list):
                        context += "Suggested Actions:\n"
                        for action in suggested_actions:
                            context += f"  - {action}\n"
                elif isinstance(pattern, str):
                    context += f"- {pattern}\n"

        # Add ALL insights with complete details
        if insights:
            context += "\n## INSIGHTS (ALL INSIGHTS FROM ANALYSIS)\n"
            for i, insight in enumerate(insights):  # Include ALL insights
                if isinstance(insight, dict):
                    topic = insight.get("topic", "Unnamed")
                    observation = insight.get("observation", "")
                    implication = insight.get("implication", "")
                    recommendation = insight.get("recommendation", "")
                    priority = insight.get("priority", "")
                    evidence = insight.get("evidence", [])

                    context += f"\n### Insight {i+1}: {topic}\n"
                    if observation:
                        context += f"Observation: {observation}\n"
                    if implication:
                        context += f"Implication: {implication}\n"
                    if recommendation:
                        context += f"Recommendation: {recommendation}\n"
                    if priority:
                        context += f"Priority: {priority}\n"
                    if evidence and isinstance(evidence, list):
                        context += "Evidence:\n"
                        for quote in evidence[:3]:
                            context += f"  - \"{quote}\"\n"

        # Add ALL themes with complete details
        if themes:
            context += "\n## THEMES (ALL THEMES FROM ANALYSIS)\n"
            for i, theme in enumerate(themes):  # Include ALL themes
                if isinstance(theme, dict):
                    name = theme.get("name", "Unnamed")
                    definition = theme.get("definition", "")
                    frequency = theme.get("frequency", "")
                    sentiment = theme.get("sentiment", "")
                    statements = theme.get("statements", [])
                    keywords = theme.get("keywords", [])

                    context += f"\n### Theme {i+1}: {name}\n"
                    if definition:
                        context += f"Definition: {definition}\n"
                    if frequency:
                        context += f"Frequency: {frequency}\n"
                    if sentiment is not None and sentiment != "":
                        context += f"Sentiment: {sentiment}\n"
                    if keywords and isinstance(keywords, list):
                        context += f"Keywords: {', '.join(keywords)}\n"
                    if statements and isinstance(statements, list):
                        context += "Supporting Statements:\n"
                        for statement in statements[:5]:
                            context += f"  - \"{statement}\"\n"

        return context

    @staticmethod
    def industry_specific_prompt(
        industry: str, industry_guidance: str, context: str, prd_type: str
    ) -> str:
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
        return base_prompt.replace(
            "FORMAT YOUR RESPONSE AS JSON",
            f"{industry_section}\n\nFORMAT YOUR RESPONSE AS JSON",
        )

    @staticmethod
    def standard_prompt(context: str, prd_type: str) -> str:
        """
        Get standard PRD generation prompt (domain-agnostic master blueprint).

        Args:
            context: Analysis context
            prd_type: Type of PRD to generate ("operational", "technical", or "both")

        Returns:
            Prompt string
        """
        # Base prompt with analysis context
        base_prompt = f"""
        You are a world-class strategic consultant and product manager.
        Based on the following research analysis context, generate a comprehensive, domain-agnostic PRD that can guide
        the creation of a new product, service, or initiative. Maintain explicit traceability from stakeholder problems
        to specifications and ensure prioritization is driven by business impact.

        {context}

        PHASE 1: STRATEGIC ANALYSIS & SYNTHESIS
        1) Thematic Analysis:
           - Use ALL themes provided in the analysis context. Include their Frequency score (0.0–1.0) AND Impact Score (Low | Medium | High).
             A 'High' Impact Score means direct and significant loss of revenue, client trust, operational capacity, or brand value.
           - Reference the supporting statements and keywords from each theme as evidence.
        2) Stakeholder Synthesis:
           - Use ALL stakeholder personas provided in the analysis context (not just 2-4, but every persona that was identified).
           - For each persona, leverage their goals, frustrations, pain points, behavioral patterns, and key quotes.
           - Create scenarios for EACH persona, ensuring complete coverage of all stakeholder needs.
        3) Needs Assessment:
           - Split into two categories:
             a) Solution Requirements: what the solution must do or be (derived from ALL personas' needs and pain points)
             b) Relationship Requirements: how we must communicate, train, support, and build trust while delivering

        PHASE 2: PROJECT DEFINITION DOCUMENT GENERATION
        - Produce two parts:
          Part A: Business Requirements Document (BRD) – the WHAT and WHY
          Part B: Implementation Blueprint – the HOW

        Part A (BRD) must include:
          1. Objectives: Clear, measurable objectives.
          2. Scope: Explicit Included and Excluded items for the initial version.
          3. Stakeholder Scenarios / Use Cases: Write scenarios (As a [persona], I need [goal], so that [benefit]).
             Each scenario MUST include a Justification section that links to a high-impact theme or persona pain point.
          4. Core Specifications: Non-technical specifications derived from scenarios.
             The priority of each specification MUST be determined by Impact Score × Frequency of the underlying need.
          5. Success Metrics: Specific, quantifiable metrics with targets and measurement methods.

        Part B (Implementation Blueprint) must include:
          1. Solution Overview: Overall approach to building and delivering.
          2. System/Solution Structure: Core components and how they interact (for services: delivery phases; for products: modules/components).
          3. Core Components & Methodology: Key materials, technologies, or methodologies.
          4. Key Implementation Tasks: Primary technical/operational tasks.
          5. Quality Assurance & Validation: Testing/validation plan to ensure fitness for purpose.

        PHASE 3: STRATEGIC & RELATIONAL REFINEMENTS
          1. Stakeholder Success Plan (Relationship Requirements): Concrete actions/features to build trust, ensure smooth
             adoption, and provide support (e.g., training workshops, transparent dashboards, dedicated contacts).
          2. Tiered Solution Models: If stakeholder scale/needs vary, propose tiered models with clear differences in
             scope, complexity, and likely investment.

        IMPORTANT CONSTRAINTS
        - USE ALL CONTEXT: You MUST use ALL personas, themes, patterns, and insights provided. Do not skip or summarize them.
          Create stakeholder scenarios for EVERY persona. Reference ALL themes in the justifications.
        - Preserve explicit traceability: Every scenario must include a Justification linking back to specific high-impact
          themes or persona pain points. Use the exact evidence quotes provided in the analysis.
        - Specifications must reference the scenarios they satisfy.
        - Prioritization must be driven by Impact × Frequency (include the numeric frequency and categorical impact used).
        - Keep language domain-agnostic (no software-only jargon) while remaining concrete and actionable.
        - Include verbatim quotes from the analysis as evidence_quotes in justifications.
        """

        # Tailor instructions by PRD type without changing the overall JSON shape
        if prd_type == "operational":
            base_prompt += """
            Generate an Operational PRD focusing on BRD and Implementation Blueprint. Include all PHASES and constraints.
            """
        elif prd_type == "technical":
            base_prompt += """
            Generate a Technical PRD emphasizing Implementation Blueprint details (structure, components, tasks, QA),
            while still summarizing BRD objectives/scope to maintain traceability. Include all PHASES and constraints.

            TECHNICAL PRD REQUIREMENTS:
            - Include 2-4 distinct technical objectives
            - Define 3-6 system components with technology stack recommendations
            - Specify 4-8 implementation requirements with effort estimates
            - Include API specifications for key endpoints
            - Define 3-5 test types (unit, integration, E2E, performance, security)
            - Include non-functional requirements (performance, scalability, reliability, security)
            - Define 2-4 measurable technical success metrics
            """
        else:
            base_prompt += """
            Generate BOTH Operational and Technical PRDs, ensuring consistency and shared traceability across parts.
            Include all PHASES and constraints.

            TECHNICAL PRD REQUIREMENTS (for technical_prd section):
            - Include 2-4 distinct technical objectives
            - Define 3-6 system components with technology stack recommendations
            - Specify 4-8 implementation requirements with effort estimates
            - Include API specifications for key endpoints
            - Define 3-5 test types (unit, integration, E2E, performance, security)
            - Include non-functional requirements (performance, scalability, reliability, security)
            - Define 2-4 measurable technical success metrics
            """

        # Strict JSON formatting with schema that preserves existing consumers and adds BRD/Blueprint containers
        base_prompt += """
        FORMAT YOUR RESPONSE AS JSON with the following structure (do not include markdown):
        {
          "prd_type": "operational" | "technical" | "both",
          "operational_prd": { // include if prd_type is "operational" or "both"
            // Part A: BRD – the WHAT and WHY
            "brd": {
              "objectives": [ { "title": "...", "description": "..." } ],
              "scope": { "included": ["..."], "excluded": ["..."] },
              "stakeholder_scenarios": [
                {
                  "scenario": "As a [persona], I need [goal], so that [benefit]",
                  "what": "The specific feature, capability, or solution element that addresses this need",
                  "why": "The business value, user benefit, or problem being solved",
                  "how": "High-level implementation approach or mechanism",
                  "acceptance_criteria": ["Given ...", "When ...", "Then ..."],
                  "justification": {
                    "linked_theme": "Name of high-impact theme or persona pain point",
                    "impact_score": "High" | "Medium" | "Low",
                    "frequency": 0.0,
                    "evidence_quotes": ["verbatim quote 1", "verbatim quote 2"]
                  }
                }
              ],
              "core_specifications": [
                {
                  "id": "REQ-001",
                  "specification": "Non-technical specification statement",
                  "priority": "High" | "Medium" | "Low",
                  "weighting": {
                    "impact_score": "High" | "Medium" | "Low",
                    "frequency": 0.0,
                    "priority_basis": "Impact x Frequency"
                  },
                  "related_scenarios": ["scenario reference or id"]
                }
              ],
              "success_metrics": [
                { "metric": "...", "target": "...", "measurement_method": "..." }
              ]
            },

            // Part B: Implementation Blueprint – the HOW
            "implementation_blueprint": {
              "solution_overview": "High-level approach",
              "solution_structure": [
                { "component": "...", "role": "...", "interactions": ["..."] }
              ],
              "core_components_and_methodology": [
                { "name": "...", "details": "materials/technologies/methodologies" }
              ],
              "key_implementation_tasks": [
                { "task": "...", "dependencies": ["..."] }
              ],
              "quality_assurance_and_validation": [
                { "test_type": "...", "success_criteria": "..." }
              ],
              "stakeholder_success_plan": {
                "relationship_requirements": [
                  { "need": "trust/communication/training", "actions": ["..."] }
                ],
                "adoption_support": ["..."]
              },
              "tiered_solution_models": [
                { "tier": "Basic|Pro|Enterprise", "target_stakeholder": "SMB|Enterprise|...", "scope": "...", "complexity": "...", "investment": "relative" }
              ]
            },

            // Backward compatibility: mirror key BRD fields at top-level for existing UIs
            "objectives": [ { "title": "...", "description": "..." } ],
            "scope": { "included": ["..."], "excluded": ["..."] },
            "user_stories": [ // mirror: transform stakeholder_scenarios into user stories if needed
              {
                "story": "As a [persona], I want to [goal] so that [benefit]",
                "acceptance_criteria": ["Given ...", "When ...", "Then ..."],
                "what": "Feature/requirement (from specification)",
                "why": "Business/user value (from justification)",
                "how": "High-level approach"
              }
            ],
            "requirements": [ // mirror: map from core_specifications
              {
                "id": "REQ-001",
                "title": "Specification title",
                "description": "Spec description",
                "priority": "High|Medium|Low",
                "related_user_stories": ["..."]
              }
            ],
            "success_metrics": [ { "metric": "...", "target": "...", "measurement_method": "..." } ]
          },

          "technical_prd": { // include if prd_type is "technical" or "both"
            "objectives": [ // MUST include 2-4 technical objectives
              { "title": "...", "description": "..." }
            ],
            "scope": { "included": ["..."], "excluded": ["..."] },
            "architecture": {
              "overview": "High-level architecture/structure",
              "components": [ // MUST include 3-6 components covering: data layer, business logic, integration, UI, security
                { "name": "...", "purpose": "...", "interactions": ["..."], "technology_stack": "suggested technologies" }
              ],
              "data_flow": "Detailed description of how data flows through the system",
              "security_considerations": "Authentication, authorization, encryption requirements"
            },
            "implementation_requirements": [ // MUST include 4-8 technical requirements
              {
                "id": "TECH-001",
                "title": "...",
                "description": "Detailed technical requirement",
                "priority": "High|Medium|Low",
                "dependencies": ["..."],
                "effort_estimate": "Small|Medium|Large",
                "technical_notes": "Implementation guidance or considerations"
              }
            ],
            "api_specifications": [ // Include key API endpoints if applicable
              { "endpoint": "/api/...", "method": "GET|POST|PUT|DELETE", "purpose": "...", "request_body": "...", "response": "..." }
            ],
            "testing_validation": [ // MUST include 3-5 test types
              { "test_type": "Unit|Integration|E2E|Performance|Security", "description": "...", "success_criteria": "...", "coverage_target": "percentage or scope" }
            ],
            "non_functional_requirements": [ // Include NFRs
              { "category": "Performance|Scalability|Reliability|Security", "requirement": "...", "target": "...", "measurement": "..." }
            ],
            "success_metrics": [ // MUST include 2-4 technical metrics
              { "metric": "...", "target": "...", "measurement_method": "..." }
            ]
          }
        }

        STRICTNESS:
        - Output MUST be a single valid JSON object (no markdown). Use the exact field names above.
        - MANDATORY: Include operational_prd.brd and operational_prd.implementation_blueprint when operational_prd is present.
        - Do NOT omit keys; if a section has no content, include the key with an empty array/object rather than removing it.
        - Populate all fields that are applicable given the analysis context.
        - For prioritization, always include the Impact × Frequency rationale within weighting/priority.
        """

        return base_prompt
