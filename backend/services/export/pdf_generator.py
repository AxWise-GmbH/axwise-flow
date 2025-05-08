"""
PDF report generator.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from fpdf import FPDF

from backend.models import AnalysisResult
from backend.services.export.base_generator import BaseReportGenerator

logger = logging.getLogger(__name__)

class PdfReportGenerator(BaseReportGenerator):
    """
    PDF report generator.
    
    This class generates PDF reports for analysis results.
    """
    
    async def generate(self, result_id: int) -> bytes:
        """
        Generate a PDF report for an analysis result.
        
        Args:
            result_id: ID of the analysis result
            
        Returns:
            PDF file content as bytes
        """
        # Get analysis result
        result = self._get_analysis_result(result_id)
        if not result:
            raise ValueError(f"Analysis result {result_id} not found")
        
        # Extract data from result
        data = self._extract_data_from_result(result)
        
        # Generate PDF with error handling
        try:
            return self._create_pdf_report(data, result)
        except Exception as e:
            logger.error(f"Error generating PDF report: {str(e)}")
            # Create a simple error PDF
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Arial", "B", 16)
            pdf.cell(0, 10, self._clean_text("Error Generating Report"), 0, 1, "C")
            
            pdf.set_font("Arial", "", 12)
            pdf.multi_cell(
                0,
                10,
                self._clean_text(f"An error occurred while generating the report: {str(e)}"),
            )
            pdf.multi_cell(
                0,
                10,
                self._clean_text(
                    "Please try again or contact support if the issue persists."
                ),
            )
            # Encode and return the PDF
            return self._encode_pdf_output(pdf)
    
    def _create_pdf_report(self, data: Dict[str, Any], result: AnalysisResult) -> bytes:
        """
        Create a PDF report from analysis data.
        
        Args:
            data: Analysis data dictionary
            result: AnalysisResult object
            
        Returns:
            PDF file content as bytes
        """
        import json
        
        # Ensure data is a dictionary
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                data = {"error": "Could not parse result data"}
        
        try:
            # Initialize PDF
            pdf = FPDF()
            pdf.add_page()
            
            # Title
            pdf.set_font("Arial", "B", 16)
            pdf.cell(0, 10, self._clean_text("Design Thinking Analysis Report"), 0, 1, "C")
            
            # Add date and file info
            pdf.set_font("Arial", "", 10)
            pdf.cell(
                0,
                10,
                self._clean_text(
                    f'Generated on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
                ),
                0,
                1,
            )
            pdf.cell(0, 10, self._clean_text(f"Analysis ID: {result.result_id}"), 0, 1)
            pdf.cell(
                0,
                10,
                self._clean_text(
                    f'File: {result.interview_data.filename if result.interview_data else "N/A"}'
                ),
                0,
                1,
            )
            pdf.ln(5)
            
            # Add sentiment overview if available
            if data and data.get("sentimentOverview"):
                self._add_sentiment_overview(pdf, data["sentimentOverview"])
            
            # Add themes section if available
            if data and data.get("themes"):
                self._add_themes_section(pdf, data["themes"])
            
            # Add patterns section if available
            if data and data.get("patterns"):
                self._add_patterns_section(pdf, data["patterns"])
            
            # Add insights section if available
            if data and data.get("insights"):
                self._add_insights_section(pdf, data["insights"])
            
            # Add personas section if available
            if data and data.get("personas"):
                self._add_personas_section(pdf, data["personas"])
            
            # Encode and return the PDF
            return self._encode_pdf_output(pdf)
            
        except Exception as e:
            logger.error(f"Error creating PDF report: {str(e)}")
            raise
    
    def _add_sentiment_overview(self, pdf: FPDF, sentiment_overview: Dict[str, Any]) -> None:
        """
        Add sentiment overview section to PDF.
        
        Args:
            pdf: FPDF object
            sentiment_overview: Sentiment overview dictionary
        """
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, self._clean_text("Sentiment Overview"), 0, 1)
        
        pdf.set_font("Arial", "", 10)
        
        if isinstance(sentiment_overview, dict):
            # Display positive percentage
            if sentiment_overview.get("positive") is not None:
                try:
                    positive = float(sentiment_overview["positive"]) * 100
                    pdf.cell(0, 10, f"Positive: {positive:.1f}%", 0, 1)
                except (ValueError, TypeError):
                    pdf.cell(
                        0,
                        10,
                        f"Positive: {self._clean_text(str(sentiment_overview['positive']))}",
                        0,
                        1,
                    )
            
            # Display neutral percentage
            if sentiment_overview.get("neutral") is not None:
                try:
                    neutral = float(sentiment_overview["neutral"]) * 100
                    pdf.cell(0, 10, f"Neutral: {neutral:.1f}%", 0, 1)
                except (ValueError, TypeError):
                    pdf.cell(
                        0,
                        10,
                        f"Neutral: {self._clean_text(str(sentiment_overview['neutral']))}",
                        0,
                        1,
                    )
            
            # Display negative percentage
            if sentiment_overview.get("negative") is not None:
                try:
                    negative = float(sentiment_overview["negative"]) * 100
                    pdf.cell(0, 10, f"Negative: {negative:.1f}%", 0, 1)
                except (ValueError, TypeError):
                    pdf.cell(
                        0,
                        10,
                        f"Negative: {self._clean_text(str(sentiment_overview['negative']))}",
                        0,
                        1,
                    )
        
        pdf.ln(5)
    
    def _add_themes_section(self, pdf: FPDF, themes: List[Dict[str, Any]]) -> None:
        """
        Add themes section to PDF.
        
        Args:
            pdf: FPDF object
            themes: List of theme dictionaries
        """
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, self._clean_text("Themes"), 0, 1)
        
        for i, theme in enumerate(themes):
            # Theme header
            pdf.set_font("Arial", "B", 12)
            name = theme.get("name", f"Theme {i+1}")
            pdf.cell(0, 10, self._clean_text(f"{name}"), 0, 1)
            
            # Theme definition
            definition = self._extract_field_value(theme, "definition")
            if definition:
                pdf.set_font("Arial", "I", 10)
                pdf.multi_cell(0, 10, f"Definition: {self._clean_text(definition)}")
            
            # Theme statements
            statements = theme.get("statements", [])
            if statements:
                pdf.set_font("Arial", "", 10)
                pdf.cell(0, 10, self._clean_text("Supporting Statements:"), 0, 1)
                pdf.set_font("Arial", "", 9)
                for statement in statements[:3]:  # Limit to 3 statements
                    pdf.cell(5, 10, "*", 0, 0)
                    pdf.multi_cell(0, 10, self._clean_text(statement))
            
            pdf.ln(5)
    
    def _add_patterns_section(self, pdf: FPDF, patterns: List[Dict[str, Any]]) -> None:
        """
        Add patterns section to PDF.
        
        Args:
            pdf: FPDF object
            patterns: List of pattern dictionaries
        """
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, self._clean_text("Patterns"), 0, 1)
        
        for i, pattern in enumerate(patterns):
            # Pattern header
            pdf.set_font("Arial", "B", 12)
            name = pattern.get("name", f"Pattern {i+1}")
            category = pattern.get("category", "")
            header = name
            if category:
                header = f"{name} ({category})"
            pdf.cell(0, 10, self._clean_text(header), 0, 1)
            
            # Pattern description
            description = pattern.get("description", "")
            if description:
                pdf.set_font("Arial", "", 10)
                pdf.multi_cell(0, 10, self._clean_text(description))
            
            # Pattern evidence
            evidence = pattern.get("evidence", [])
            if evidence:
                pdf.set_font("Arial", "B", 10)
                pdf.cell(0, 10, self._clean_text("Evidence:"), 0, 1)
                pdf.set_font("Arial", "I", 9)
                for item in evidence[:3]:  # Limit to 3 evidence items
                    pdf.cell(5, 10, "*", 0, 0)
                    pdf.multi_cell(0, 10, self._clean_text(item))
            
            pdf.ln(5)
    
    def _add_insights_section(self, pdf: FPDF, insights: List[Dict[str, Any]]) -> None:
        """
        Add insights section to PDF.
        
        Args:
            pdf: FPDF object
            insights: List of insight dictionaries
        """
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, self._clean_text("Insights"), 0, 1)
        
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
                            self._clean_text(str(insight.get("topic", "Untitled Insight"))),
                        )
                        
                        pdf.set_font("Arial", "", 10)
                        pdf.multi_cell(
                            0, 10, self._clean_text(str(insight.get("observation", "")))
                        )
                        
                        # Add evidence if available
                        if insight.get("evidence"):
                            pdf.set_font("Arial", "B", 10)
                            pdf.cell(0, 10, self._clean_text("Evidence:"), 0, 1)
                            pdf.set_font("Arial", "I", 9)
                            evidence = insight["evidence"]
                            if isinstance(evidence, list):
                                for item in evidence[:3]:  # Limit to 3 evidence items
                                    pdf.cell(5, 10, "*", 0, 0)
                                    pdf.multi_cell(0, 10, self._clean_text(item))
                            else:
                                pdf.multi_cell(0, 10, self._clean_text(evidence))
                        
                        # Add implication if available
                        if insight.get("implication"):
                            pdf.set_font("Arial", "B", 10)
                            pdf.cell(0, 10, self._clean_text("Implication:"), 0, 1)
                            pdf.set_font("Arial", "", 10)
                            pdf.multi_cell(
                                0, 10, self._clean_text(str(insight.get("implication", "")))
                            )
                        
                        # Add recommendation if available
                        if insight.get("recommendation"):
                            pdf.set_font("Arial", "B", 10)
                            pdf.cell(0, 10, self._clean_text("Recommendation:"), 0, 1)
                            pdf.set_font("Arial", "", 10)
                            pdf.multi_cell(
                                0,
                                10,
                                self._clean_text(insight.get("recommendation", "")),
                            )
                        
                        # Add priority if available
                        if insight.get("priority"):
                            pdf.set_font("Arial", "B", 10)
                            pdf.cell(0, 10, self._clean_text("Priority:"), 0, 1)
                            pdf.set_font("Arial", "", 10)
                            pdf.cell(
                                0,
                                10,
                                self._clean_text(insight.get("priority", "")),
                                0,
                                1,
                            )
                    # Try to get text field
                    elif insight.get("text"):
                        pdf.set_font("Arial", "", 10)
                        pdf.multi_cell(0, 10, self._clean_text(insight["text"]))
                    # Try to get description field
                    elif insight.get("description"):
                        pdf.set_font("Arial", "", 10)
                        pdf.multi_cell(0, 10, self._clean_text(insight["description"]))
                    # If no text or description, convert the whole dict to string
                    else:
                        pdf.set_font("Arial", "", 10)
                        pdf.multi_cell(0, 10, self._clean_text(str(insight)))
                else:
                    pdf.set_font("Arial", "", 10)
                    pdf.multi_cell(0, 10, self._clean_text(str(insight)))
                
                # Add space between insights
                pdf.ln(5)
            except Exception as e:
                logger.error(f"Error processing insight: {str(e)}")
                pdf.set_font("Arial", "", 10)
                pdf.multi_cell(0, 10, "Error processing insight")
    
    def _add_personas_section(self, pdf: FPDF, personas: List[Dict[str, Any]]) -> None:
        """
        Add personas section to PDF.
        
        Args:
            pdf: FPDF object
            personas: List of persona dictionaries
        """
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, self._clean_text("Personas"), 0, 1)
        
        for i, persona in enumerate(personas):
            # Persona header
            pdf.set_font("Arial", "B", 12)
            name = persona.get("name", f"Persona {i+1}")
            pdf.cell(0, 10, self._clean_text(f"{name}"), 0, 1)
            
            # Persona description
            description = persona.get("description", "")
            if description:
                pdf.set_font("Arial", "I", 10)
                pdf.multi_cell(0, 10, self._clean_text(description))
            
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
                        pdf.set_font("Arial", "B", 10)
                        pdf.cell(0, 10, self._clean_text(f"{label}:"), 0, 1)
                        pdf.set_font("Arial", "", 10)
                        pdf.multi_cell(0, 10, self._clean_text(value))
            
            pdf.ln(5)
    
    def _encode_pdf_output(self, pdf: FPDF) -> bytes:
        """
        Encode PDF output with proper encoding.
        
        Args:
            pdf: FPDF object
            
        Returns:
            Encoded PDF content as bytes
        """
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
