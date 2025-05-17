"""
Prompt template system with variable substitution.

This module provides a template system for LLM prompts with explicit variable
substitution, versioning, and metadata.
"""

import re
import json
import logging
from typing import Dict, Any, Optional, List, Union, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

class PromptTemplate:
    """
    Template for LLM prompts with variable substitution and versioning.
    """
    
    def __init__(
        self,
        template: str,
        version: str = "1.0.0",
        description: Optional[str] = None,
        required_vars: Optional[List[str]] = None,
        optional_vars: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize a prompt template.
        
        Args:
            template: Template string with {{variable}} placeholders
            version: Version string (semver format)
            description: Description of the template
            required_vars: List of required variables
            optional_vars: Dictionary of optional variables with default values
            metadata: Additional metadata
        """
        self.template = template
        self.version = version
        self.description = description or ""
        self.required_vars = required_vars or []
        self.optional_vars = optional_vars or {}
        self.metadata = metadata or {}
        self.created_at = datetime.now().isoformat()
        
        # Extract all variables from the template
        self.template_vars = self._extract_variables(template)
        
        # Validate that all required variables are in the template
        missing_vars = [var for var in self.required_vars if var not in self.template_vars]
        if missing_vars:
            logger.warning(f"Required variables {missing_vars} not found in template")
    
    def render(self, variables: Dict[str, Any]) -> str:
        """
        Render the template with the provided variables.
        
        Args:
            variables: Dictionary of variables to substitute
            
        Returns:
            Rendered template string
            
        Raises:
            ValueError: If required variables are missing
        """
        # Check for missing required variables
        missing_vars = [var for var in self.required_vars if var not in variables]
        if missing_vars:
            raise ValueError(f"Missing required variables: {missing_vars}")
        
        # Add default values for optional variables
        for var, default in self.optional_vars.items():
            if var not in variables:
                variables[var] = default
        
        # Render the template
        rendered = self.template
        for var, value in variables.items():
            # Handle different types of values
            if isinstance(value, (list, dict)):
                # Convert to JSON string for complex types
                value_str = json.dumps(value, indent=2)
            else:
                value_str = str(value)
            
            # Replace the variable placeholder
            rendered = rendered.replace(f"{{{{{var}}}}}", value_str)
        
        return rendered
    
    def _extract_variables(self, template: str) -> List[str]:
        """
        Extract variable names from the template.
        
        Args:
            template: Template string
            
        Returns:
            List of variable names
        """
        # Find all {{variable}} patterns
        pattern = r'\{\{([^}]+)\}\}'
        return re.findall(pattern, template)
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the template to a dictionary.
        
        Returns:
            Dictionary representation of the template
        """
        return {
            "template": self.template,
            "version": self.version,
            "description": self.description,
            "required_vars": self.required_vars,
            "optional_vars": self.optional_vars,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "template_vars": self.template_vars
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'PromptTemplate':
        """
        Create a template from a dictionary.
        
        Args:
            data: Dictionary representation of the template
            
        Returns:
            PromptTemplate instance
        """
        return cls(
            template=data["template"],
            version=data.get("version", "1.0.0"),
            description=data.get("description"),
            required_vars=data.get("required_vars"),
            optional_vars=data.get("optional_vars"),
            metadata=data.get("metadata")
        )


class PromptTemplateRegistry:
    """
    Registry for prompt templates with versioning support.
    """
    
    def __init__(self):
        """Initialize the registry."""
        self.templates: Dict[str, Dict[str, PromptTemplate]] = {}
    
    def register(
        self,
        name: str,
        template: Union[str, PromptTemplate],
        version: str = "1.0.0",
        description: Optional[str] = None,
        required_vars: Optional[List[str]] = None,
        optional_vars: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> PromptTemplate:
        """
        Register a template.
        
        Args:
            name: Template name
            template: Template string or PromptTemplate instance
            version: Version string (semver format)
            description: Description of the template
            required_vars: List of required variables
            optional_vars: Dictionary of optional variables with default values
            metadata: Additional metadata
            
        Returns:
            Registered PromptTemplate instance
        """
        # Create a PromptTemplate if a string was provided
        if isinstance(template, str):
            template = PromptTemplate(
                template=template,
                version=version,
                description=description,
                required_vars=required_vars,
                optional_vars=optional_vars,
                metadata=metadata
            )
        
        # Initialize the dictionary for this template name if it doesn't exist
        if name not in self.templates:
            self.templates[name] = {}
        
        # Add the template to the registry
        self.templates[name][template.version] = template
        
        logger.info(f"Registered template '{name}' version {template.version}")
        
        return template
    
    def get(self, name: str, version: Optional[str] = None) -> PromptTemplate:
        """
        Get a template from the registry.
        
        Args:
            name: Template name
            version: Version string (semver format). If None, returns the latest version.
            
        Returns:
            PromptTemplate instance
            
        Raises:
            ValueError: If the template or version is not found
        """
        if name not in self.templates:
            raise ValueError(f"Template '{name}' not found in registry")
        
        if version is None:
            # Get the latest version
            version = self._get_latest_version(name)
        
        if version not in self.templates[name]:
            raise ValueError(f"Version {version} of template '{name}' not found")
        
        return self.templates[name][version]
    
    def render(self, name: str, variables: Dict[str, Any], version: Optional[str] = None) -> str:
        """
        Render a template with the provided variables.
        
        Args:
            name: Template name
            variables: Dictionary of variables to substitute
            version: Version string (semver format). If None, uses the latest version.
            
        Returns:
            Rendered template string
            
        Raises:
            ValueError: If the template or version is not found, or if required variables are missing
        """
        template = self.get(name, version)
        return template.render(variables)
    
    def _get_latest_version(self, name: str) -> str:
        """
        Get the latest version of a template.
        
        Args:
            name: Template name
            
        Returns:
            Latest version string
            
        Raises:
            ValueError: If the template has no versions
        """
        if not self.templates[name]:
            raise ValueError(f"Template '{name}' has no versions")
        
        # Simple version comparison (assumes semver format)
        return max(self.templates[name].keys())
    
    def list_templates(self) -> List[Tuple[str, str]]:
        """
        List all templates in the registry.
        
        Returns:
            List of (name, version) tuples
        """
        result = []
        for name, versions in self.templates.items():
            for version in versions:
                result.append((name, version))
        return result
    
    def list_versions(self, name: str) -> List[str]:
        """
        List all versions of a template.
        
        Args:
            name: Template name
            
        Returns:
            List of version strings
            
        Raises:
            ValueError: If the template is not found
        """
        if name not in self.templates:
            raise ValueError(f"Template '{name}' not found in registry")
        
        return list(self.templates[name].keys())


# Global registry instance
registry = PromptTemplateRegistry()
