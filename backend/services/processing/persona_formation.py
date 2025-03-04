"""
PersonaFormationService proxy module.
This file provides a proxy to the actual PersonaFormationService implementation.
"""

import os
import sys
import logging

logger = logging.getLogger(__name__)

# Make a completely new class that links to the real one
class PersonaFormationService:
    """Proxy class for the actual PersonaFormationService"""
    
    def __init__(self, config, llm_service):
        """Initialize the proxy service by loading the real implementation"""
        # Use dynamic import to avoid circular reference
        import importlib.util
        try:
            # Find the services module path
            project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            services_module_path = os.path.join(project_root, "services", "processing", "persona_formation.py")
            
            # Dynamically load the module
            spec = importlib.util.spec_from_file_location("services_persona_formation", services_module_path)
            services_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(services_module)
            
            # Create the real service
            self._real_service = services_module.PersonaFormationService(config, llm_service)
            logger.info("Successfully loaded real PersonaFormationService")
        except Exception as e:
            logger.error(f"Error loading real PersonaFormationService: {str(e)}")
            raise
    
    async def form_personas(self, patterns, context=None):
        """Forward to real implementation"""
        return await self._real_service.form_personas(patterns, context)
    
    async def generate_persona_from_text(self, text):
        """Forward to real implementation"""
        return await self._real_service.generate_persona_from_text(text)

# Classes to re-export
class Persona:
    """Placeholder for the real Persona class"""
    pass

class PersonaTrait:
    """Placeholder for the real PersonaTrait class"""
    pass

def persona_to_dict(persona):
    """Placeholder for the real persona_to_dict function"""
    return {} 