from sqlalchemy.orm import Session
from backend.models import User, AnalysisResult, InterviewData
from typing import Dict, Any, Optional
import logging
from fpdf import FPDF
from datetime import datetime
import json


# Helper function to replace problematic Unicode characters
def clean_text(text):
    if not isinstance(text, str):
        return str(text)
    # Replace common Unicode characters with ASCII equivalents
    replacements = {
        "\u2013": "-",  # en dash
        "\u2014": "--",  # em dash
        "\u2018": "'",  # left single quote
        "\u2019": "'",  # right single quote
        "\u201c": '"',  # left double quote
        "\u201d": '"',  # right double quote
        "\u2022": "*",  # bullet
        "\u2026": "...",  # ellipsis
        "\u00a0": " ",  # non-breaking space
        "\u00b7": "*",  # middle dot
        "\u2212": "-",  # minus sign
    }
    for unicode_char, ascii_char in replacements.items():
        text = text.replace(unicode_char, ascii_char)
    return text


logger = logging.getLogger(__name__)


class ExportService:
    """
    Service for exporting analysis results in various formats
    """

    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user

    async def generate_analysis_pdf(self, result_id: int) -> bytes:
        """
        Generate a PDF report for an analysis result

        Args:
            result_id: ID of the analysis result

        Returns:
            bytes: PDF file content
        """
        # Get analysis result
        result = self._get_analysis_result(result_id)
        if not result:
            raise ValueError(f"Analysis result {result_id} not found")

        # Extract data from result
        try:
            # First try to access the results field directly
            if result.results and isinstance(result.results, dict):
                data = result.results
            # If that doesn't work, try to use the result_data property
            elif result.result_data:
                if isinstance(result.result_data, str):
                    data = json.loads(result.result_data)
                else:
                    data = result.result_data
            else:
                # Fallback to empty dict if no data is available
                data = {}
        except Exception as e:
            logger.error(f"Error extracting data from result: {str(e)}")
            data = {}

        # Generate PDF with error handling
        try:
            return self._create_pdf_report(data, result)
        except Exception as e:
            logger.error(f"Error generating PDF report: {str(e)}")
            # Create a simple error PDF with Unicode support
            pdf = FPDF()
            # Use standard fonts

            pdf.add_page()
            pdf.set_font("Arial", "B", 16)
            pdf.cell(0, 10, clean_text("Error Generating Report"), 0, 1, "C")

            pdf.set_font("Arial", "", 12)
            pdf.multi_cell(
                0,
                10,
                clean_text(f"An error occurred while generating the report: {str(e)}"),
            )
            pdf.multi_cell(
                0,
                10,
                clean_text(
                    "Please try again or contact support if the issue persists."
                ),
            )
            # For Python 3, we need to encode with latin-1 as per FPDF documentation
            try:
                return pdf.output(dest="S").encode("latin-1")
            except Exception:
                # Try with errors='replace' as a fallback
                try:
                    return pdf.output(dest="S").encode("latin-1", errors="replace")
                except Exception:
                    # Last resort - try to return something
                    return pdf.output(dest="S")

    async def generate_analysis_markdown(self, result_id: int) -> str:
        """
        Generate a Markdown report for an analysis result

        Args:
            result_id: ID of the analysis result

        Returns:
            str: Markdown content
        """
        # Get analysis result
        result = self._get_analysis_result(result_id)
        if not result:
            raise ValueError(f"Analysis result {result_id} not found")

        # Extract data from result
        try:
            # First try to access the results field directly
            if result.results and isinstance(result.results, dict):
                data = result.results
            # If that doesn't work, try to use the result_data property
            elif result.result_data:
                if isinstance(result.result_data, str):
                    data = json.loads(result.result_data)
                else:
                    data = result.result_data
            else:
                # Fallback to empty dict if no data is available
                data = {}
        except Exception as e:
            logger.error(f"Error extracting data from result: {str(e)}")
            data = {}

        # Generate Markdown with error handling
        try:
            return self._create_markdown_report(data, result)
        except Exception as e:
            logger.error(f"Error generating Markdown report: {str(e)}")
            # Create a simple error Markdown
            return f"# Error Generating Report\n\nAn error occurred while generating the report: {str(e)}\n\nPlease try again or contact support if the issue persists."

    def _get_analysis_result(self, result_id: int) -> Optional[AnalysisResult]:
        """
        Get analysis result from database
        """
        # Join with InterviewData to check user_id
        return (
            self.db.query(AnalysisResult)
            .join(InterviewData, AnalysisResult.data_id == InterviewData.id)
            .filter(
                AnalysisResult.result_id == result_id,
                InterviewData.user_id == self.user.user_id,
            )
            .first()
        )

    def _create_pdf_report(self, data: Dict[str, Any], result: AnalysisResult) -> bytes:
        """
        Create a PDF report from analysis data

        Args:
            data: Analysis data dictionary
            result: AnalysisResult object

        Returns:
            bytes: PDF file content
        """
        # Ensure data is a dictionary
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                data = {"error": "Could not parse result data"}

        try:
            # Initialize PDF with UTF-8 support
            pdf = FPDF()
            # Use standard fonts

            pdf.add_page()

            # Title
            pdf.set_font("Arial", "B", 16)
            pdf.cell(0, 10, clean_text("Design Thinking Analysis Report"), 0, 1, "C")

            # Add date and file info
            pdf.set_font("Arial", "", 10)
            pdf.cell(
                0,
                10,
                clean_text(
                    f'Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
                ),
                0,
                1,
            )
            pdf.cell(0, 10, clean_text(f"Analysis ID: {result.result_id}"), 0, 1)
            pdf.cell(
                0,
                10,
                clean_text(
                    f'File: {result.interview_data.filename if result.interview_data else "N/A"}'
                ),
                0,
                1,
            )
            pdf.ln(5)

            # Add themes section if available
            if data and data.get("themes"):
                pdf.set_font("Arial", "B", 14)
                pdf.cell(0, 10, clean_text("Themes"), 0, 1)

                for i, theme in enumerate(data["themes"]):
                    # Theme header
                    pdf.set_font("Arial", "B", 12)
                    name = theme.get("name", f"Theme {i+1}")
                    pdf.cell(0, 10, clean_text(f"{name}"), 0, 1)

                    # Theme definition
                    if theme.get("definition"):
                        pdf.set_font("Arial", "I", 10)
                        definition = theme["definition"]
                        if isinstance(definition, dict) and definition.get("value"):
                            definition = definition["value"]
                        pdf.multi_cell(0, 10, f"Definition: {clean_text(definition)}")

                    # Theme frequency
                    if theme.get("frequency"):
                        pdf.set_font("Arial", "", 10)
                        frequency = theme["frequency"]
                        # Handle case where frequency might be a dict
                        if (
                            isinstance(frequency, dict)
                            and frequency.get("value") is not None
                        ):
                            frequency = frequency["value"]
                        # Ensure frequency is a number
                        try:
                            frequency = float(frequency)
                            pdf.cell(0, 10, f"Frequency: {frequency:.2f}", 0, 1)
                        except (ValueError, TypeError):
                            # If frequency is not a number, just display it as text
                            pdf.cell(0, 10, f"Frequency: {clean_text(frequency)}", 0, 1)

                    # Theme sentiment
                    if theme.get("sentiment_estimate") is not None:
                        pdf.set_font("Arial", "", 10)
                        sentiment = theme["sentiment_estimate"]
                        # Handle case where sentiment might be a dict
                        if (
                            isinstance(sentiment, dict)
                            and sentiment.get("value") is not None
                        ):
                            sentiment = sentiment["value"]
                        # Ensure sentiment is a number
                        try:
                            sentiment = float(sentiment)
                            sentiment_text = (
                                "Positive"
                                if sentiment > 0.2
                                else "Negative" if sentiment < -0.2 else "Neutral"
                            )
                            pdf.cell(
                                0,
                                10,
                                f"Sentiment: {sentiment_text} ({sentiment:.2f})",
                                0,
                                1,
                            )
                        except (ValueError, TypeError):
                            # If sentiment is not a number, just display it as text
                            pdf.cell(
                                0,
                                10,
                                f"Sentiment: {clean_text(sentiment)}",
                                0,
                                1,
                            )

                    # Example quotes
                    if theme.get("example_quotes") or theme.get("statements"):
                        quotes = theme.get(
                            "example_quotes", theme.get("statements", [])
                        )
                        # Handle case where quotes might be a dict
                        if isinstance(quotes, dict) and quotes.get("value"):
                            quotes = quotes["value"]
                        if not isinstance(quotes, list):
                            quotes = [str(quotes)]
                        if quotes:
                            pdf.set_font("Arial", "B", 10)
                            pdf.cell(0, 10, "Example Quotes:", 0, 1)

                            pdf.set_font("Arial", "", 10)
                            for quote in quotes[
                                :3
                            ]:  # Limit to 3 quotes to keep PDF reasonable
                                text = (
                                    str(quote).encode("ascii", errors="ignore").decode()
                                )
                                pdf.cell(5, 10, "*", 0, 0)
                                pdf.multi_cell(0, 10, text)

                    pdf.ln(5)

            # Add personas section if available
            if data and data.get("personas"):
                pdf.add_page()
                pdf.set_font("Arial", "B", 14)
                pdf.cell(0, 10, clean_text("Personas"), 0, 1)

                for persona in data["personas"]:
                    # Persona header
                    pdf.set_font("Arial", "B", 12)
                    name = persona.get("name", "Unnamed Persona")
                    pdf.cell(0, 10, clean_text(name), 0, 1)

                    # Persona description
                    if persona.get("description") or persona.get("summary"):
                        pdf.set_font("Arial", "I", 10)
                        description = persona.get(
                            "description", persona.get("summary", "")
                        )
                        # Handle case where description is a dict with a value field
                        if isinstance(description, dict) and description.get("value"):
                            description = description["value"]
                        pdf.multi_cell(0, 10, clean_text(description))

                    # Role context
                    if persona.get("role_context"):
                        pdf.set_font("Arial", "B", 10)
                        pdf.cell(0, 10, clean_text("Role Context:"), 0, 1)
                        pdf.set_font("Arial", "", 10)
                        role_context = persona["role_context"]
                        if isinstance(role_context, dict) and role_context.get("value"):
                            role_context = role_context["value"]
                        pdf.multi_cell(0, 10, clean_text(role_context))

                    # Key responsibilities
                    if persona.get("key_responsibilities"):
                        pdf.set_font("Arial", "B", 10)
                        pdf.cell(0, 10, clean_text("Key Responsibilities:"), 0, 1)

                        responsibilities = persona["key_responsibilities"]
                        # Handle case where responsibilities is a dict with a value field
                        if isinstance(responsibilities, dict) and responsibilities.get(
                            "value"
                        ):
                            if isinstance(responsibilities["value"], list):
                                responsibilities = responsibilities["value"]
                            else:
                                responsibilities = str(responsibilities["value"])
                        if isinstance(responsibilities, list):
                            for resp in responsibilities:
                                pdf.set_font("Arial", "", 10)
                                pdf.cell(5, 10, "*", 0, 0)
                                pdf.multi_cell(0, 10, clean_text(resp))
                        else:
                            pdf.set_font("Arial", "", 10)
                            pdf.multi_cell(0, 10, clean_text(responsibilities))

                    # Pain points
                    if persona.get("pain_points"):
                        pdf.set_font("Arial", "B", 10)
                        pdf.cell(0, 10, clean_text("Pain Points:"), 0, 1)

                        pain_points = persona["pain_points"]
                        # Handle case where pain_points is a dict with a value field
                        if isinstance(pain_points, dict) and pain_points.get("value"):
                            if isinstance(pain_points["value"], list):
                                pain_points = pain_points["value"]
                            else:
                                pain_points = str(pain_points["value"])
                        if isinstance(pain_points, list):
                            for point in pain_points:
                                pdf.set_font("Arial", "", 10)
                                pdf.cell(5, 10, "*", 0, 0)
                                pdf.multi_cell(0, 10, clean_text(point))
                        else:
                            pdf.set_font("Arial", "", 10)
                            pdf.multi_cell(0, 10, clean_text(pain_points))

                    pdf.ln(5)

            # Add insights section if available
            if data and (data.get("insights") or data.get("prioritized_insights")):
                pdf.add_page()
                pdf.set_font("Arial", "B", 14)
                pdf.cell(0, 10, clean_text("Key Insights"), 0, 1)

                # Get insights from data
                insights = []
                if data.get("insights"):
                    # Handle case where insights might be a dict with patterns
                    if isinstance(data["insights"], dict) and data["insights"].get(
                        "patterns"
                    ):
                        insights = data["insights"]["patterns"]
                    # Handle case where insights might be a list
                    elif isinstance(data["insights"], list):
                        insights = data["insights"]

                # If no insights found, try prioritized_insights
                if not insights and data.get("prioritized_insights"):
                    insights = data.get("prioritized_insights")

                if insights:
                    for i, insight in enumerate(insights):
                        pdf.set_font("Arial", "", 10)
                        pdf.cell(5, 10, f"{i+1}.", 0, 0)

                        try:
                            if isinstance(insight, dict):
                                # Format insight based on available fields
                                if insight.get("topic") and insight.get("observation"):
                                    # This is a structured insight with topic and observation
                                    pdf.set_font("Arial", "B", 11)
                                    pdf.multi_cell(
                                        0,
                                        10,
                                        str(insight.get("topic", "Untitled Insight")),
                                    )

                                    pdf.set_font("Arial", "", 10)
                                    pdf.multi_cell(
                                        0, 10, str(insight.get("observation", ""))
                                    )

                                    # Add evidence if available
                                    if insight.get("evidence"):
                                        pdf.set_font("Arial", "I", 9)
                                        evidence = insight["evidence"]
                                        if isinstance(evidence, list):
                                            for item in evidence[
                                                :3
                                            ]:  # Limit to 3 evidence items
                                                pdf.cell(5, 10, "*", 0, 0)
                                                pdf.multi_cell(0, 10, clean_text(item))
                                        else:
                                            pdf.multi_cell(0, 10, clean_text(evidence))

                                    # Add recommendation if available
                                    if insight.get("recommendation"):
                                        pdf.set_font("Arial", "B", 10)
                                        pdf.cell(
                                            0, 10, clean_text("Recommendation:"), 0, 1
                                        )
                                        pdf.set_font("Arial", "", 10)
                                        pdf.multi_cell(
                                            0,
                                            10,
                                            clean_text(
                                                insight.get("recommendation", "")
                                            ),
                                        )

                                    # Add priority if available
                                    if insight.get("priority"):
                                        pdf.set_font("Arial", "", 10)
                                        pdf.cell(
                                            0,
                                            10,
                                            f"Priority: {clean_text(insight.get('priority', ''))}",
                                            0,
                                            1,
                                        )
                                # Try to get text field
                                elif insight.get("text"):
                                    pdf.set_font("Arial", "", 10)
                                    pdf.multi_cell(0, 10, clean_text(insight["text"]))
                                # Try to get description field
                                elif insight.get("description"):
                                    pdf.set_font("Arial", "", 10)
                                    pdf.multi_cell(
                                        0, 10, clean_text(insight["description"])
                                    )
                                # If no text or description, convert the whole dict to string
                                else:
                                    pdf.set_font("Arial", "", 10)
                                    pdf.multi_cell(0, 10, clean_text(insight))
                            else:
                                pdf.set_font("Arial", "", 10)
                                pdf.multi_cell(0, 10, clean_text(insight))

                            # Add space between insights
                            pdf.ln(5)
                        except Exception as e:
                            logger.error(f"Error processing insight: {str(e)}")
                            pdf.set_font("Arial", "", 10)
                            pdf.multi_cell(0, 10, "Error processing insight")

            # Get PDF as bytes
            try:
                # For Python 3, we need to encode with latin-1 as per FPDF documentation
                return pdf.output(dest="S").encode("latin-1")
            except Exception as e:
                logger.error(f"Error encoding PDF output: {str(e)}")
                # Try with errors='replace' as a fallback
                try:
                    return pdf.output(dest="S").encode("latin-1", errors="replace")
                except Exception as e:
                    logger.error(f"Error encoding PDF with replace: {str(e)}")
                    # Last resort - try to return something
                    return pdf.output(dest="S")

        except Exception as e:
            logger.error(f"Error generating PDF: {str(e)}")
            raise Exception(f"Failed to generate PDF: {str(e)}")

    def _create_markdown_report(
        self, data: Dict[str, Any], result: AnalysisResult
    ) -> str:
        """
        Create a Markdown report from analysis data

        Args:
            data: Analysis data dictionary
            result: AnalysisResult object

        Returns:
            str: Markdown content
        """
        # Ensure data is a dictionary
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                data = {"error": "Could not parse result data"}
        md = []

        # Title
        md.append("# Design Thinking Analysis Report\n")

        # Add date and file info
        md.append(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  ")
        md.append(f"Analysis ID: {result.result_id}  ")
        md.append(
            f"File: {result.interview_data.filename if result.interview_data else 'N/A'}\n"
        )

        # Add themes section if available
        if data and data.get("themes"):
            md.append("## Themes\n")

            for i, theme in enumerate(data["themes"]):
                # Theme header
                name = theme.get("name", f"Theme {i+1}")
                md.append(f"### {name}\n")

                # Theme definition
                if theme.get("definition"):
                    definition = theme["definition"]
                    if isinstance(definition, dict) and definition.get("value"):
                        definition = definition["value"]
                    md.append(f"*{str(definition)}*\n")

                # Theme frequency
                if theme.get("frequency"):
                    frequency = theme["frequency"]
                    # Handle case where frequency might be a dict
                    if (
                        isinstance(frequency, dict)
                        and frequency.get("value") is not None
                    ):
                        frequency = frequency["value"]
                    # Ensure frequency is a number
                    try:
                        frequency = float(frequency)
                        md.append(f"**Frequency:** {frequency:.2f}\n")
                    except (ValueError, TypeError):
                        # If frequency is not a number, just display it as text
                        md.append(f"**Frequency:** {str(frequency)}\n")

                # Theme sentiment
                if theme.get("sentiment_estimate") is not None:
                    sentiment = theme["sentiment_estimate"]
                    # Handle case where sentiment might be a dict
                    if (
                        isinstance(sentiment, dict)
                        and sentiment.get("value") is not None
                    ):
                        sentiment = sentiment["value"]
                    # Ensure sentiment is a number
                    try:
                        sentiment = float(sentiment)
                        sentiment_text = (
                            "Positive"
                            if sentiment > 0.2
                            else "Negative" if sentiment < -0.2 else "Neutral"
                        )
                        md.append(
                            f"**Sentiment:** {sentiment_text} ({sentiment:.2f})\n"
                        )
                    except (ValueError, TypeError):
                        # If sentiment is not a number, just display it as text
                        md.append(f"**Sentiment:** {str(sentiment)}\n")

                # Example quotes
                if theme.get("example_quotes") or theme.get("statements"):
                    quotes = theme.get("example_quotes", theme.get("statements", []))
                    # Handle case where quotes might be a dict
                    if isinstance(quotes, dict) and quotes.get("value"):
                        quotes = quotes["value"]
                    if not isinstance(quotes, list):
                        quotes = [str(quotes)]
                    if quotes:
                        md.append("**Example Quotes:**\n")

                        for quote in quotes[:5]:  # Limit to 5 quotes
                            md.append(f"- {quote}\n")

                md.append("\n")

        # Add personas section if available
        if data and data.get("personas"):
            md.append("## Personas\n")

            for persona in data["personas"]:
                # Persona header
                name = persona.get("name", "Unnamed Persona")
                md.append(f"### {name}\n")

                # Persona description
                if persona.get("description") or persona.get("summary"):
                    description = persona.get("description", persona.get("summary", ""))
                    if isinstance(description, dict) and description.get("value"):
                        description = description["value"]
                    md.append(f"*{str(description)}*\n")

                # Role context
                if persona.get("role_context"):
                    md.append("**Role Context:**\n")
                    role_context = persona["role_context"]
                    if isinstance(role_context, dict) and role_context.get("value"):
                        role_context = role_context["value"]
                    md.append(f"{str(role_context)}\n\n")

                # Key responsibilities
                if persona.get("key_responsibilities"):
                    md.append("**Key Responsibilities:**\n")

                    responsibilities = persona["key_responsibilities"]
                    # Handle case where responsibilities is a dict with a value field
                    if isinstance(responsibilities, dict) and responsibilities.get(
                        "value"
                    ):
                        if isinstance(responsibilities["value"], list):
                            responsibilities = responsibilities["value"]
                        else:
                            responsibilities = str(responsibilities["value"])
                    if isinstance(responsibilities, list):
                        for resp in responsibilities:
                            md.append(f"- {resp}\n")
                    else:
                        md.append(f"{responsibilities}\n")

                    md.append("\n")

                # Pain points
                if persona.get("pain_points"):
                    md.append("**Pain Points:**\n")

                    pain_points = persona["pain_points"]
                    # Handle case where pain_points is a dict with a value field
                    if isinstance(pain_points, dict) and pain_points.get("value"):
                        if isinstance(pain_points["value"], list):
                            pain_points = pain_points["value"]
                        else:
                            pain_points = str(pain_points["value"])
                    if isinstance(pain_points, list):
                        for point in pain_points:
                            md.append(f"- {point}\n")
                    else:
                        md.append(f"{pain_points}\n")

                    md.append("\n")

        # Add insights section if available
        if data and (data.get("insights") or data.get("prioritized_insights")):
            md.append("## Key Insights\n")

            # Get insights from data
            insights = []
            if data.get("insights"):
                # Handle case where insights might be a dict with patterns
                if isinstance(data["insights"], dict) and data["insights"].get(
                    "patterns"
                ):
                    insights = data["insights"]["patterns"]
                # Handle case where insights might be a list
                elif isinstance(data["insights"], list):
                    insights = data["insights"]

            # If no insights found, try prioritized_insights
            if not insights and data.get("prioritized_insights"):
                insights = data.get("prioritized_insights")

            if insights:
                for i, insight in enumerate(insights):
                    try:
                        if isinstance(insight, dict):
                            # Format insight based on available fields
                            if insight.get("topic") and insight.get("observation"):
                                # This is a structured insight with topic and observation
                                md.append(
                                    f"### {i+1}. {str(insight.get('topic', 'Untitled Insight'))}\n"
                                )
                                md.append(
                                    f"**Observation:** {str(insight.get('observation', ''))}\n"
                                )

                                # Add evidence if available
                                if insight.get("evidence"):
                                    md.append("**Evidence:**\n")
                                    evidence = insight["evidence"]
                                    if isinstance(evidence, list):
                                        for (
                                            item
                                        ) in (
                                            evidence
                                        ):  # Include all evidence items in Markdown
                                            md.append(f"- {str(item)}\n")
                                    else:
                                        md.append(f"{str(evidence)}\n")
                                    md.append("\n")

                                # Add implication if available
                                if insight.get("implication"):
                                    md.append(
                                        f"**Implication:** {str(insight.get('implication', ''))}\n\n"
                                    )

                                # Add recommendation if available
                                if insight.get("recommendation"):
                                    md.append(
                                        f"**Recommendation:** {str(insight.get('recommendation', ''))}\n\n"
                                    )

                                # Add priority if available
                                if insight.get("priority"):
                                    md.append(
                                        f"**Priority:** {str(insight.get('priority', ''))}\n\n"
                                    )
                            # Try to get text field
                            elif insight.get("text"):
                                md.append(f"{i+1}. {str(insight['text'])}\n\n")
                            # Try to get description field
                            elif insight.get("description"):
                                md.append(f"{i+1}. {str(insight['description'])}\n\n")
                            # If no text or description, convert the whole dict to string
                            else:
                                md.append(f"{i+1}. {str(insight)}\n\n")
                        else:
                            md.append(f"{i+1}. {str(insight)}\n\n")
                    except Exception as e:
                        logger.error(f"Error processing insight: {str(e)}")
                        md.append(f"{i+1}. Error processing insight\n\n")

        return "\n".join(md)
