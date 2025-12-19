"""
Dependency injection container.

This module provides a container for dependency injection, making it easy to
create and manage service instances.
"""

import logging
import os
from typing import Callable, Optional, Any

from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.infrastructure.persistence.unit_of_work import UnitOfWork
from backend.services.stakeholder.agent_factory import StakeholderAgentFactory

logger = logging.getLogger(__name__)


class Container:
    """
    Dependency injection container.

    This class provides a container for dependency injection, making it easy to
    create and manage service instances. It acts as a factory for services and
    repositories, ensuring they are properly initialized with their dependencies.
    """

    def __init__(self):
        """
        Initialize the container.
        """
        self._session_factory = SessionLocal
        self._services = {}
        self._current_user = None

    def set_current_user(self, user: Any):
        """
        Set the current user for the container.

        Args:
            user: Current authenticated user
        """
        self._current_user = user

    def get_current_user(self) -> Optional[Any]:
        """
        Get the current user.

        Returns:
            Current authenticated user, or None if not set
        """
        return self._current_user

    def get_session_factory(self) -> Callable[[], Session]:
        """
        Get the session factory.

        Returns:
            Factory function that creates a new SQLAlchemy session
        """
        return self._session_factory

    def get_unit_of_work(self) -> UnitOfWork:
        """
        Get a new Unit of Work instance.

        Returns:
            New Unit of Work instance
        """
        return UnitOfWork(self.get_session_factory())

    def register_service(self, name: str, service_instance: Any):
        """
        Register a service instance with the container.

        Args:
            name: Name to register the service under
            service_instance: Service instance to register
        """
        self._services[name] = service_instance
        logger.debug(f"Registered service: {name}")

    def get_service(self, name: str) -> Any:
        """
        Get a service instance by name.

        Args:
            name: Name of the service to retrieve

        Returns:
            Service instance

        Raises:
            KeyError: If the service is not registered
        """
        if name not in self._services:
            raise KeyError(f"Service not registered: {name}")
        return self._services[name]

    def has_service(self, name: str) -> bool:
        """
        Check if a service is registered.

        Args:
            name: Name of the service to check

        Returns:
            True if the service is registered, False otherwise
        """
        return name in self._services

    # Factory methods for specific services will be added as they are implemented

    def get_interview_service(self):
        """
        Get the interview service.

        Returns:
            Interview service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("Interview service not yet implemented")

    def get_analysis_service(self):
        """
        Get the analysis service.

        Returns:
            Analysis service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("Analysis service not yet implemented")

    def get_persona_service(self):
        """
        Get the persona service.

        Returns:
            Persona service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("Persona service not yet implemented")

    def get_prd_service(self):
        """
        Get the PRD service.

        Returns:
            PRD service instance
        """
        # This will be implemented when the service is created
        raise NotImplementedError("PRD service not yet implemented")

    def get_stakeholder_agent_factory(self) -> StakeholderAgentFactory:
        """Get or create the StakeholderAgentFactory singleton."""
        service_name = "stakeholder_agent_factory"
        if not self.has_service(service_name):
            self.register_service(service_name, StakeholderAgentFactory())
        return self.get_service(service_name)

    def get_llm_service(self, provider: str = "enhanced_gemini"):
        """
        Get or create an LLM service instance.

        Args:
            provider: LLM provider ("enhanced_gemini" default; also supports "gemini", "openai")

        Returns:
            LLM service instance
        """
        service_name = f"llm_service_{provider}"

        if not self.has_service(service_name):
            try:
                from backend.services.llm import LLMServiceFactory

                llm_service = LLMServiceFactory.create(provider)
                self.register_service(service_name, llm_service)
                logger.info(f"Created and registered LLM service: {provider}")
            except Exception as e:
                logger.error(f"Failed to create LLM service {provider}: {e}")
                raise

        return self.get_service(service_name)

    def get_stakeholder_analysis_service(self):
        """
        Get or create the stakeholder analysis service.

        Returns:
            StakeholderAnalysisService instance
        """
        service_name = "stakeholder_analysis_service"

        if not self.has_service(service_name):
            try:
                from backend.services.stakeholder_analysis_service import (
                    StakeholderAnalysisService,
                )
                from backend.services.stakeholder_analysis_v2.facade import (
                    StakeholderAnalysisFacade,
                )

                # Get LLM service dependency (enhanced Gemini by default)
                llm_service = self.get_llm_service("enhanced_gemini")

                use_v2 = os.getenv("STAKEHOLDER_ANALYSIS_V2", "false").lower() in (
                    "1",
                    "true",
                    "yes",
                    "on",
                )
                if use_v2:
                    service_inst = StakeholderAnalysisFacade(llm_service)
                    logger.info(
                        "Using StakeholderAnalysis V2 facade (feature flag enabled)"
                    )
                else:
                    service_inst = StakeholderAnalysisService(llm_service)
                    logger.info(
                        "Using StakeholderAnalysis V1 service (feature flag disabled)"
                    )

                self.register_service(service_name, service_inst)
            except Exception as e:
                logger.error(f"Failed to create stakeholder analysis service: {e}")
                raise

        return self.get_service(service_name)

    def get_persona_formation_service(self):
        """
        Get or create the persona formation service.

        Returns:
            PersonaFormationService instance
        """
        service_name = "persona_formation_service"

        if not self.has_service(service_name):
            try:
                from backend.services.processing.persona_formation_service import (
                    PersonaFormationService,
                )

                # Get LLM service dependency (enhanced Gemini by default)
                llm_service = self.get_llm_service("enhanced_gemini")

                # Create simple config for backward compatibility
                class SimpleConfig:
                    class Validation:
                        min_confidence = 0.3

                    validation = Validation()

                service_inst = PersonaFormationService(SimpleConfig(), llm_service)
                logger.info("Initialized PersonaFormationService (delegates to V2 facade)")

                self.register_service(service_name, service_inst)
            except Exception as e:
                logger.error(f"Failed to create persona formation service: {e}")
                raise

        return self.get_service(service_name)

    def get_results_service(self, service_name: str = "results_service"):
        """
        Get or create the Results service factory.

        Returns:
            Callable[[Session, Any], Any]: A factory that takes (db, user) and returns a service instance
        """
        if not self.has_service(service_name):
            from backend.services.results_service import (
                ResultsService as LegacyResultsService,
            )
            from backend.services.results.facade import ResultsServiceFacade as Facade

            use_v2 = os.getenv("RESULTS_SERVICE_V2", "false").lower() in (
                "1",
                "true",
                "yes",
                "on",
            )

            # Store a factory; ResultsService requires (db, user) per request
            factory = (
                (lambda db, user: Facade(db, user))
                if use_v2
                else (lambda db, user: LegacyResultsService(db, user))
            )

            self.register_service(service_name, factory)
            logger.info(
                "Using ResultsService V2 facade (feature flag enabled)"
                if use_v2
                else "Using ResultsService V1 legacy (feature flag disabled)"
            )
        return self.get_service(service_name)
