"""
Conversational Analysis Agent for processing simulation data into structured analysis results.
Uses conversational routines to generate comprehensive analysis matching DetailedAnalysisResult schema.
"""

import logging
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import re

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelSettings
from pydantic_ai.models.gemini import GeminiModel

from backend.schemas import (
    DetailedAnalysisResult,
    Theme,
    Pattern,
    SentimentOverview,
    Persona,
    Insight,
    StakeholderIntelligence,
    DetectedStakeholder,
    CrossStakeholderPatterns,
    ConsensusArea,
    ConflictZone,
    InfluenceNetwork,
    MultiStakeholderSummary,
)
from backend.utils.pydantic_ai_retry import safe_pydantic_ai_call


logger = logging.getLogger(__name__)


# LLM-facing models without recursive structures to keep Gemini JSON Schema simple
class LLMTheme(BaseModel):
    """Simplified Theme representation for LLM output (no recursive HierarchicalCode)."""

    name: str
    frequency: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Frequency score (0-1 representing prevalence)",
    )
    sentiment: float = Field(
        default=0.0,
        ge=-1.0,
        le=1.0,
        description="Sentiment score (-1 to 1, where -1 is negative, 0 is neutral, 1 is positive)",
    )
    statements: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    definition: Optional[str] = None
    codes: Optional[List[str]] = None
    reliability: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    process: Optional[str] = None
    sentiment_distribution: Optional[Dict[str, Any]] = None
    stakeholder_context: Optional[Dict[str, Any]] = None
    stakeholder_attribution: Optional[Dict[str, Any]] = None
    count: Optional[int] = None


# Typed stage result models for structured outputs
class ThemesResult(BaseModel):
    themes: List[LLMTheme] = Field(default_factory=list)
    enhanced_themes: List[LLMTheme] = Field(default_factory=list)


class PatternsResult(BaseModel):
    patterns: List[Pattern] = Field(default_factory=list)
    enhanced_patterns: List[Pattern] = Field(default_factory=list)


class SentimentResult(BaseModel):
    sentiment_overview: SentimentOverview = Field(default_factory=SentimentOverview)
    # Keep flexible shape for details; downstream code only reads lists of items
    sentiment_details: List[Dict[str, Any]] = Field(default_factory=list)


class PersonaResults(BaseModel):
    personas: List[Persona] = Field(default_factory=list)
    enhanced_personas: List[Persona] = Field(default_factory=list)


class InsightsResult(BaseModel):
    insights: List[Insight] = Field(default_factory=list)
    enhanced_insights: List[Insight] = Field(default_factory=list)


class StakeholderResult(BaseModel):
    stakeholder_intelligence: Optional[StakeholderIntelligence] = None


class AnalysisContext(BaseModel):
    """Context for conversational analysis workflow"""

    simulation_id: str
    data_size: int
    current_stage: str = "initializing"
    completed_stages: List[str] = Field(default_factory=list)
    processing_metadata: Dict[str, Any] = Field(default_factory=dict)
    exchange_count: int = 0

    def advance_stage(self, new_stage: str):
        """Advance to next analysis stage"""
        if self.current_stage not in self.completed_stages:
            self.completed_stages.append(self.current_stage)
        self.current_stage = new_stage
        self.exchange_count += 1

    def is_analysis_complete(self) -> bool:
        """Check if analysis workflow is complete"""
        required_stages = [
            "theme_extraction",
            "pattern_detection",
            "stakeholder_analysis",
            "sentiment_analysis",
            "persona_generation",
            "insight_synthesis",
        ]
        return all(stage in self.completed_stages for stage in required_stages)


