"""
Markdown report generator.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from backend.models import AnalysisResult
from backend.services.export.base_generator import BaseReportGenerator

logger = logging.getLogger(__name__)

class MarkdownReportGenerator(BaseReportGenerator):
    """
    Markdown report generator.
    
    This class generates Markdown reports for analysis results.
    """
    
    async def generate(self, result_id: int) -> str:
        """
        Generate a Markdown report for an analysis result.
        
        Args:
            result_id: ID of the analysis result
            
        Returns:
            Markdown content as string
        """
        # Get analysis result
        result = self._get_analysis_result(result_id)
        if not result:
            raise ValueError(f"Analysis result {result_id} not found")
        
        # Extract data from result
        data = self._extract_data_from_result(result)
        
        # Generate Markdown with error handling
        try:
            return self._create_markdown_report(data, result)
        except Exception as e:
            logger.error(f"Error generating Markdown report: {str(e)}")
            # Create a simple error Markdown
            return f"# Error Generating Report\n\nAn error occurred while generating the report: {str(e)}\n\nPlease try again or contact support if the issue persists."
    
    def _create_markdown_report(self, data: Dict[str, Any], result: AnalysisResult) -> str:
        """
        Create a Markdown report from analysis data.
        
        Args:
            data: Analysis data dictionary
            result: AnalysisResult object
            
        Returns:
            Markdown content as string
        """
        import json
        
        # Ensure data is a dictionary
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                data = {"error": "Could not parse result data"}
        
        # Initialize Markdown content
        md = []
        
        # Title
        md.append("# Design Thinking Analysis Report\n")
        
        # Add date and file info
        md.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  ")
        md.append(f"Analysis ID: {result.result_id}  ")
        md.append(f"File: {result.interview_data.filename if result.interview_data else 'N/A'}\n")
        
        # Add sentiment overview if available
        if data and data.get("sentimentOverview"):
            self._add_sentiment_overview_md(md, data["sentimentOverview"])
        
        # Add themes section if available
        if data and data.get("themes"):
            self._add_themes_section_md(md, data["themes"])
        
        # Add patterns section if available
        if data and data.get("patterns"):
            self._add_patterns_section_md(md, data["patterns"])
        
        # Add insights section if available
        if data and data.get("insights"):
            self._add_insights_section_md(md, data["insights"])
        
        # Add personas section if available
        if data and data.get("personas"):
            self._add_personas_section_md(md, data["personas"])
        
        # Join all lines and return
        return "\n".join(md)
    
    def _clean_markdown_text(self, text: Any) -> str:
        """
        Clean text for Markdown formatting.
        
        Args:
            text: Text to clean
            
        Returns:
            Cleaned text
        """
        # First apply basic Unicode cleaning
        text = self._clean_text(text)
        
        # Escape Markdown special characters
        special_chars = ['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!']
        for char in special_chars:
            text = text.replace(char, '\\' + char)
        
        return text
    
    def _add_sentiment_overview_md(self, md: List[str], sentiment_overview: Dict[str, Any]) -> None:
        """
        Add sentiment overview section to Markdown.
        
        Args:
            md: List of Markdown lines
            sentiment_overview: Sentiment overview dictionary
        """
        md.append("## Sentiment Overview\n")
        
        if isinstance(sentiment_overview, dict):
            # Display positive percentage
            if sentiment_overview.get("positive") is not None:
                try:
                    positive = float(sentiment_overview["positive"]) * 100
                    md.append(f"**Positive:** {positive:.1f}%  ")
                except (ValueError, TypeError):
                    md.append(f"**Positive:** {self._clean_markdown_text(str(sentiment_overview['positive']))}  ")
            
            # Display neutral percentage
            if sentiment_overview.get("neutral") is not None:
                try:
                    neutral = float(sentiment_overview["neutral"]) * 100
                    md.append(f"**Neutral:** {neutral:.1f}%  ")
                except (ValueError, TypeError):
                    md.append(f"**Neutral:** {self._clean_markdown_text(str(sentiment_overview['neutral']))}  ")
            
            # Display negative percentage
            if sentiment_overview.get("negative") is not None:
                try:
                    negative = float(sentiment_overview["negative"]) * 100
                    md.append(f"**Negative:** {negative:.1f}%  ")
                except (ValueError, TypeError):
                    md.append(f"**Negative:** {self._clean_markdown_text(str(sentiment_overview['negative']))}  ")
        
        md.append("\n")
    
    def _add_themes_section_md(self, md: List[str], themes: List[Dict[str, Any]]) -> None:
        """
        Add themes section to Markdown.
        
        Args:
            md: List of Markdown lines
            themes: List of theme dictionaries
        """
        md.append("## Themes\n")
        
        for i, theme in enumerate(themes):
            # Theme header
            name = theme.get("name", f"Theme {i+1}")
            md.append(f"### {self._clean_markdown_text(name)}\n")
            
            # Theme definition
            definition = self._extract_field_value(theme, "definition")
            if definition:
                md.append(f"*{self._clean_markdown_text(definition)}*\n")
            
            # Theme statements
            statements = theme.get("statements", [])
            if statements:
                md.append("**Supporting Statements:**\n")
                for statement in statements[:5]:  # Limit to 5 statements
                    md.append(f"- {self._clean_markdown_text(statement)}\n")
            
            md.append("\n")
    
    def _add_patterns_section_md(self, md: List[str], patterns: List[Dict[str, Any]]) -> None:
        """
        Add patterns section to Markdown.
        
        Args:
            md: List of Markdown lines
            patterns: List of pattern dictionaries
        """
        md.append("## Patterns\n")
        
        for i, pattern in enumerate(patterns):
            # Pattern header
            name = pattern.get("name", f"Pattern {i+1}")
            category = pattern.get("category", "")
            header = name
            if category:
                header = f"{name} ({category})"
            md.append(f"### {self._clean_markdown_text(header)}\n")
            
            # Pattern description
            description = pattern.get("description", "")
            if description:
                md.append(f"{self._clean_markdown_text(description)}\n")
            
            # Pattern evidence
            evidence = pattern.get("evidence", [])
            if evidence:
                md.append("**Evidence:**\n")
                for item in evidence[:5]:  # Limit to 5 evidence items
                    md.append(f"- {self._clean_markdown_text(item)}\n")
            
            # Pattern impact
            impact = pattern.get("impact", "")
            if impact:
                md.append(f"**Impact:** {self._clean_markdown_text(impact)}\n")
            
            # Pattern suggested actions
            actions = pattern.get("suggested_actions", [])
            if actions:
                md.append("**Suggested Actions:**\n")
                for action in actions:
                    md.append(f"- {self._clean_markdown_text(action)}\n")
            
            md.append("\n")
    
    def _add_insights_section_md(self, md: List[str], insights: List[Dict[str, Any]]) -> None:
        """
        Add insights section to Markdown.
        
        Args:
            md: List of Markdown lines
            insights: List of insight dictionaries
        """
        md.append("## Insights\n")
        
        for i, insight in enumerate(insights):
            try:
                if isinstance(insight, dict):
                    # Format insight based on available fields
                    if insight.get("topic") and insight.get("observation"):
                        # This is a structured insight with topic and observation
                        md.append(
                            f"### {i+1}. {self._clean_markdown_text(insight.get('topic', 'Untitled Insight'))}\n"
                        )
                        md.append(
                            f"**Observation:** {self._clean_markdown_text(insight.get('observation', ''))}\n"
                        )
                        
                        # Add evidence if available
                        if insight.get("evidence"):
                            md.append("**Evidence:**\n")
                            evidence = insight["evidence"]
                            if isinstance(evidence, list):
                                # Process each evidence item with proper line breaks
                                for item in evidence:
                                    # Clean the item text and ensure it doesn't have excessive line breaks
                                    clean_item = self._clean_markdown_text(item)
                                    # Add the evidence item with proper formatting
                                    md.append(f"- {clean_item}\n")
                            else:
                                md.append(f"{self._clean_markdown_text(evidence)}\n")
                            # Add an extra line break after evidence section
                            md.append("\n")
                        
                        # Add implication if available
                        if insight.get("implication"):
                            md.append(
                                f"**Implication:** {self._clean_markdown_text(insight.get('implication', ''))}\n\n"
                            )
                        
                        # Add recommendation if available
                        if insight.get("recommendation"):
                            md.append(
                                f"**Recommendation:** {self._clean_markdown_text(insight.get('recommendation', ''))}\n\n"
                            )
                        
                        # Add priority if available
                        if insight.get("priority"):
                            md.append(
                                f"**Priority:** {self._clean_markdown_text(insight.get('priority', ''))}\n\n"
                            )
                    # Try to get text field
                    elif insight.get("text"):
                        md.append(f"### {i+1}. {self._clean_markdown_text(insight['text'])}\n\n")
                    # Try to get description field
                    elif insight.get("description"):
                        md.append(f"### {i+1}. {self._clean_markdown_text(insight['description'])}\n\n")
                    # If no text or description, convert the whole dict to string
                    else:
                        md.append(f"### {i+1}. {self._clean_markdown_text(str(insight))}\n\n")
                else:
                    md.append(f"### {i+1}. {self._clean_markdown_text(str(insight))}\n\n")
            except Exception as e:
                logger.error(f"Error processing insight: {str(e)}")
                md.append(f"### {i+1}. Error processing insight\n\n")
    
    def _add_personas_section_md(self, md: List[str], personas: List[Dict[str, Any]]) -> None:
        """
        Add personas section to Markdown.
        
        Args:
            md: List of Markdown lines
            personas: List of persona dictionaries
        """
        md.append("## Personas\n")
        
        for i, persona in enumerate(personas):
            # Persona header
            name = persona.get("name", f"Persona {i+1}")
            md.append(f"### {self._clean_markdown_text(name)}\n")
            
            # Persona description
            description = persona.get("description", "")
            if description:
                md.append(f"*{self._clean_markdown_text(description)}*\n")
            
            # Persona attributes
            attributes = [
                ("Role Context", "role_context"),
                ("Key Responsibilities", "key_responsibilities"),
                ("Tools Used", "tools_used"),
                ("Collaboration Style", "collaboration_style"),
                ("Analysis Approach", "analysis_approach"),
                ("Pain Points", "pain_points"),
            ]
            
            for label, key in attributes:
                if key in persona:
                    attr = persona[key]
                    value = attr.get("value", "") if isinstance(attr, dict) else attr
                    if value:
                        md.append(f"**{label}:** {self._clean_markdown_text(value)}\n")
            
            md.append("\n")
