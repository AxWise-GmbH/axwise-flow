"""
Stakeholder Theme Analyzer Module

Handles theme analysis and stakeholder attribution with clear separation of concerns.
Extracts theme analysis logic from the monolithic service.
"""
from typing import List, Dict, Any, Optional
import logging
import os

from backend.domain.interfaces.llm_unified import ILLMService
from backend.schemas import DetectedStakeholder

logger = logging.getLogger(__name__)


class StakeholderThemeAnalyzer:
    """
    Modular theme analyzer that handles theme-stakeholder attribution
    and cross-stakeholder theme analysis.
    """

    def __init__(self, llm_service: ILLMService):
        self.llm_service = llm_service
        self.pydantic_ai_available = False
        self.theme_agent = None
        
        # Initialize PydanticAI agent if available
        self._initialize_theme_agent()

    def _initialize_theme_agent(self):
        """Initialize PydanticAI theme agent for structured analysis."""
        try:
            from pydantic_ai import Agent
            from pydantic_ai.models.gemini import GeminiModel
            
            # Create theme attribution agent
            self.theme_agent = Agent(
                model=GeminiModel("gemini-2.5-flash"),
                system_prompt=self._get_theme_attribution_prompt(),
            )
            self.pydantic_ai_available = True
            logger.info("Theme agent initialized successfully")
            
        except Exception as e:
            logger.warning(f"Failed to initialize theme agent: {e}")
            self.pydantic_ai_available = False

    def _get_theme_attribution_prompt(self) -> str:
        """Get the system prompt for theme attribution analysis."""
        return """
You are an expert analyst specializing in stakeholder-theme attribution.

For each theme provided, analyze:

1. **Stakeholder Attribution**: Which specific stakeholders contributed to this theme
2. **Contribution Strength**: How strongly each stakeholder contributed (0.0 to 1.0)
3. **Theme Context**: How this theme relates to each stakeholder's concerns and insights
4. **Distribution Analysis**: The spread of this theme across different stakeholder types

Return a JSON object with:
- stakeholder_contributions: List of {stakeholder_id, contribution_strength, context}
- theme_distribution: Analysis of how the theme spreads across stakeholder types
- dominant_stakeholder: The stakeholder who contributed most to this theme
- theme_consensus_level: How much stakeholders agree on this theme (0.0 to 1.0)

Focus on authentic evidence-based attribution and avoid generic responses.
"""

    async def enhance_themes_with_attribution(
        self,
        themes: List[Any],
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> List[Dict[str, Any]]:
        """
        Enhance themes with stakeholder attribution analysis.
        
        Args:
            themes: Original themes to enhance
            detected_stakeholders: Detected stakeholders for attribution
            files: Source files for evidence
            
        Returns:
            Enhanced themes with stakeholder attribution
        """
        logger.info(f"Enhancing {len(themes)} themes with stakeholder attribution")
        
        if not themes or not detected_stakeholders:
            return themes
        
        enhanced_themes = []
        stakeholder_map = self._create_stakeholder_map(detected_stakeholders)
        
        for i, theme in enumerate(themes):
            try:
                # Analyze theme-stakeholder attribution
                attribution = await self._analyze_theme_attribution(
                    theme, stakeholder_map, files, theme_number=i+1
                )
                
                # Create enhanced theme
                enhanced_theme = self._create_enhanced_theme(theme, attribution)
                enhanced_themes.append(enhanced_theme)
                
            except Exception as e:
                logger.warning(f"Failed to enhance theme {i}: {e}")
                # Keep original theme as fallback
                enhanced_themes.append(theme)
        
        logger.info(f"Successfully enhanced {len(enhanced_themes)} themes")
        return enhanced_themes

    async def _analyze_theme_attribution(
        self,
        theme: Any,
        stakeholder_map: Dict[str, Any],
        files: List[Any],
        theme_number: int,
    ) -> Dict[str, Any]:
        """Analyze stakeholder attribution for a specific theme."""
        
        if not self.pydantic_ai_available or not self.theme_agent:
            logger.warning(f"PydanticAI not available for theme {theme_number}, using fallback")
            return self._create_basic_theme_attribution(theme, stakeholder_map)
        
        try:
            # Prepare theme context
            theme_context = self._prepare_theme_context(theme, stakeholder_map, files)
            
            # Use theme service if available
            if os.getenv("USE_THEME_SERVICE", "false").lower() in ("1", "true", "yes"):
                attribution = await self._use_theme_service(theme_context, theme_number)
            else:
                # Direct agent call
                attribution_result = await self.theme_agent.run(theme_context)
                attribution = self._parse_attribution_result(attribution_result)
            
            return attribution
            
        except Exception as e:
            logger.error(f"Theme attribution analysis failed for theme {theme_number}: {e}")
            return self._create_basic_theme_attribution(theme, stakeholder_map)

    async def _use_theme_service(self, theme_context: str, theme_number: int) -> Dict[str, Any]:
        """Use dedicated theme service if available."""
        try:
            from backend.services.stakeholder.analysis.theme_analysis_service import ThemeAnalysisService
            from backend.utils.pydantic_ai_retry import get_conservative_retry_config
            
            # Get agent factory (simplified for V2)
            theme_service = ThemeAnalysisService(None)  # Will need proper factory injection
            retry_config = get_conservative_retry_config()
            
            result = await theme_service.analyze_with_retry(
                theme_context, retry_config, f"Theme {theme_number} attribution"
            )
            return self._parse_attribution_result(result)
            
        except Exception as e:
            logger.warning(f"Theme service unavailable, falling back to direct agent: {e}")
            attribution_result = await self.theme_agent.run(theme_context)
            return self._parse_attribution_result(attribution_result)

    def _prepare_theme_context(
        self, theme: Any, stakeholder_map: Dict[str, Any], files: List[Any]
    ) -> str:
        """Prepare context for theme attribution analysis."""
        
        # Extract theme information
        theme_name = getattr(theme, 'theme', str(theme))
        theme_description = getattr(theme, 'description', '')
        
        # Create stakeholder context
        stakeholder_context = []
        for stakeholder_id, stakeholder_data in stakeholder_map.items():
            context_line = f"- {stakeholder_id}: {stakeholder_data.get('name', 'Unknown')} ({stakeholder_data.get('stakeholder_type', 'Unknown')})"
            stakeholder_context.append(context_line)
        
        context = f"""
Theme to analyze: {theme_name}
Description: {theme_description}

Available stakeholders:
{chr(10).join(stakeholder_context)}

Please analyze which stakeholders contributed to this theme and provide attribution details.
"""
        return context

    def _create_stakeholder_map(self, detected_stakeholders: List[DetectedStakeholder]) -> Dict[str, Any]:
        """Create a map of stakeholders for easy lookup."""
        stakeholder_map = {}
        
        for stakeholder in detected_stakeholders:
            stakeholder_map[stakeholder.stakeholder_id] = {
                "name": stakeholder.name,
                "stakeholder_type": stakeholder.stakeholder_type,
                "role": stakeholder.role,
                "influence_level": stakeholder.influence_level,
                "key_concerns": stakeholder.key_concerns,
            }
        
        return stakeholder_map

    def _parse_attribution_result(self, result: Any) -> Dict[str, Any]:
        """Parse attribution result from LLM response."""
        try:
            if hasattr(result, 'data'):
                return result.data
            elif isinstance(result, dict):
                return result
            else:
                # Try to parse as JSON string
                import json
                return json.loads(str(result))
        except Exception as e:
            logger.warning(f"Failed to parse attribution result: {e}")
            return {}

    def _create_enhanced_theme(self, original_theme: Any, attribution: Dict[str, Any]) -> Dict[str, Any]:
        """Create enhanced theme with attribution data."""
        
        # Convert original theme to dict if needed
        if hasattr(original_theme, 'model_dump'):
            theme_dict = original_theme.model_dump()
        elif hasattr(original_theme, 'dict'):
            theme_dict = original_theme.dict()
        elif isinstance(original_theme, dict):
            theme_dict = original_theme.copy()
        else:
            theme_dict = {"theme": str(original_theme)}
        
        # Add stakeholder attribution
        theme_dict["stakeholder_attribution"] = attribution
        
        return theme_dict

    def _create_basic_theme_attribution(
        self, theme: Any, stakeholder_map: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create basic theme attribution as fallback."""
        
        theme_name = getattr(theme, 'theme', str(theme))
        stakeholder_ids = list(stakeholder_map.keys())
        
        # Create basic contributions
        stakeholder_contributions = []
        for stakeholder_id in stakeholder_ids[:3]:  # Limit to top 3
            stakeholder_data = stakeholder_map[stakeholder_id]
            contribution = {
                "stakeholder_id": stakeholder_id,
                "contribution_strength": 0.7,  # Default moderate contribution
                "context": f"Stakeholder {stakeholder_data['name']} contributed to theme '{theme_name}'"
            }
            stakeholder_contributions.append(contribution)
        
        return {
            "stakeholder_contributions": stakeholder_contributions,
            "theme_distribution": f"Theme '{theme_name}' distributed across {len(stakeholder_ids)} stakeholders",
            "dominant_stakeholder": stakeholder_ids[0] if stakeholder_ids else None,
            "theme_consensus_level": 0.7,  # Default moderate consensus
        }
