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
        logger.info(f"Starting markdown generation for analysis result {result_id}")

        # Get analysis result
        result = self._get_analysis_result(result_id)
        if not result:
            logger.error(
                f"Analysis result {result_id} not found for user {self.user.user_id}"
            )
            raise ValueError(f"Analysis result {result_id} not found")

        logger.info(f"Found analysis result {result_id}, extracting data...")

        # Extract data from result using results service
        data = self._extract_data_from_result(result)
        logger.info(
            f"Extracted data keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'}"
        )

        # Check if this is an incomplete or failed analysis
        if data.get("_status") in ["processing", "error"]:
            logger.info(
                f"Analysis {result_id} is incomplete (status: {data.get('_status')}), generating status report"
            )
            return self._generate_incomplete_analysis_report(data, result)

        # Generate Markdown with error handling
        try:
            markdown_content = self._create_markdown_report(data, result)
            logger.info(
                f"Successfully generated markdown report ({len(markdown_content)} characters)"
            )
            return markdown_content
        except Exception as e:
            logger.error(
                f"Error generating Markdown report for result {result_id}: {str(e)}",
                exc_info=True,
            )
            # Create a simple error Markdown with debugging info
            return f"""# Error Generating Report

An error occurred while generating the report for Analysis ID {result_id}.

**Error Details:**
{str(e)}

**Available Data Keys:**
{list(data.keys()) if isinstance(data, dict) else 'Data is not a dictionary'}

**User ID:** {self.user.user_id}

Please try again or contact support if the issue persists."""

    def _generate_incomplete_analysis_report(
        self, data: Dict[str, Any], result: AnalysisResult
    ) -> str:
        """
        Generate a markdown report for incomplete or failed analyses.

        Args:
            data: Analysis data (contains status information)
            result: AnalysisResult object

        Returns:
            Markdown formatted status report
        """
        status = data.get("_status", "unknown")
        message = data.get("_message", "No message available")
        error = data.get("_error")

        # Format the analysis date
        analysis_date = (
            result.analysis_date.strftime("%B %d, %Y at %I:%M %p")
            if result.analysis_date
            else "Unknown"
        )

        markdown_content = f"""# Analysis Report - {status.title()}

**Analysis ID:** {result.result_id}
**Date:** {analysis_date}
**Status:** {status.title()}

## Status Information

{message}
"""

        if error:
            markdown_content += f"""
## Error Details

```
{error}
```
"""

        if status == "processing":
            markdown_content += """
## What This Means

This analysis is still being processed. The system is working on:
- Extracting themes and patterns from your data
- Generating personas based on the insights
- Creating sentiment analysis
- Preparing comprehensive insights

Please check back later or refresh the page to see if the analysis has completed.
"""
        elif status == "error":
            markdown_content += """
## What This Means

This analysis encountered an error during processing. This could be due to:
- Issues with the uploaded data format
- Temporary system problems
- Data that couldn't be properly analyzed

You may want to try re-running the analysis or contact support if the problem persists.
"""

        markdown_content += f"""
---

*Report generated on {self._get_current_timestamp()}*
"""

        return markdown_content

    def _create_markdown_report(
        self, data: Dict[str, Any], result: AnalysisResult
    ) -> str:
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
        md.append(
            f"File: {result.interview_data.filename if result.interview_data else 'N/A'}\n"
        )

        # Add sentiment overview if available
        if data and data.get("sentimentOverview"):
            self._add_sentiment_overview_md(md, data["sentimentOverview"])

        # Add enhanced themes section if available (preferred over regular themes)
        if data and data.get("enhanced_themes"):
            logger.info(f"Using enhanced themes: {len(data['enhanced_themes'])} found")
            self._add_enhanced_themes_section_md(md, data["enhanced_themes"])
        elif data and data.get("themes"):
            logger.info(f"Using regular themes: {len(data['themes'])} found")
            self._add_themes_section_md(md, data["themes"])
        else:
            logger.warning("No themes or enhanced_themes found in data")

        # Add patterns section if available
        if data and data.get("patterns"):
            self._add_patterns_section_md(md, data["patterns"])

        # Add insights section if available
        if data and data.get("insights"):
            self._add_insights_section_md(md, data["insights"])

        # Add full personas section if available
        if data and data.get("personas"):
            logger.info(f"Using full personas: {len(data['personas'])} found")
            self._add_full_personas_section_md(md, data["personas"])
        else:
            logger.warning("No personas found in data")

        # Add PRD section if available
        try:
            prd_data = self._get_prd_data(result.result_id)
            if prd_data:
                logger.info(f"Adding PRD section for analysis {result.result_id}")
                self._add_prd_section_md(md, prd_data)
            else:
                logger.warning(f"No PRD data found for analysis {result.result_id}")
        except Exception as e:
            logger.warning(
                f"Could not retrieve PRD data for analysis {result.result_id}: {str(e)}"
            )

        # Add a summary of what was included in the report
        self._add_report_summary_md(md, data, result)

        # Join all lines and return
        return "\n".join(md)

    def _add_report_summary_md(
        self, md: List[str], data: Dict[str, Any], result: AnalysisResult = None
    ) -> None:
        """
        Add a summary section showing what data was included in the report.

        Args:
            md: List to append markdown content to
            data: Analysis data dictionary
        """
        md.append("\n---\n")
        md.append("## Report Summary\n")

        # Count available sections
        sections_included = []
        sections_missing = []

        # Check each section
        if data.get("sentimentOverview"):
            sections_included.append("✅ Sentiment Overview")
        else:
            sections_missing.append("❌ Sentiment Overview")

        # Check for enhanced themes vs regular themes
        if data.get("enhanced_themes") and len(data["enhanced_themes"]) > 0:
            sections_included.append(
                f"✅ Enhanced Themes ({len(data['enhanced_themes'])} found)"
            )
        elif data.get("themes") and len(data["themes"]) > 0:
            sections_included.append(f"✅ Themes ({len(data['themes'])} found)")
        else:
            sections_missing.append("❌ Themes")

        if data.get("patterns") and len(data["patterns"]) > 0:
            sections_included.append(f"✅ Patterns ({len(data['patterns'])} found)")
        else:
            sections_missing.append("❌ Patterns")

        if data.get("insights") and len(data["insights"]) > 0:
            sections_included.append(f"✅ Insights ({len(data['insights'])} found)")
        else:
            sections_missing.append("❌ Insights")

        if data.get("personas") and len(data["personas"]) > 0:
            sections_included.append(
                f"✅ Full Personas ({len(data['personas'])} found)"
            )
        else:
            sections_missing.append("❌ Personas")

        # Check for PRD (this is retrieved separately)
        try:
            prd_data = self._get_prd_data(result.result_id) if result else None
            if prd_data:
                sections_included.append("✅ Product Requirements Document (PRD)")
            else:
                sections_missing.append("❌ Product Requirements Document (PRD)")
        except Exception:
            sections_missing.append("❌ Product Requirements Document (PRD)")

        # Add included sections
        if sections_included:
            md.append("### Sections Included in This Report:\n")
            for section in sections_included:
                md.append(f"- {section}")
            md.append("")

        # Add missing sections if any
        if sections_missing:
            md.append("### Sections Not Available:\n")
            for section in sections_missing:
                md.append(f"- {section}")
            md.append("")
            md.append(
                "*Note: Missing sections may indicate that the analysis is still processing, encountered errors, or the uploaded data didn't contain sufficient information for those analysis types.*\n"
            )

        md.append(f"*Report generated on {self._get_current_timestamp()}*\n")

    def _get_prd_data(self, result_id: int) -> Dict[str, Any]:
        """
        Retrieve PRD data for the analysis.

        Args:
            result_id: Analysis result ID

        Returns:
            PRD data dictionary or None if not available
        """
        try:
            from backend.models import CachedPRD

            # Try to get cached PRD data directly from database
            cached_prd = (
                self.db.query(CachedPRD)
                .filter(CachedPRD.result_id == result_id, CachedPRD.prd_type == "both")
                .first()
            )

            if cached_prd and cached_prd.prd_data:
                logger.info(f"Found cached PRD data for analysis {result_id}")
                return cached_prd.prd_data

            # If no cached PRD found, try other prd_types
            cached_prd = (
                self.db.query(CachedPRD)
                .filter(CachedPRD.result_id == result_id)
                .first()
            )

            if cached_prd and cached_prd.prd_data:
                logger.info(
                    f"Found cached PRD data (type: {cached_prd.prd_type}) for analysis {result_id}"
                )
                return cached_prd.prd_data

            logger.info(f"No cached PRD data found for analysis {result_id}")
            return None

        except Exception as e:
            logger.warning(f"Error retrieving PRD data: {str(e)}")
            return None

    def _get_current_timestamp(self) -> str:
        """
        Get current timestamp formatted for display.

        Returns:
            Formatted timestamp string
        """
        from datetime import datetime

        return datetime.now().strftime("%B %d, %Y at %I:%M %p")

    def _add_enhanced_themes_section_md(
        self, md: List[str], enhanced_themes: List[Dict[str, Any]]
    ) -> None:
        """
        Add enhanced themes section to markdown.

        Args:
            md: List to append markdown content to
            enhanced_themes: List of enhanced theme dictionaries
        """
        md.append("## Enhanced Themes\n")

        for theme in enhanced_themes:
            name = self._clean_markdown_text(theme.get("name", "Unnamed Theme"))
            definition = self._clean_markdown_text(
                theme.get("definition", "No definition available")
            )

            md.append(f"### {name}\n")
            md.append(f"*{definition}*\n")

            # Add frequency and reliability info
            frequency = theme.get("frequency", 0)
            reliability = theme.get("reliability", {})
            reliability_score = (
                reliability.get("overall_score", 0)
                if isinstance(reliability, dict)
                else 0
            )

            md.append(
                f"**Frequency:** {frequency} mentions | **Reliability:** {reliability_score:.2f}\n"
            )

            # Add supporting statements
            statements = theme.get("statements", [])
            if statements:
                md.append("**Supporting Statements:**\n")
                for statement in statements[:5]:  # Limit to top 5 statements
                    clean_statement = self._clean_markdown_text(statement)
                    md.append(f"- {clean_statement}\n")

            # Add stakeholder attribution if available
            stakeholder_attribution = theme.get("stakeholder_attribution", {})
            if stakeholder_attribution:
                md.append("**Stakeholder Attribution:**\n")
                for stakeholder, count in stakeholder_attribution.items():
                    md.append(f"- {stakeholder}: {count} mentions\n")

            # Add sentiment distribution if available
            sentiment_dist = theme.get("sentiment_distribution", {})
            if sentiment_dist:
                md.append("**Sentiment Distribution:**\n")
                for sentiment, percentage in sentiment_dist.items():
                    md.append(f"- {sentiment.title()}: {percentage:.1f}%\n")

            md.append("\n")

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

        # Only escape problematic characters that could break markdown parsing
        # DO NOT escape #, *, -, + as these are needed for markdown formatting
        # Only escape characters that could interfere with content display
        problematic_chars = ["\\", "`"]
        for char in problematic_chars:
            text = text.replace(char, "\\" + char)

        return text

    def _add_sentiment_overview_md(
        self, md: List[str], sentiment_overview: Dict[str, Any]
    ) -> None:
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
                    md.append(
                        f"**Positive:** {self._clean_markdown_text(str(sentiment_overview['positive']))}  "
                    )

            # Display neutral percentage
            if sentiment_overview.get("neutral") is not None:
                try:
                    neutral = float(sentiment_overview["neutral"]) * 100
                    md.append(f"**Neutral:** {neutral:.1f}%  ")
                except (ValueError, TypeError):
                    md.append(
                        f"**Neutral:** {self._clean_markdown_text(str(sentiment_overview['neutral']))}  "
                    )

            # Display negative percentage
            if sentiment_overview.get("negative") is not None:
                try:
                    negative = float(sentiment_overview["negative"]) * 100
                    md.append(f"**Negative:** {negative:.1f}%  ")
                except (ValueError, TypeError):
                    md.append(
                        f"**Negative:** {self._clean_markdown_text(str(sentiment_overview['negative']))}  "
                    )

        md.append("\n")

    def _add_themes_section_md(
        self, md: List[str], themes: List[Dict[str, Any]]
    ) -> None:
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

    def _add_patterns_section_md(
        self, md: List[str], patterns: List[Dict[str, Any]]
    ) -> None:
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

    def _add_insights_section_md(
        self, md: List[str], insights: List[Dict[str, Any]]
    ) -> None:
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
                        md.append(
                            f"### {i+1}. {self._clean_markdown_text(insight['text'])}\n\n"
                        )
                    # Try to get description field
                    elif insight.get("description"):
                        md.append(
                            f"### {i+1}. {self._clean_markdown_text(insight['description'])}\n\n"
                        )
                    # If no text or description, convert the whole dict to string
                    else:
                        md.append(
                            f"### {i+1}. {self._clean_markdown_text(str(insight))}\n\n"
                        )
                else:
                    md.append(
                        f"### {i+1}. {self._clean_markdown_text(str(insight))}\n\n"
                    )
            except Exception as e:
                logger.error(f"Error processing insight: {str(e)}")
                md.append(f"### {i+1}. Error processing insight\n\n")

    def _add_full_personas_section_md(
        self, md: List[str], personas: List[Dict[str, Any]]
    ) -> None:
        """
        Add comprehensive personas section to markdown with all fields.

        Args:
            md: List to append markdown content to
            personas: List of persona dictionaries
        """
        md.append("## Personas\n")

        for persona in personas:
            name = self._clean_markdown_text(persona.get("name", "Unnamed Persona"))
            description = self._clean_markdown_text(
                persona.get("description", "No description available")
            )

            md.append(f"### {name}\n")
            md.append(f"*{description}*\n")

            # Add demographics
            demographics = persona.get("demographics", {})
            if demographics:
                md.append("**Demographics:**\n")
                if isinstance(demographics, dict):
                    demo_value = demographics.get("value", demographics)
                    if isinstance(demo_value, str):
                        md.append(f"- {self._clean_markdown_text(demo_value)}\n")
                    elif isinstance(demo_value, list):
                        for demo_item in demo_value:
                            md.append(
                                f"- {self._clean_markdown_text(str(demo_item))}\n"
                            )
                else:
                    md.append(f"- {self._clean_markdown_text(str(demographics))}\n")
                md.append("\n")

            # Add goals and motivations
            goals = persona.get("goals_and_motivations", {})
            if goals:
                md.append("**Goals & Motivations:**\n")
                if isinstance(goals, dict):
                    goals_value = goals.get("value", goals)
                    if isinstance(goals_value, str):
                        md.append(f"{self._clean_markdown_text(goals_value)}\n")
                    elif isinstance(goals_value, list):
                        for goal in goals_value:
                            md.append(f"- {self._clean_markdown_text(str(goal))}\n")
                else:
                    md.append(f"{self._clean_markdown_text(str(goals))}\n")
                md.append("\n")

            # Add challenges and frustrations
            challenges = persona.get("challenges_and_frustrations", {})
            if challenges:
                md.append("**Challenges & Frustrations:**\n")
                if isinstance(challenges, dict):
                    challenges_value = challenges.get("value", challenges)
                    if isinstance(challenges_value, str):
                        md.append(f"{self._clean_markdown_text(challenges_value)}\n")
                    elif isinstance(challenges_value, list):
                        for challenge in challenges_value:
                            md.append(
                                f"- {self._clean_markdown_text(str(challenge))}\n"
                            )
                else:
                    md.append(f"{self._clean_markdown_text(str(challenges))}\n")
                md.append("\n")

            # Add key quotes
            key_quotes = persona.get("key_quotes", {})
            if key_quotes:
                md.append("**Key Quotes:**\n")
                if isinstance(key_quotes, dict):
                    quotes_evidence = key_quotes.get("evidence", [])
                    if quotes_evidence:
                        for quote in quotes_evidence[:3]:  # Limit to top 3 quotes
                            md.append(f'> "{self._clean_markdown_text(str(quote))}"\n')
                elif isinstance(key_quotes, list):
                    for quote in key_quotes[:3]:
                        md.append(f'> "{self._clean_markdown_text(str(quote))}"\n')
                md.append("\n")

            # Add confidence score
            confidence = persona.get("overall_confidence", 0)
            if confidence:
                md.append(f"**Confidence Score:** {confidence:.2f}\n")

            md.append("\n")

    def _add_personas_section_md(
        self, md: List[str], personas: List[Dict[str, Any]]
    ) -> None:
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

    def _add_prd_section_md(self, md: List[str], prd_data: Dict[str, Any]) -> None:
        """
        Add PRD (Product Requirements Document) section to markdown.

        Args:
            md: List to append markdown content to
            prd_data: PRD data dictionary
        """
        md.append("## Product Requirements Document (PRD)\n")

        prd_type = prd_data.get("prd_type", "both")

        # Add operational PRD if available
        operational_prd = prd_data.get("operational_prd", {})
        if operational_prd:
            md.append("### Operational PRD\n")

            # Add objectives
            objectives = operational_prd.get("objectives", [])
            if objectives:
                md.append("#### Objectives\n")
                for i, obj in enumerate(objectives, 1):
                    title = self._clean_markdown_text(
                        obj.get("title", f"Objective {i}")
                    )
                    description = self._clean_markdown_text(
                        obj.get("description", "No description")
                    )
                    md.append(f"**{i}. {title}**\n")
                    md.append(f"{description}\n\n")

            # Add scope
            scope = operational_prd.get("scope", {})
            if scope:
                md.append("#### Scope\n")

                included = scope.get("included", [])
                if included:
                    md.append("**Included:**\n")
                    for item in included:
                        md.append(f"- {self._clean_markdown_text(item)}\n")
                    md.append("\n")

                excluded = scope.get("excluded", [])
                if excluded:
                    md.append("**Excluded:**\n")
                    for item in excluded:
                        md.append(f"- {self._clean_markdown_text(item)}\n")
                    md.append("\n")

            # Add success metrics
            success_metrics = operational_prd.get("success_metrics", [])
            if success_metrics:
                md.append("#### Success Metrics\n")
                for metric in success_metrics:
                    metric_name = self._clean_markdown_text(
                        metric.get("metric", "Unnamed Metric")
                    )
                    target = self._clean_markdown_text(
                        metric.get("target", "No target specified")
                    )
                    method = self._clean_markdown_text(
                        metric.get("measurement_method", "No method specified")
                    )

                    md.append(f"**{metric_name}**\n")
                    md.append(f"- Target: {target}\n")
                    md.append(f"- Measurement: {method}\n\n")

        # Add technical PRD if available
        technical_prd = prd_data.get("technical_prd", {})
        if technical_prd:
            md.append("### Technical PRD\n")

            # Add architecture overview
            architecture = technical_prd.get("architecture", {})
            if architecture:
                overview = architecture.get("overview", "")
                if overview:
                    md.append("#### Architecture Overview\n")
                    md.append(f"{self._clean_markdown_text(overview)}\n\n")

                # Add components
                components = architecture.get("components", [])
                if components:
                    md.append("#### System Components\n")
                    for component in components:
                        name = self._clean_markdown_text(
                            component.get("name", "Unnamed Component")
                        )
                        purpose = self._clean_markdown_text(
                            component.get("purpose", "No purpose specified")
                        )
                        md.append(f"**{name}**\n")
                        md.append(f"{purpose}\n\n")

            # Add implementation requirements
            impl_requirements = technical_prd.get("implementation_requirements", [])
            if impl_requirements:
                md.append("#### Implementation Requirements\n")
                for req in impl_requirements:
                    req_id = req.get("id", "")
                    title = self._clean_markdown_text(
                        req.get("title", "Unnamed Requirement")
                    )
                    description = self._clean_markdown_text(
                        req.get("description", "No description")
                    )
                    priority = req.get("priority", "Medium")

                    md.append(f"**{req_id}: {title}** (Priority: {priority})\n")
                    md.append(f"{description}\n\n")

        md.append("\n")