class ConversationalAnalysisAgent:
    """
    Conversational analysis agent that processes simulation data using conversational routines
    to generate structured analysis results matching DetailedAnalysisResult schema.
    """

    def __init__(self, gemini_model: GeminiModel):
        self.model = gemini_model
        # Stage-specific typed agents (PydanticAI v1)
        self.themes_agent = Agent(
            model=self.model,
            output_type=ThemesResult,
            system_prompt="You extract interview themes with stakeholder attribution. Always return ThemesResult.",
            model_settings=ModelSettings(timeout=300),
        )
        self.patterns_agent = Agent(
            model=self.model,
            output_type=PatternsResult,
            system_prompt="You detect cross-stakeholder patterns and relationships. Always return PatternsResult.",
            model_settings=ModelSettings(timeout=300),
        )
        self.stakeholder_agent = Agent(
            model=self.model,
            output_type=StakeholderResult,
            system_prompt="You analyze stakeholders and produce stakeholder intelligence. Always return StakeholderResult.",
            model_settings=ModelSettings(timeout=300),
        )
        self.sentiment_agent = Agent(
            model=self.model,
            output_type=SentimentResult,
            system_prompt="You analyze sentiment distribution and details. Always return SentimentResult.",
            model_settings=ModelSettings(timeout=300),
        )
        self.persona_agent = Agent(
            model=self.model,
            output_type=PersonaResults,
            system_prompt="You generate personas and enhanced personas from simulation data. Always return PersonaResults.",
            model_settings=ModelSettings(timeout=300),
        )
        self.insights_agent = Agent(
            model=self.model,
            output_type=InsightsResult,
            system_prompt="You synthesize business insights and enhanced insights. Always return InsightsResult.",
            model_settings=ModelSettings(timeout=300),
        )
        # Keep legacy generic agent (unused now) for backward-compatibility
        self.analysis_agent = self._create_analysis_agent()

    def _create_analysis_agent(self) -> Agent:
        """Create PydanticAI agent for conversational analysis"""

        system_prompt = """
        You are an expert conversational analysis agent that processes interview simulation data
        to generate comprehensive structured analysis results.

        CAPABILITIES:
        - Extract themes with stakeholder attribution and supporting evidence
        - Detect cross-stakeholder patterns and relationships
        - Generate detailed stakeholder profiles with authentic quotes
        - Perform sentiment analysis with distribution metrics
        - Create personas based on behavioral insights
        - Synthesize actionable business insights

        ANALYSIS WORKFLOW:
        1. THEME_EXTRACTION: Identify key themes with frequency, sentiment, and stakeholder attribution
        2. PATTERN_DETECTION: Find cross-stakeholder patterns, consensus areas, and conflicts
        3. STAKEHOLDER_ANALYSIS: Generate detailed stakeholder profiles with demographic and behavioral insights
        4. SENTIMENT_ANALYSIS: Analyze overall sentiment distribution and category-specific sentiment
        5. PERSONA_GENERATION: Create personas based on stakeholder behavioral patterns
        6. INSIGHT_SYNTHESIS: Generate actionable business insights and recommendations

        QUALITY REQUIREMENTS:
        - All quotes must be authentic (extracted from source data, never generated)
        - Stakeholder attribution must be precise and evidence-based
        - Confidence scores must reflect actual evidence strength
        - Analysis must be comprehensive and actionable

        RESPONSE FORMAT:
        Always respond with structured data that matches the required schema exactly.
        Include processing metadata and quality metrics in your responses.
        """

        return Agent(model=self.model, system_prompt=system_prompt)

    async def process_simulation_data(
        self,
        simulation_text: str,
        simulation_id: str,
        file_name: str = "simulation_analysis.txt",
    ) -> DetailedAnalysisResult:
        """
        Process simulation text data through conversational analysis workflow
        to generate structured analysis results.
        """
        try:
            logger.info(
                f"Starting conversational analysis for simulation {simulation_id}"
            )

            # Initialize analysis context
            context = AnalysisContext(
                simulation_id=simulation_id, data_size=len(simulation_text)
            )

            # Process through conversational workflow
            analysis_results = await self._run_conversational_workflow(
                simulation_text, context
            )

            # Build final structured result
            result = DetailedAnalysisResult(
                id=f"analysis_{simulation_id}",
                status="completed",
                createdAt=datetime.utcnow().isoformat(),
                fileName=file_name,
                fileSize=len(simulation_text),
                themes=analysis_results.get("themes", []),
                enhanced_themes=analysis_results.get("enhanced_themes", []),
                patterns=analysis_results.get("patterns", []),
                enhanced_patterns=analysis_results.get("enhanced_patterns", []),
                sentimentOverview=analysis_results.get(
                    "sentiment_overview", SentimentOverview()
                ),
                sentiment=analysis_results.get("sentiment_details", []),
                personas=analysis_results.get("personas", []),
                enhanced_personas=analysis_results.get("enhanced_personas", []),
                insights=analysis_results.get("insights", []),
                enhanced_insights=analysis_results.get("enhanced_insights", []),
                stakeholder_intelligence=analysis_results.get(
                    "stakeholder_intelligence"
                ),
                error=None,
            )

            logger.info(
                f"Conversational analysis completed for simulation {simulation_id}"
            )
            return result

        except Exception as e:
            logger.error(
                f"Conversational analysis failed for simulation {simulation_id}: {str(e)}"
            )
            return DetailedAnalysisResult(
                id=f"analysis_{simulation_id}",
                status="failed",
                createdAt=datetime.utcnow().isoformat(),
                fileName=file_name,
                fileSize=len(simulation_text) if simulation_text else 0,
                themes=[],
                patterns=[],
                sentimentOverview=SentimentOverview(),
                error=str(e),
            )

    async def _run_conversational_workflow(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Run the complete conversational analysis workflow"""

        results = {}

        # Stage 1: Theme Extraction
        context.advance_stage("theme_extraction")
        themes_result = await self._extract_themes_conversational(
            simulation_text, context
        )
        results.update(themes_result)

        # Stage 2: Pattern Detection
        context.advance_stage("pattern_detection")
        patterns_result = await self._detect_patterns_conversational(
            simulation_text, context
        )
        results.update(patterns_result)

        # Stage 3: Stakeholder Analysis
        context.advance_stage("stakeholder_analysis")
        stakeholder_result = await self._analyze_stakeholders_conversational(
            simulation_text, context
        )
        results.update(stakeholder_result)

        # Stage 4: Sentiment Analysis
        context.advance_stage("sentiment_analysis")
        sentiment_result = await self._analyze_sentiment_conversational(
            simulation_text, context
        )
        results.update(sentiment_result)

        # Stage 5: Persona Generation
        context.advance_stage("persona_generation")
        persona_result = await self._generate_personas_conversational(
            simulation_text, context
        )
        results.update(persona_result)

        # Stage 6: Insight Synthesis
        context.advance_stage("insight_synthesis")
        insights_result = await self._synthesize_insights_conversational(
            simulation_text, context, results
        )
        results.update(insights_result)

        return results

    async def _extract_themes_conversational(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Extract themes using conversational approach"""

        # Use streaming analysis for large files
        if context.data_size > 50000:  # 50KB threshold
            return await self._extract_themes_streaming(simulation_text, context)
        else:
            return await self._extract_themes_single_pass(simulation_text, context)

    async def _extract_themes_streaming(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Extract themes using streaming analysis for large files"""

        logger.info(
            f"Using streaming analysis for large file ({context.data_size} bytes)"
        )

        themes = []
        enhanced_themes = []
        window_size = 50000  # 50KB windows
        overlap_size = 10000  # 10KB overlap
        accumulated_themes = {}

        # Process in overlapping windows
        for start in range(0, len(simulation_text), window_size - overlap_size):
            end = min(start + window_size, len(simulation_text))
            window_text = simulation_text[start:end]

            # Build conversational prompt with accumulated context
            prompt = f"""
            Continue theme extraction from simulation data.

            ACCUMULATED THEMES SO FAR: {list(accumulated_themes.keys())}

            CURRENT DATA WINDOW ({start}-{end}):
            {window_text}

            Extract themes from this window and merge with accumulated themes.
            Focus on stakeholder attribution and authentic quote extraction.

            Return themes in this JSON format:
            {{
                "themes": [
                    {{
                        "name": "Theme Name",
                        "frequency": 0.8,
                        "sentiment": -0.2,
                        "statements": ["authentic quote 1", "authentic quote 2"],
                        "keywords": ["keyword1", "keyword2"],
                        "definition": "Theme definition",
                        "stakeholder_context": {{
                            "primary_mentions": [
                                {{
                                    "stakeholder_id": "stakeholder_id",
                                    "stakeholder_type": "primary_customer",
                                    "mention_count": 3,
                                    "sentiment": "concerned"
                                }}
                            ]
                        }}
                    }}
                ]
            }}
            """

            # Get themes for this window (typed) with retry handling
            window_result = await safe_pydantic_ai_call(
                self.themes_agent,
                prompt,
                context="themes_streaming_window",
            )
            window_themes = [t.model_dump() for t in window_result.themes]

            # Merge with accumulated themes
            accumulated_themes = self._merge_themes(accumulated_themes, window_themes)

        # Convert accumulated themes to final typed models
        themes = list(accumulated_themes.values())
        themes_typed = [
            t if isinstance(t, Theme) else Theme.model_validate(t) for t in themes
        ]

        return {"themes": themes_typed, "enhanced_themes": []}

    async def _extract_themes_single_pass(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Extract themes in single pass for smaller files"""

        prompt = f"""
        Extract comprehensive themes from simulation data with stakeholder attribution.

        SIMULATION DATA:
        {simulation_text}

        REQUIREMENTS:
        1. Identify 5-12 key themes with precise stakeholder attribution
        2. Extract authentic quotes (never generate fake quotes)
        3. Calculate frequency and sentiment scores
        4. Provide stakeholder context for each theme

        Return themes in JSON format matching Theme schema:
        {{
            "themes": [
                {{
                    "name": "Theme Name",
                    "frequency": 0.8,
                    "sentiment": -0.2,
                    "statements": ["authentic quote 1", "authentic quote 2"],
                    "keywords": ["keyword1", "keyword2"],
                    "definition": "One-sentence theme definition",
                    "codes": ["THEME_CODE"],
                    "reliability": 0.95,
                    "process": "enhanced",
                    "sentiment_distribution": {{
                        "positive": 0.2,
                        "neutral": 0.3,
                        "negative": 0.5
                    }},
                    "stakeholder_context": {{
                        "primary_mentions": [
                            {{
                                "stakeholder_id": "stakeholder_id",
                                "stakeholder_type": "primary_customer",
                                "mention_count": 3,
                                "sentiment": "concerned"
                            }}
                        ],
                        "cross_stakeholder_prevalence": 0.8,
                        "stakeholder_types_mentioning": ["primary_customer", "decision_maker"]
                    }}
                }}
            ],
            "enhanced_themes": [
                {{
                    "name": "Enhanced Theme Name",
                    "frequency": 0.6,
                    "sentiment": 0.4,
                    "statements": ["supporting quote"],
                    "keywords": ["enhanced", "keywords"],
                    "definition": "Enhanced theme definition",
                    "process": "enhanced",
                    "stakeholder_context": {{
                        "primary_mentions": [
                            {{
                                "stakeholder_id": "stakeholder_id",
                                "stakeholder_type": "primary_customer",
                                "mention_count": 2,
                                "sentiment": "hopeful"
                            }}
                        ]
                    }}
                }}
            ]
        }}
        """

        result = await safe_pydantic_ai_call(
            self.themes_agent,
            prompt,
            context="themes_single_pass",
        )
        themes = [Theme.model_validate(t.model_dump()) for t in result.themes]
        enhanced_themes = [
            Theme.model_validate(t.model_dump())
            for t in result.enhanced_themes
        ]
        return {
            "themes": themes,
            "enhanced_themes": enhanced_themes,
        }

    async def _detect_patterns_conversational(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Detect cross-stakeholder patterns using conversational approach"""

        prompt = f"""
        Detect cross-stakeholder patterns and relationships in simulation data.

        SIMULATION DATA:
        {simulation_text}

        PATTERN TYPES TO DETECT:
        1. Cross-stakeholder consensus areas
        2. Conflict zones between stakeholders
        3. Influence networks and decision flows
        4. Behavioral patterns and trends

        Return patterns in JSON format:
        {{
            "patterns": [
                {{
                    "type": "Cross-Stakeholder Consensus",
                    "description": "Pattern description with evidence",
                    "evidence": ["evidence 1", "evidence 2"],
                    "confidence": 0.9,
                    "frequency": 0.8
                }}
            ],
            "enhanced_patterns": [
                {{
                    "type": "Decision-Making Influence Flow",
                    "description": "Enhanced pattern description",
                    "evidence": ["detailed evidence"],
                    "confidence": 0.85,
                    "frequency": 0.6
                }}
            ]
        }}
        """

        result = await safe_pydantic_ai_call(
            self.patterns_agent,
            prompt,
            context="patterns_conversational",
        )
        return {
            "patterns": result.patterns,
            "enhanced_patterns": result.enhanced_patterns,
        }

    async def _analyze_stakeholders_conversational(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Analyze stakeholders using conversational approach"""

        prompt = f"""
        Analyze stakeholders in simulation data to generate comprehensive stakeholder intelligence.

        SIMULATION DATA:
        {simulation_text}

        REQUIREMENTS:
        1. Detect all stakeholders with demographic profiles
        2. Generate individual insights for each stakeholder
        3. Calculate influence metrics and confidence scores
        4. Extract authentic evidence and quotes
        5. Identify cross-stakeholder patterns, consensus areas, and conflicts

        Return stakeholder intelligence in JSON format matching StakeholderIntelligence schema:
        {{
            "stakeholder_intelligence": {{
                "detected_stakeholders": [
                    {{
                        "stakeholder_id": "DocAnalysis_Specialist_Legal_Anja",
                        "stakeholder_type": "primary_customer",
                        "confidence_score": 0.95,
                        "demographic_profile": {{
                            "role": "Document Analysis Specialist",
                            "department": "Legal",
                            "company_type": "Law Firm"
                        }},
                        "individual_insights": {{
                            "primary_concern": "Accuracy and compliance concerns",
                            "key_motivation": "Strategic work transition",
                            "pain_points": "Manual processing time consumption"
                        }},
                        "influence_metrics": {{
                            "decision_power": 0.2,
                            "technical_influence": 0.5,
                            "budget_influence": 0.1
                        }},
                        "authentic_evidence": {{
                            "quotes_evidence": ["authentic quote 1", "authentic quote 2"],
                            "behavioral_evidence": ["behavior pattern 1"]
                        }}
                    }}
                ],
                "cross_stakeholder_patterns": {{
                    "consensus_areas": [
                        {{
                            "topic": "Security Priority",
                            "agreement_level": 0.9,
                            "participating_stakeholders": ["stakeholder1", "stakeholder2"],
                            "shared_insights": ["shared insight 1"],
                            "business_impact": "Impact description"
                        }}
                    ],
                    "conflict_zones": [
                        {{
                            "topic": "Cost vs Quality",
                            "conflicting_stakeholders": ["stakeholder1", "stakeholder2"],
                            "conflict_severity": "medium",
                            "potential_resolutions": ["resolution 1"],
                            "business_risk": "Risk description"
                        }}
                    ],
                    "influence_networks": [
                        {{
                            "influencer": "IT_Lead",
                            "influenced": ["Senior_Partner"],
                            "influence_type": "decision",
                            "strength": 0.8,
                            "pathway": "Technical feasibility assessment"
                        }}
                    ]
                }},
                "multi_stakeholder_summary": {{
                    "total_stakeholders": 15,
                    "consensus_score": 0.76,
                    "conflict_score": 0.34,
                    "key_insights": ["insight 1", "insight 2"],
                    "implementation_recommendations": ["recommendation 1"]
                }},
                "processing_metadata": {{
                    "analysis_approach": "conversational_routine",
                    "processing_time_seconds": 120,
                    "authenticity_verification_rate": 0.97
                }}
            }}
        }}
        """

        result = await safe_pydantic_ai_call(
            self.stakeholder_agent,
            prompt,
            context="stakeholder_conversational",
        )

        # Convert Pydantic model to dict for downstream processing
        stakeholder_intelligence = result.stakeholder_intelligence
        if hasattr(stakeholder_intelligence, "model_dump"):
            # Pydantic v2
            stakeholder_intelligence_dict = stakeholder_intelligence.model_dump()
        elif hasattr(stakeholder_intelligence, "dict"):
            # Pydantic v1
            stakeholder_intelligence_dict = stakeholder_intelligence.dict()
        else:
            # Already a dict or unknown type
            stakeholder_intelligence_dict = stakeholder_intelligence

        return {"stakeholder_intelligence": stakeholder_intelligence_dict}

    def _parse_themes_response(self, response_data: str) -> Dict[str, Any]:
        """Parse themes response from LLM"""
        try:
            if isinstance(response_data, str):
                # Extract JSON from response
                json_match = re.search(r"\{.*\}", response_data, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_data)
            else:
                data = response_data

            return {
                "themes": data.get("themes", []),
                "enhanced_themes": data.get("enhanced_themes", []),
            }
        except Exception as e:
            logger.error(f"Failed to parse themes response: {e}")
            return {"themes": [], "enhanced_themes": []}

    def _parse_patterns_response(self, response_data: str) -> Dict[str, Any]:
        """Parse patterns response from LLM"""
        try:
            if isinstance(response_data, str):
                json_match = re.search(r"\{.*\}", response_data, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_data)
            else:
                data = response_data

            return {
                "patterns": data.get("patterns", []),
                "enhanced_patterns": data.get("enhanced_patterns", []),
            }
        except Exception as e:
            logger.error(f"Failed to parse patterns response: {e}")
            return {"patterns": [], "enhanced_patterns": []}

    def _parse_stakeholder_response(self, response_data: str) -> Dict[str, Any]:
        """Parse stakeholder intelligence response from LLM"""
        try:
            if isinstance(response_data, str):
                json_match = re.search(r"\{.*\}", response_data, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_data)
            else:
                data = response_data

            return {"stakeholder_intelligence": data.get("stakeholder_intelligence")}
        except Exception as e:
            logger.error(f"Failed to parse stakeholder response: {e}")
            return {"stakeholder_intelligence": None}

    def _merge_themes(self, accumulated: Dict, new_themes: List[Dict]) -> Dict:
        """Merge new themes with accumulated themes"""
        for theme in new_themes:
            theme_name = theme.get("name", "")
            if theme_name in accumulated:
                # Merge with existing theme
                existing = accumulated[theme_name]
                existing["statements"].extend(theme.get("statements", []))
                existing["frequency"] = max(
                    existing["frequency"], theme.get("frequency", 0)
                )
            else:
                accumulated[theme_name] = theme
        return accumulated

    async def _analyze_sentiment_conversational(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Analyze sentiment using conversational approach"""

        prompt = f"""
        Analyze sentiment in simulation data with detailed categorization.

        SIMULATION DATA:
        {simulation_text}

        REQUIREMENTS:
        1. Calculate overall sentiment distribution (positive, neutral, negative)
        2. Identify sentiment categories with specific scores
        3. Extract supporting statements for each sentiment category

        Return sentiment analysis in JSON format:
        {{
            "sentiment_overview": {{
                "positive": 0.25,
                "neutral": 0.35,
                "negative": 0.40
            }},
            "sentiment_details": [
                {{
                    "category": "Security Concerns",
                    "score": -0.4,
                    "statements": ["Data security is paramount", "GDPR compliance is critical"]
                }},
                {{
                    "category": "Process Frustration",
                    "score": -0.7,
                    "statements": ["It's incredibly repetitive", "The biggest pain point"]
                }},
                {{
                    "category": "Strategic Opportunity",
                    "score": 0.6,
                    "statements": ["shift to strategic work", "focus on analysis"]
                }}
            ]
        }}
        """

        result = await safe_pydantic_ai_call(
            self.sentiment_agent,
            prompt,
            context="sentiment_conversational",
        )
        return {
            "sentiment_overview": result.sentiment_overview,
            "sentiment_details": result.sentiment_details,
        }

    async def _generate_personas_conversational(
        self, simulation_text: str, context: AnalysisContext
    ) -> Dict[str, Any]:
        """Generate personas using conversational approach"""

        prompt = f"""
        Generate detailed personas from simulation data based on stakeholder behavioral patterns.

        SIMULATION DATA:
        {simulation_text}

        REQUIREMENTS:
        1. Create 3-5 primary personas based on stakeholder types
        2. Include traits, needs, and pain points with evidence
        3. Generate enhanced personas for strategic insights

        Return personas in JSON format:
        {{
            "personas": [
                {{
                    "name": "Anja, The Diligent Legal Analyst",
                    "description": "Document analysis specialist focused on accuracy",
                    "traits": {{
                        "accuracy_focused": {{
                            "value": "Prioritizes precision above all else",
                            "confidence": 0.95,
                            "evidence": ["In the legal field, there's zero room for error"]
                        }}
                    }},
                    "needs": [
                        {{
                            "description": "Accuracy validation in AI analysis",
                            "priority": "high",
                            "evidence": ["The biggest fear is missing something critical"]
                        }}
                    ],
                    "pain_points": [
                        {{
                            "description": "High volume manual processing",
                            "severity": "high",
                            "evidence": ["60-70% of week on document review"]
                        }}
                    ]
                }}
            ],
            "enhanced_personas": [
                {{
                    "name": "The Strategic Solution Seeker",
                    "description": "Decision-maker focused on ROI and impact",
                    "traits": {{
                        "roi_focused": {{
                            "value": "Prioritizes measurable business benefits",
                            "confidence": 0.88,
                            "evidence": ["focused on efficiency and cost-effectiveness"]
                        }}
                    }},
                    "needs": [
                        {{
                            "description": "Clear ROI demonstration",
                            "priority": "high",
                            "evidence": ["main priority is clear ROI"]
                        }}
                    ],
                    "pain_points": [
                        {{
                            "description": "Investment uncertainty",
                            "severity": "medium",
                            "evidence": ["Budget allocation decisions"]
                        }}
                    ]
                }}
            ]
        }}
        """

        result = await safe_pydantic_ai_call(
            self.persona_agent,
            prompt,
            context="personas_conversational",
        )
        return {
            "personas": result.personas,
            "enhanced_personas": result.enhanced_personas,
        }

    async def _synthesize_insights_conversational(
        self,
        simulation_text: str,
        context: AnalysisContext,
        analysis_results: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Synthesize actionable insights using conversational approach"""

        prompt = f"""
        Synthesize actionable business insights from comprehensive analysis results.

        ANALYSIS RESULTS SUMMARY:
        - Themes identified: {len(analysis_results.get('themes', []))}
        - Patterns detected: {len(analysis_results.get('patterns', []))}
        - Stakeholders analyzed: {len(analysis_results.get('stakeholder_intelligence', {}).get('detected_stakeholders', []))}

        SIMULATION DATA:
        {simulation_text[:5000]}...  # First 5KB for context

        REQUIREMENTS:
        1. Generate 5-8 actionable business insights
        2. Create enhanced insights for strategic recommendations
        3. Include confidence scores and supporting evidence

        Return insights in JSON format:
        {{
            "insights": [
                {{
                    "title": "Universal Security Priority",
                    "description": "All stakeholder types prioritize data security",
                    "confidence": 0.94,
                    "evidence": ["Security mentioned by 12/15 stakeholders"],
                    "business_impact": "Security features must be prominently positioned"
                }}
            ],
            "enhanced_insights": [
                {{
                    "title": "Technical Influence Despite Limited Budget Authority",
                    "description": "IT stakeholders have high implementation influence",
                    "confidence": 0.78,
                    "evidence": ["IT Director significant influencer"],
                    "business_impact": "Target technical stakeholders for demos"
                }}
            ]
        }}
        """

        result = await safe_pydantic_ai_call(
            self.insights_agent,
            prompt,
            context="insights_conversational",
        )
        return {
            "insights": result.insights,
            "enhanced_insights": result.enhanced_insights,
        }

    def _parse_sentiment_response(self, response_data: str) -> Dict[str, Any]:
        """Parse sentiment response from LLM"""
        try:
            if isinstance(response_data, str):
                json_match = re.search(r"\{.*\}", response_data, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_data)
            else:
                data = response_data

            return {
                "sentiment_overview": data.get(
                    "sentiment_overview",
                    {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                ),
                "sentiment_details": data.get("sentiment_details", []),
            }
        except Exception as e:
            logger.error(f"Failed to parse sentiment response: {e}")
            return {
                "sentiment_overview": {
                    "positive": 0.33,
                    "neutral": 0.34,
                    "negative": 0.33,
                },
                "sentiment_details": [],
            }

    def _parse_personas_response(self, response_data: str) -> Dict[str, Any]:
        """Parse personas response from LLM"""
        try:
            if isinstance(response_data, str):
                json_match = re.search(r"\{.*\}", response_data, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_data)
            else:
                data = response_data

            return {
                "personas": data.get("personas", []),
                "enhanced_personas": data.get("enhanced_personas", []),
            }
        except Exception as e:
            logger.error(f"Failed to parse personas response: {e}")
            return {"personas": [], "enhanced_personas": []}

    def _parse_insights_response(self, response_data: str) -> Dict[str, Any]:
        """Parse insights response from LLM"""
        try:
            if isinstance(response_data, str):
                json_match = re.search(r"\{.*\}", response_data, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_data)
            else:
                data = response_data

            return {
                "insights": data.get("insights", []),
                "enhanced_insights": data.get("enhanced_insights", []),
            }
        except Exception as e:
            logger.error(f"Failed to parse insights response: {e}")
            return {"insights": [], "enhanced_insights": []}
