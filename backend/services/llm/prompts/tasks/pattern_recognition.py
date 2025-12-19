"""
Pattern recognition prompt templates for LLM services.

This module provides prompt templates for pattern recognition tasks,
optimized for use with the Instructor library and Pydantic models.

Supports stakeholder-aware pattern extraction where stakeholder context
is passed into the LLM to enable attribution of patterns to specific
stakeholder types and identification of cross-stakeholder dynamics.
"""

from typing import Dict, Any, Optional, List
from backend.services.llm.prompts.industry_guidance import IndustryGuidance
from backend.models.pattern import Pattern, PatternResponse, ALLOWED_PATTERN_CATEGORIES


class PatternRecognitionPrompts:
    """
    Pattern recognition prompt templates.

    This class provides prompt templates for pattern recognition tasks,
    including industry-specific prompts, stakeholder-aware prompts, and
    structured output guidance.
    """

    @staticmethod
    def get_prompt(data: Dict[str, Any]) -> str:
        """
        Get pattern recognition prompt based on data.

        Args:
            data: Request data containing text and optional industry/stakeholders

        Returns:
            Prompt string optimized for structured output
        """
        # Check if industry is provided
        industry = data.get("industry")

        # Check if stakeholder context is provided
        stakeholders = data.get("stakeholders")
        stakeholder_context = data.get("stakeholder_context")

        # Get sample text (truncate if too long)
        text = data.get("text", "")
        if len(text) > 8000:
            text = text[:8000] + "..."

        # Get industry-specific guidance if available
        industry_guidance = ""
        if industry:
            industry_guidance = IndustryGuidance.get_pattern_guidance(industry)

        # Use stakeholder-aware prompt if stakeholder context is provided
        if stakeholders or stakeholder_context:
            return PatternRecognitionPrompts.stakeholder_aware_prompt(
                text=text,
                stakeholders=stakeholders,
                stakeholder_context=stakeholder_context,
                industry=industry,
                industry_guidance=industry_guidance
            )

        # Fall back to industry-specific or standard prompt
        if industry:
            return PatternRecognitionPrompts.industry_specific_prompt(industry, industry_guidance, text)

        return PatternRecognitionPrompts.standard_prompt(text)

    @staticmethod
    def _format_stakeholder_context(
        stakeholders: Optional[List[Dict[str, Any]]] = None,
        stakeholder_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Format stakeholder information for inclusion in the prompt.

        Args:
            stakeholders: List of detected stakeholder dicts
            stakeholder_context: Additional context about stakeholders

        Returns:
            Formatted stakeholder context string
        """
        lines = ["STAKEHOLDER CONTEXT:"]
        lines.append("The following stakeholder types have been identified in this data:")
        lines.append("")

        stakeholder_summary = {}

        if stakeholders:
            for s in stakeholders:
                s_type = s.get("stakeholder_type", "unknown")
                s_id = s.get("stakeholder_id", "")
                if s_type not in stakeholder_summary:
                    stakeholder_summary[s_type] = []
                stakeholder_summary[s_type].append(s_id)

        if stakeholder_context and "detected_stakeholders" in stakeholder_context:
            for s in stakeholder_context["detected_stakeholders"]:
                s_type = s.get("stakeholder_type", "unknown")
                s_id = s.get("stakeholder_id", "")
                if s_type not in stakeholder_summary:
                    stakeholder_summary[s_type] = []
                if s_id and s_id not in stakeholder_summary[s_type]:
                    stakeholder_summary[s_type].append(s_id)

        # Format each stakeholder type
        type_labels = {
            "decision_maker": "Decision Makers",
            "primary_customer": "Primary Customers",
            "secondary_user": "Secondary Users",
            "influencer": "Influencers",
            "unknown": "Unclassified"
        }

        for s_type, s_ids in stakeholder_summary.items():
            label = type_labels.get(s_type, s_type.replace("_", " ").title())
            ids_str = ", ".join(s_ids) if s_ids else "unidentified"
            lines.append(f"- {label}: {len(s_ids)} participants ({ids_str})")

        if not stakeholder_summary:
            lines.append("- No specific stakeholder types detected")
            lines.append("- Analyze the text to infer stakeholder roles from context")

        return "\n".join(lines)

    @staticmethod
    def stakeholder_aware_prompt(
        text: str,
        stakeholders: Optional[List[Dict[str, Any]]] = None,
        stakeholder_context: Optional[Dict[str, Any]] = None,
        industry: Optional[str] = None,
        industry_guidance: str = ""
    ) -> str:
        """
        Get stakeholder-aware pattern recognition prompt.

        This prompt instructs the LLM to attribute patterns to specific
        stakeholder types and identify cross-stakeholder dynamics.

        Args:
            text: Text to analyze
            stakeholders: List of detected stakeholders
            stakeholder_context: Additional stakeholder context
            industry: Optional industry name
            industry_guidance: Optional industry-specific guidance

        Returns:
            System message string with stakeholder awareness
        """
        # Get the Pydantic schema for structured output
        pattern_response_schema = PatternResponse.model_json_schema()

        # Format stakeholder context
        stakeholder_section = PatternRecognitionPrompts._format_stakeholder_context(
            stakeholders, stakeholder_context
        )

        # Format industry context if provided
        industry_section = ""
        if industry:
            industry_section = f"""
        INDUSTRY CONTEXT: {industry.upper()}
        {industry_guidance}
        """

        # Build category list with stakeholder-aware categories
        categories = ", ".join(ALLOWED_PATTERN_CATEGORIES)

        return f"""
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in interview data with STAKEHOLDER ATTRIBUTION.

        {stakeholder_section}
        {industry_section}

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)
        - STAKEHOLDER ATTRIBUTION tracks WHO exhibits each pattern

        ANALYZE THIS TEXT:
        {text}

        Focus on identifying recurring BEHAVIORS and ACTION SEQUENCES, paying special attention to:
        1. Which stakeholder types exhibit each pattern
        2. Whether patterns vary across different stakeholder types
        3. Cross-stakeholder dynamics (conflicts, consensus, collaboration)

        PATTERN CATEGORIES (use one of these):

        BEHAVIORAL CATEGORIES (individual patterns):
        - Workflow: Sequences of actions users take to accomplish goals
        - Coping Strategy: Ways users overcome obstacles or limitations
        - Decision Process: How users make choices
        - Workaround: Alternative approaches when standard methods fail
        - Habit: Repeated behaviors users exhibit
        - Collaboration: How users work with others
        - Communication: How users share information
        - Information Seeking: How users find and validate information
        - Trust Verification: How users build and verify trust

        STAKEHOLDER-AWARE CATEGORIES (cross-stakeholder patterns):
        - Stakeholder Conflict: Patterns where different stakeholder types have opposing behaviors or approaches
        - Role-Specific Behavior: Patterns unique to one stakeholder type
        - Cross-Role Collaboration: Patterns showing how different stakeholder types work together

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A category from the list above: {categories}
        3. A detailed description highlighting ACTIONS or BEHAVIORS
        4. A frequency score (0.0-1.0) indicating prevalence
        5. A sentiment score (-1.0 to 1.0)
        6. Supporting evidence: AT LEAST 2-3 DIRECT QUOTES from the text, each from a different participant if possible. More evidence = more credible pattern.
        7. The impact of this pattern
        8. Suggested actions (2-3 recommendations)
        9. stakeholder_distribution: Which stakeholder types exhibit this pattern and at what frequency
           Example: {{"decision_maker": 0.8, "primary_customer": 0.3}}
        10. is_cross_stakeholder: true if the pattern involves multiple stakeholder types
        11. primary_stakeholder_type: The stakeholder type that most frequently exhibits this pattern

        Your response MUST follow this exact JSON schema:
        ```
        {pattern_response_schema}
        ```

        Example of a well-formatted STAKEHOLDER-AWARE pattern:
        ```
        {{
          "patterns": [
            {{
              "name": "Budget Approval Bottleneck",
              "category": "Stakeholder Conflict",
              "description": "Decision makers require multiple approval cycles while primary customers express frustration with delays in purchasing decisions",
              "frequency": 0.75,
              "sentiment": -0.4,
              "evidence": [
                  "I need to get sign-off from three different managers before I can approve any purchase over $500 [Decision Maker]",
                  "We've been waiting for approval for two weeks now and our project is stalled [Primary Customer]",
                  "The approval chain is so long that by the time we get sign-off, the original need has changed [Primary Customer]"
              ],
              "impact": "Creates friction between stakeholder groups and delays project timelines",
              "suggested_actions": [
                  "Implement tiered approval thresholds based on purchase amount",
                  "Create a fast-track approval process for time-sensitive purchases"
              ],
              "stakeholder_distribution": {{
                  "decision_maker": 0.9,
                  "primary_customer": 0.7
              }},
              "is_cross_stakeholder": true,
              "primary_stakeholder_type": "decision_maker",
              "conflict_level": 0.6
            }},
            {{
              "name": "Vendor Research Ritual",
              "category": "Role-Specific Behavior",
              "description": "Decision makers consistently follow a specific research protocol before engaging with new vendors",
              "frequency": 0.85,
              "sentiment": 0.2,
              "evidence": [
                  "I always check G2 reviews first, then reach out to my network for references [Decision Maker]",
                  "Our procurement team has a standard 5-step vendor evaluation checklist [Decision Maker]",
                  "Before any vendor meeting, I do at least an hour of research on their company and competitors [Decision Maker]",
                  "We never move forward without at least three customer references from similar-sized companies [Decision Maker]"
              ],
              "impact": "Ensures thorough vendor evaluation but extends sales cycle duration",
              "suggested_actions": [
                  "Prepare reference materials that align with common research steps",
                  "Proactively provide G2 reviews and case studies in initial outreach"
              ],
              "stakeholder_distribution": {{
                  "decision_maker": 0.85
              }},
              "is_cross_stakeholder": false,
              "primary_stakeholder_type": "decision_maker"
            }}
          ]
        }}
        ```

        EXTREMELY IMPORTANT: Your response MUST be a valid JSON object with a "patterns" array.

        CRITICAL REQUIREMENTS:
        1. EVERY pattern MUST have a clear, descriptive name
        2. EVERY pattern MUST be assigned to one of the allowed categories
        3. EVERY pattern MUST have AT LEAST 2-3 supporting evidence quotes (patterns with only 1 quote are NOT credible and will be rejected)
        4. For stakeholder-aware categories (Stakeholder Conflict, Role-Specific Behavior, Cross-Role Collaboration), MUST include stakeholder_distribution and is_cross_stakeholder
        5. Evidence should include stakeholder type in brackets when identifiable, e.g., "[Decision Maker]"
        6. Use UNIQUE evidence for each pattern - never reuse the same quotes across patterns
        7. Look for BOTH individual behavioral patterns AND cross-stakeholder dynamics
        8. The more frequently a pattern appears across participants, the MORE evidence quotes you should include
        """

    @staticmethod
    def industry_specific_prompt(industry: str, industry_guidance: str, text: str) -> str:
        """
        Get industry-specific pattern recognition prompt.

        Args:
            industry: Industry name
            industry_guidance: Industry-specific guidance
            text: Text to analyze

        Returns:
            System message string with industry-specific guidance
        """
        # Get the Pydantic schema for structured output
        pattern_schema = Pattern.model_json_schema()
        pattern_response_schema = PatternResponse.model_json_schema()

        return f"""
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in {industry.upper()} industry interview data.

        INDUSTRY CONTEXT: {industry.upper()}

        {industry_guidance}

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

        ANALYZE THIS TEXT:
        {text}

        Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees that are relevant to the {industry.upper()} industry.
        Look for:
        1. Workflows - Sequences of actions users take to accomplish goals
        2. Coping strategies - Ways users overcome obstacles or limitations
        3. Decision processes - How users make choices
        4. Workarounds - Alternative approaches when standard methods fail
        5. Habits - Repeated behaviors users exhibit
        6. Collaboration patterns - How users work with others
        7. Communication patterns - How users share information

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A behavior-oriented category (must be one of: {", ".join(ALLOWED_PATTERN_CATEGORIES)})
        3. A detailed description of the pattern that highlights the ACTIONS or BEHAVIORS
        4. A frequency score between 0.0 and 1.0 indicating how prevalent the pattern is
        5. A sentiment score between -1.0 and 1.0 (negative, neutral, or positive)
        6. Supporting evidence: AT LEAST 2-3 DIRECT QUOTES showing the SPECIFIC ACTIONS mentioned (more quotes = more credible pattern)
        7. The impact of this pattern (how it affects users, processes, or outcomes)
        8. Suggested actions (2-3 recommendations based on this pattern)

        Your response MUST follow this exact JSON schema:
        ```
        {pattern_response_schema}
        ```

        Example of a well-formatted pattern:
        ```
        {{
          "patterns": [
            {{
              "name": "Multi-source Validation",
              "category": "Decision Process",
              "description": "Users consistently seek validation from multiple sources before making UX decisions",
              "frequency": 0.65,
              "sentiment": -0.3,
              "evidence": [
                  "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                  "We go through a three-step validation process: first check best practices, then look at competitors, then test with users",
                  "Before any major decision, I consult at least two different data sources to make sure we're on the right track"
              ],
              "impact": "Slows down decision-making process but increases confidence in final decisions",
              "suggested_actions": [
                  "Create a centralized knowledge base of UX best practices",
                  "Develop a streamlined validation checklist",
                  "Implement a faster user testing protocol for quick validation"
              ]
            }}
          ]
        }}
        ```

        EXTREMELY IMPORTANT: Your response MUST be a valid JSON object with a "patterns" array, even if you only identify one pattern. If you cannot identify any patterns, return an empty array like this:
        {{
          "patterns": []
        }}

        CRITICAL REQUIREMENTS:
        1. EVERY pattern MUST have a clear, descriptive name (never "Uncategorized" or generic labels)
        2. EVERY pattern MUST be assigned to one of these specific categories:
           - Workflow (sequences of actions to accomplish goals)
           - Coping Strategy (ways users overcome obstacles)
           - Decision Process (how users make choices)
           - Workaround (alternative approaches when standard methods fail)
           - Habit (repeated behaviors users exhibit)
           - Collaboration (how users work with others)
           - Communication (how users share information)
           - Information Seeking (how users find and validate information)
           - Trust Verification (how users build and verify trust)
           - Stakeholder Conflict (opposing behaviors between stakeholder types)
           - Role-Specific Behavior (patterns unique to one stakeholder type)
           - Cross-Role Collaboration (how different stakeholder types work together)
        3. EVERY pattern MUST have AT LEAST 2-3 supporting evidence quotes (patterns with only 1 quote are NOT credible)
        4. EVERY pattern MUST have a detailed description that explains the behavior
        5. NEVER leave any field empty or with placeholder text like "No description available"
        6. Use UNIQUE evidence for each pattern - never reuse the same quotes across patterns
        7. Higher frequency patterns should have MORE evidence quotes (3-5 quotes for patterns with frequency > 0.7)

        IMPORTANT:
        - Emphasize VERBS and ACTION words in your pattern descriptions
        - Each pattern should describe WHAT USERS DO, not just what they think or say
        - Evidence should contain quotes showing the ACTIONS mentioned
        - Impact should describe the consequences (positive or negative) of the pattern
        - Suggested actions should be specific, actionable recommendations that are appropriate for the {industry.upper()} industry
        - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
        - Ensure 100% of your response is in valid JSON format
        """

    @staticmethod
    def standard_prompt(text: str) -> str:
        """
        Get standard pattern recognition prompt.

        Args:
            text: Text to analyze

        Returns:
            System message string optimized for structured output
        """
        # Get the Pydantic schema for structured output
        pattern_schema = Pattern.model_json_schema()
        pattern_response_schema = PatternResponse.model_json_schema()

        return f"""
        You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in interview data.

        IMPORTANT DISTINCTION:
        - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
        - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

        ANALYZE THIS TEXT:
        {text}

        Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees.
        Look for:
        1. Workflows - Sequences of actions users take to accomplish goals
        2. Coping strategies - Ways users overcome obstacles or limitations
        3. Decision processes - How users make choices
        4. Workarounds - Alternative approaches when standard methods fail
        5. Habits - Repeated behaviors users exhibit
        6. Collaboration patterns - How users work with others
        7. Communication patterns - How users share information

        For each behavioral pattern you identify, provide:
        1. A descriptive name for the pattern
        2. A behavior-oriented category (must be one of: {", ".join(ALLOWED_PATTERN_CATEGORIES)})
        3. A detailed description of the pattern that highlights the ACTIONS or BEHAVIORS
        4. A frequency score between 0.0 and 1.0 indicating how prevalent the pattern is
        5. A sentiment score between -1.0 and 1.0 (negative, neutral, or positive)
        6. Supporting evidence: AT LEAST 2-3 DIRECT QUOTES showing the SPECIFIC ACTIONS mentioned (more quotes = more credible pattern)
        7. The impact of this pattern (how it affects users, processes, or outcomes)
        8. Suggested actions (2-3 recommendations based on this pattern)

        Your response MUST follow this exact JSON schema:
        ```
        {pattern_response_schema}
        ```

        Example of a well-formatted pattern:
        ```
        {{
          "patterns": [
            {{
              "name": "Multi-source Validation",
              "category": "Decision Process",
              "description": "Users consistently seek validation from multiple sources before making UX decisions",
              "frequency": 0.65,
              "sentiment": -0.3,
              "evidence": [
                  "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                  "We go through a three-step validation process: first check best practices, then look at competitors, then test with users",
                  "Before any major decision, I consult at least two different data sources to make sure we're on the right track"
              ],
              "impact": "Slows down decision-making process but increases confidence in final decisions",
              "suggested_actions": [
                  "Create a centralized knowledge base of best practices",
                  "Develop a streamlined validation checklist"
              ]
            }}
          ]
        }}
        ```

        EXTREMELY IMPORTANT: Your response MUST be a valid JSON object with a "patterns" array, even if you only identify one pattern. If you cannot identify any patterns, return an empty array like this:
        {{
          "patterns": []
        }}

        CRITICAL REQUIREMENTS:
        1. EVERY pattern MUST have a clear, descriptive name (never "Uncategorized" or generic labels)
        2. EVERY pattern MUST be assigned to one of these specific categories:
           - Workflow (sequences of actions to accomplish goals)
           - Coping Strategy (ways users overcome obstacles)
           - Decision Process (how users make choices)
           - Workaround (alternative approaches when standard methods fail)
           - Habit (repeated behaviors users exhibit)
           - Collaboration (how users work with others)
           - Communication (how users share information)
           - Information Seeking (how users find and validate information)
           - Trust Verification (how users build and verify trust)
           - Stakeholder Conflict (opposing behaviors between stakeholder types)
           - Role-Specific Behavior (patterns unique to one stakeholder type)
           - Cross-Role Collaboration (how different stakeholder types work together)
        3. EVERY pattern MUST have AT LEAST 2-3 supporting evidence quotes (patterns with only 1 quote are NOT credible)
        4. EVERY pattern MUST have a detailed description that explains the behavior
        5. NEVER leave any field empty or with placeholder text like "No description available"
        6. Use UNIQUE evidence for each pattern - never reuse the same quotes across patterns
        7. Higher frequency patterns should have MORE evidence quotes (3-5 quotes for patterns with frequency > 0.7)

        IMPORTANT:
        - Emphasize VERBS and ACTION words in your pattern descriptions
        - Each pattern should describe WHAT USERS DO, not just what they think or say
        - Evidence should contain quotes showing the ACTIONS mentioned
        - Impact should describe the consequences (positive or negative) of the pattern
        - Suggested actions should be specific, actionable recommendations
        - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
        - Ensure 100% of your response is in valid JSON format
        """
