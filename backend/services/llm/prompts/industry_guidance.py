"""
Industry-specific guidance for LLM prompts.

This module provides industry-specific guidance for various analysis tasks,
helping to improve the accuracy and relevance of LLM outputs by incorporating
domain knowledge for different industries.
"""

from typing import Dict, Any, Optional, List

class IndustryGuidance:
    """
    Industry-specific guidance for LLM prompts.
    
    This class provides centralized access to industry-specific guidance
    for different analysis tasks, ensuring consistent application of
    domain knowledge across the application.
    """
    
    # List of supported industries
    SUPPORTED_INDUSTRIES = [
        "healthcare", "tech", "finance", "military", "education", 
        "hospitality", "retail", "manufacturing", "legal", 
        "insurance", "agriculture", "non_profit", "general"
    ]
    
    @staticmethod
    def get_guidance(industry: str, task: str) -> str:
        """
        Get industry-specific guidance for a task.
        
        Args:
            industry: Industry name (e.g., "healthcare", "tech")
            task: Task type (e.g., "sentiment_analysis", "theme_analysis")
            
        Returns:
            Guidance string with industry-specific instructions
        """
        # Normalize industry name
        industry_lower = industry.lower() if industry else "general"
        
        # If industry not supported, use general guidance
        if industry_lower not in IndustryGuidance.SUPPORTED_INDUSTRIES:
            industry_lower = "general"
        
        # Get guidance based on task
        if task == "sentiment_analysis":
            return IndustryGuidance.get_sentiment_guidance(industry_lower)
        elif task == "theme_analysis":
            return IndustryGuidance.get_theme_guidance(industry_lower)
        elif task == "pattern_recognition":
            return IndustryGuidance.get_pattern_guidance(industry_lower)
        elif task == "persona_formation":
            return IndustryGuidance.get_persona_guidance(industry_lower)
        elif task == "insight_generation":
            return IndustryGuidance.get_insight_guidance(industry_lower)
        else:
            return IndustryGuidance.get_general_guidance(industry_lower)
    
    @staticmethod
    def get_sentiment_guidance(industry: str) -> str:
        """
        Get industry-specific sentiment analysis guidance.
        
        Args:
            industry: Industry name
            
        Returns:
            Sentiment analysis guidance for the specified industry
        """
        industry_guidance = {
            "healthcare": """
                HEALTHCARE-SPECIFIC GUIDELINES:
                - Neutral terms include: "HIPAA compliance", "patient intake", "treatment protocol"
                - Positive indicators include: improved patient outcomes, reduced errors, enhanced care coordination
                - Negative indicators include: staffing challenges, regulatory burdens, patient safety concerns
                - Consider medical terminology as neutral unless clearly associated with sentiment
            """,
            "tech": """
                TECHNOLOGY-SPECIFIC GUIDELINES:
                - Neutral terms include: "CI/CD pipeline", "code review", "sprints"
                - Positive indicators include: increased performance, reduced bugs, improved developer experience
                - Negative indicators include: technical debt, integration challenges, legacy system limitations
                - Technical terminology is generally neutral unless attached to outcomes or obstacles
            """,
            "finance": """
                FINANCE-SPECIFIC GUIDELINES:
                - Neutral terms include: "compliance review", "transaction verification", "quarterly reporting"
                - Positive indicators include: improved accuracy, fraud reduction, process automation benefits
                - Negative indicators include: regulatory burden, system integration issues, customer friction points
                - Financial terminology should be treated as neutral process language
            """,
            "military": """
                MILITARY-SPECIFIC GUIDELINES:
                - Neutral terms include: "chain of command", "standard operating procedure", "mission briefing"
                - Positive indicators include: improved safety, enhanced equipment effectiveness, better coordination
                - Negative indicators include: equipment failures, logistics challenges, operational risks
                - Military jargon and process descriptions should be considered neutral
            """,
            "education": """
                EDUCATION-SPECIFIC GUIDELINES:
                - Neutral terms include: "curriculum review", "assessment schedule", "learning objectives"
                - Positive indicators include: improved student outcomes, teacher satisfaction, resource availability
                - Negative indicators include: funding limitations, administrative burdens, resource constraints
                - Educational terminology and process descriptions are neutral by default
            """,
            "hospitality": """
                HOSPITALITY-SPECIFIC GUIDELINES:
                - Neutral terms include: "guest check-in", "housekeeping protocol", "reservation system"
                - Positive indicators include: guest satisfaction, service efficiency, staff performance
                - Negative indicators include: service delays, maintenance issues, staffing shortages
                - Operational process descriptions should be treated as neutral
            """,
            "retail": """
                RETAIL-SPECIFIC GUIDELINES:
                - Neutral terms include: "inventory management", "POS system", "merchandising"
                - Positive indicators include: sales increases, customer loyalty, operational efficiency
                - Negative indicators include: stockouts, high return rates, customer complaints
                - Retail operations terminology should be treated as neutral
            """,
            "manufacturing": """
                MANUFACTURING-SPECIFIC GUIDELINES:
                - Neutral terms include: "quality control", "production line", "supply chain"
                - Positive indicators include: efficiency gains, quality improvements, reduced downtime
                - Negative indicators include: equipment failures, production delays, quality issues
                - Manufacturing process terminology should be considered neutral
            """,
            "legal": """
                LEGAL-SPECIFIC GUIDELINES:
                - Neutral terms include: "discovery process", "case management", "filing procedure"
                - Positive indicators include: case resolution success, efficiency improvements, client satisfaction
                - Negative indicators include: procedural delays, work-life balance issues, administrative burdens
                - Legal terminology and procedural descriptions are neutral by default
            """,
            "insurance": """
                INSURANCE-SPECIFIC GUIDELINES:
                - Neutral terms include: "policy underwriting", "claims processing", "risk assessment"
                - Positive indicators include: faster claims settlement, improved customer satisfaction, better risk modeling
                - Negative indicators include: claim denials, policy misunderstandings, processing delays
                - Insurance terminology and process descriptions should be treated as neutral
            """,
            "agriculture": """
                AGRICULTURE-SPECIFIC GUIDELINES:
                - Neutral terms include: "crop rotation", "irrigation scheduling", "pest management"
                - Positive indicators include: yield improvements, resource efficiency, successful harvests
                - Negative indicators include: weather challenges, equipment failures, labor shortages
                - Agricultural terminology and seasonal descriptions are neutral by default
            """,
            "non_profit": """
                NON-PROFIT-SPECIFIC GUIDELINES:
                - Neutral terms include: "donor management", "grant application", "program evaluation"
                - Positive indicators include: mission impact, successful fundraising, volunteer engagement
                - Negative indicators include: funding challenges, administrative burdens, resource limitations
                - Mission-related terminology should be treated as neutral unless clearly tied to outcomes
            """,
        }
        
        # Return industry-specific guidance or general guidance if industry not found
        return industry_guidance.get(
            industry,
            """
            GENERAL GUIDELINES:
            - Consider industry-specific terminology as neutral unless clearly tied to outcomes or challenges
            - Focus on emotional indicators and expressions of satisfaction/dissatisfaction
            - Distinguish between process descriptions (neutral) and process challenges (negative)
            - Identify enthusiasm for solutions (positive) vs frustration with problems (negative)
            """
        )
    
    @staticmethod
    def get_theme_guidance(industry: str) -> str:
        """
        Get industry-specific theme analysis guidance.
        
        Args:
            industry: Industry name
            
        Returns:
            Theme analysis guidance for the specified industry
        """
        industry_guidance = {
            "healthcare": """
                HEALTHCARE THEME ANALYSIS GUIDELINES:
                - Look for themes related to patient care, clinical workflows, regulatory compliance, and healthcare technology
                - Consider themes around care coordination, patient safety, and provider experience
                - Pay attention to themes related to healthcare administration, insurance, and reimbursement
                - Identify themes related to healthcare policy, regulations, and standards
            """,
            "tech": """
                TECHNOLOGY THEME ANALYSIS GUIDELINES:
                - Look for themes related to development processes, technical challenges, and innovation
                - Consider themes around user experience, product design, and technical architecture
                - Pay attention to themes related to technical debt, scalability, and maintenance
                - Identify themes related to collaboration, knowledge sharing, and technical leadership
            """,
            # Add other industries as needed
        }
        
        return industry_guidance.get(
            industry,
            """
            GENERAL THEME ANALYSIS GUIDELINES:
            - Identify recurring topics, concepts, and ideas mentioned across the text
            - Look for patterns in how subjects are discussed and what aspects are emphasized
            - Consider both explicit themes (directly stated) and implicit themes (underlying concepts)
            - Focus on themes that are specific to the domain rather than generic observations
            """
        )
    
    @staticmethod
    def get_pattern_guidance(industry: str) -> str:
        """
        Get industry-specific pattern recognition guidance.
        
        Args:
            industry: Industry name
            
        Returns:
            Pattern recognition guidance for the specified industry
        """
        industry_guidance = {
            "healthcare": """
                HEALTHCARE PATTERN RECOGNITION GUIDELINES:
                - Look for patterns in clinical decision-making processes
                - Identify workflows related to patient care, documentation, and handoffs
                - Recognize patterns in communication between healthcare providers
                - Note patterns in how healthcare professionals manage regulatory requirements
            """,
            "tech": """
                TECHNOLOGY PATTERN RECOGNITION GUIDELINES:
                - Look for patterns in development workflows and processes
                - Identify common approaches to problem-solving and debugging
                - Recognize patterns in how technical decisions are made
                - Note patterns in collaboration and knowledge sharing
            """,
            # Add other industries as needed
        }
        
        return industry_guidance.get(
            industry,
            """
            GENERAL PATTERN RECOGNITION GUIDELINES:
            - Focus on recurring behaviors, actions, and workflows
            - Identify decision-making processes and problem-solving approaches
            - Look for coping strategies and workarounds
            - Recognize collaboration patterns and communication styles
            """
        )
    
    @staticmethod
    def get_persona_guidance(industry: str) -> str:
        """
        Get industry-specific persona formation guidance.
        
        Args:
            industry: Industry name
            
        Returns:
            Persona formation guidance for the specified industry
        """
        industry_guidance = {
            "healthcare": """
                HEALTHCARE PERSONA FORMATION GUIDELINES:
                - Consider roles like clinicians, administrators, patients, and support staff
                - Include domain-specific skills related to clinical knowledge, patient care, or healthcare administration
                - Note attitudes toward healthcare technology, regulations, and patient-centered care
                - Identify pain points related to documentation burden, regulatory compliance, and work-life balance
            """,
            "tech": """
                TECHNOLOGY PERSONA FORMATION GUIDELINES:
                - Consider roles like developers, designers, product managers, and technical leaders
                - Include domain-specific skills related to programming languages, frameworks, and methodologies
                - Note attitudes toward technical debt, innovation, and collaboration
                - Identify pain points related to deadlines, technical limitations, and communication challenges
            """,
            # Add other industries as needed
        }
        
        return industry_guidance.get(
            industry,
            """
            GENERAL PERSONA FORMATION GUIDELINES:
            - Create personas that reflect the roles, responsibilities, and experiences mentioned in the text
            - Include domain-specific skills and knowledge relevant to the person's work
            - Note attitudes toward tools, processes, and collaboration
            - Identify pain points and challenges specific to their role and context
            """
        )
    
    @staticmethod
    def get_insight_guidance(industry: str) -> str:
        """
        Get industry-specific insight generation guidance.
        
        Args:
            industry: Industry name
            
        Returns:
            Insight generation guidance for the specified industry
        """
        industry_guidance = {
            "healthcare": """
                HEALTHCARE INSIGHT GENERATION GUIDELINES:
                - Focus on insights that could improve patient outcomes, provider experience, or operational efficiency
                - Consider implications for patient safety, care quality, and healthcare costs
                - Prioritize insights related to clinical workflows, documentation burden, and care coordination
                - Suggest actions that align with healthcare regulations and standards
            """,
            "tech": """
                TECHNOLOGY INSIGHT GENERATION GUIDELINES:
                - Focus on insights that could improve development efficiency, product quality, or user experience
                - Consider implications for technical debt, scalability, and maintainability
                - Prioritize insights related to development processes, collaboration, and innovation
                - Suggest actions that align with technical best practices and organizational goals
            """,
            # Add other industries as needed
        }
        
        return industry_guidance.get(
            industry,
            """
            GENERAL INSIGHT GENERATION GUIDELINES:
            - Generate insights that go beyond surface observations to identify underlying patterns and implications
            - Focus on actionable insights that could lead to meaningful improvements
            - Consider both immediate implications and longer-term consequences
            - Suggest specific, concrete actions that could address the identified issues
            """
        )
    
    @staticmethod
    def get_general_guidance(industry: str) -> str:
        """
        Get general industry guidance.
        
        Args:
            industry: Industry name
            
        Returns:
            General guidance for the specified industry
        """
        return f"""
        GENERAL GUIDELINES FOR {industry.upper()}:
        - Consider industry-specific terminology and context when analyzing the text
        - Focus on issues, challenges, and opportunities relevant to this industry
        - Distinguish between standard industry practices and exceptional situations
        - Interpret statements in the context of industry norms and expectations
        """
