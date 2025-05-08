"""
Base class for report generators.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Union
from sqlalchemy.orm import Session
from backend.models import AnalysisResult, User

class BaseReportGenerator(ABC):
    """
    Base class for report generators.
    
    This abstract class defines the interface for report generators.
    Subclasses should implement the generate method to create reports
    in specific formats.
    """
    
    def __init__(self, db: Session, user: User):
        """
        Initialize the report generator.
        
        Args:
            db: Database session
            user: User object
        """
        self.db = db
        self.user = user
    
    @abstractmethod
    async def generate(self, result_id: int) -> Union[bytes, str]:
        """
        Generate a report for an analysis result.
        
        Args:
            result_id: ID of the analysis result
            
        Returns:
            Report content (bytes for binary formats, str for text formats)
        """
        pass
    
    def _get_analysis_result(self, result_id: int) -> Optional[AnalysisResult]:
        """
        Get analysis result from database.
        
        Args:
            result_id: ID of the analysis result
            
        Returns:
            AnalysisResult object or None if not found
        """
        from backend.models import InterviewData
        
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
    
    def _extract_data_from_result(self, result: AnalysisResult) -> Dict[str, Any]:
        """
        Extract data from analysis result.
        
        Args:
            result: AnalysisResult object
            
        Returns:
            Dictionary containing extracted data
        """
        import json
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            # First try to access the results field directly
            if result.results and isinstance(result.results, dict):
                return result.results
            # If that doesn't work, try to use the result_data property
            elif result.result_data:
                if isinstance(result.result_data, str):
                    return json.loads(result.result_data)
                else:
                    return result.result_data
            else:
                # Fallback to empty dict if no data is available
                return {}
        except Exception as e:
            logger.error(f"Error extracting data from result: {str(e)}")
            return {}
    
    def _extract_field_value(self, data: Dict[str, Any], field: str) -> Any:
        """
        Extract value from a field that might be a nested dictionary with a 'value' key.
        
        Args:
            data: Dictionary containing the field
            field: Field name to extract
            
        Returns:
            Extracted value
        """
        if field not in data:
            return None
        
        value = data[field]
        if isinstance(value, dict) and value.get("value") is not None:
            return value["value"]
        return value
    
    def _clean_text(self, text: Any) -> str:
        """
        Clean text by replacing problematic Unicode characters.
        
        Args:
            text: Text to clean
            
        Returns:
            Cleaned text
        """
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
