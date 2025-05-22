"""
Request builder for LLM service requests.

This module provides functionality for building requests to LLM services
in a standardized and reusable way.
"""

import logging
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

class RequestBuilder:
    """
    Builder for LLM service requests.
    
    This class provides methods for building requests to LLM services
    in a standardized and reusable way. It handles the construction of
    request parameters based on the task type and content characteristics.
    """
    
    @classmethod
    def build_request(cls, task: str, text: str, prompt: str, 
                     content_info: Optional[Dict[str, Any]] = None, 
                     enforce_json: bool = False,
                     additional_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Build a generic LLM request.
        
        Args:
            task: Type of task (e.g., "transcript_structuring", "theme_analysis")
            text: Text to analyze
            prompt: Prompt to use
            content_info: Optional content type information
            enforce_json: Whether to enforce JSON output
            additional_params: Additional parameters to include in the request
            
        Returns:
            Dictionary with request parameters
        """
        request = {
            "task": task,
            "text": text,
            "prompt": prompt,
            "enforce_json": enforce_json
        }
        
        # Add content info if provided
        if content_info:
            request["content_info"] = content_info
        
        # Add additional parameters if provided
        if additional_params:
            request.update(additional_params)
        
        logger.debug(f"Built request for task: {task}")
        return request
    
    @classmethod
    def build_transcript_request(cls, text: str, prompt: str, 
                                content_info: Optional[Dict[str, Any]] = None,
                                filename: Optional[str] = None) -> Dict[str, Any]:
        """
        Build a request for transcript structuring.
        
        Args:
            text: Raw transcript text
            prompt: Prompt to use
            content_info: Optional content type information
            filename: Optional filename
            
        Returns:
            Dictionary with request parameters
        """
        additional_params = {}
        if filename:
            additional_params["filename"] = filename
        
        # Transcript structuring always enforces JSON output
        return cls.build_request(
            task="transcript_structuring",
            text=text,
            prompt=prompt,
            content_info=content_info,
            enforce_json=True,
            additional_params=additional_params
        )
    
    @classmethod
    def build_theme_analysis_request(cls, text: str, prompt: str, 
                                    content_info: Optional[Dict[str, Any]] = None,
                                    industry: Optional[str] = None) -> Dict[str, Any]:
        """
        Build a request for theme analysis.
        
        Args:
            text: Transcript text
            prompt: Prompt to use
            content_info: Optional content type information
            industry: Optional industry context
            
        Returns:
            Dictionary with request parameters
        """
        additional_params = {}
        if industry:
            additional_params["industry"] = industry
        
        # Theme analysis always enforces JSON output
        return cls.build_request(
            task="theme_analysis",
            text=text,
            prompt=prompt,
            content_info=content_info,
            enforce_json=True,
            additional_params=additional_params
        )
    
    @classmethod
    def build_pattern_recognition_request(cls, text: str, prompt: str, 
                                         themes: List[Dict[str, Any]],
                                         content_info: Optional[Dict[str, Any]] = None,
                                         industry: Optional[str] = None) -> Dict[str, Any]:
        """
        Build a request for pattern recognition.
        
        Args:
            text: Transcript text
            prompt: Prompt to use
            themes: Extracted themes
            content_info: Optional content type information
            industry: Optional industry context
            
        Returns:
            Dictionary with request parameters
        """
        additional_params = {
            "themes": themes
        }
        
        if industry:
            additional_params["industry"] = industry
        
        # Pattern recognition always enforces JSON output
        return cls.build_request(
            task="pattern_recognition",
            text=text,
            prompt=prompt,
            content_info=content_info,
            enforce_json=True,
            additional_params=additional_params
        )
    
    @classmethod
    def build_persona_formation_request(cls, text: str, prompt: str, 
                                       themes: Optional[List[Dict[str, Any]]] = None,
                                       patterns: Optional[List[Dict[str, Any]]] = None,
                                       content_info: Optional[Dict[str, Any]] = None,
                                       industry: Optional[str] = None,
                                       role: Optional[str] = None) -> Dict[str, Any]:
        """
        Build a request for persona formation.
        
        Args:
            text: Transcript text
            prompt: Prompt to use
            themes: Optional extracted themes
            patterns: Optional extracted patterns
            content_info: Optional content type information
            industry: Optional industry context
            role: Optional role for the persona
            
        Returns:
            Dictionary with request parameters
        """
        additional_params = {}
        
        if themes:
            additional_params["themes"] = themes
        
        if patterns:
            additional_params["patterns"] = patterns
        
        if industry:
            additional_params["industry"] = industry
        
        if role:
            additional_params["role"] = role
        
        # Persona formation always enforces JSON output
        return cls.build_request(
            task="persona_formation",
            text=text,
            prompt=prompt,
            content_info=content_info,
            enforce_json=True,
            additional_params=additional_params
        )
