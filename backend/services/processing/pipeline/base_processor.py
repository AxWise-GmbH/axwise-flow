"""
Base processor implementation.

This module provides a base implementation of the processor interface that can be
extended by concrete processor implementations.
"""

import logging
from typing import Any, Dict, Optional, Type
from abc import ABC, abstractmethod

from backend.infrastructure.api.processor import IProcessor

logger = logging.getLogger(__name__)


class BaseProcessor(IProcessor, ABC):
    """
    Base implementation of the processor interface.

    This class provides a base implementation of the processor interface that can be
    extended by concrete processor implementations. It includes common functionality
    such as logging, error handling, and metadata.
    """

    def __init__(
        self, name: str = None, description: str = None, version: str = "1.0.0"
    ):
        """
        Initialize the processor.

        Args:
            name: Name of the processor (defaults to class name)
            description: Description of the processor
            version: Version of the processor
        """
        self._name = name or self.__class__.__name__
        self._description = description or f"{self._name} processor"
        self._version = version
        self._llm_service = None

        logger.info(f"Initialized {self._name} processor (v{self._version})")

    @property
    def name(self) -> str:
        """
        Get the name of the processor.

        Returns:
            The name of the processor
        """
        return self._name

    @property
    def description(self) -> str:
        """
        Get the description of the processor.

        Returns:
            The description of the processor
        """
        return self._description

    @property
    def version(self) -> str:
        """
        Get the version of the processor.

        Returns:
            The version of the processor
        """
        return self._version

    @property
    def llm_service(self):
        """
        Get the LLM service used by the processor.

        Returns:
            The LLM service
        """
        return self._llm_service

    @llm_service.setter
    def llm_service(self, service):
        """
        Set the LLM service used by the processor.

        Args:
            service: The LLM service to use
        """
        self._llm_service = service

    async def process(self, data: Any, context: Optional[Dict[str, Any]] = None) -> Any:
        """
        Process the input data and return the result.

        This method provides common functionality such as logging, error handling,
        and context management. It delegates the actual processing to the
        _process_impl method, which must be implemented by subclasses.

        Args:
            data: The input data to process
            context: Optional context information for the processing

        Returns:
            The processed data
        """
        if context is None:
            context = {}

        try:
            logger.info(f"Starting {self.name} processing")

            # Check if the processor supports the input type
            if not self.supports_input_type(type(data)):
                logger.warning(
                    f"{self.name} does not support input type {type(data).__name__}"
                )
                # Return the input data unchanged if the processor doesn't support it
                return data

            # Call the implementation-specific processing method
            result = await self._process_impl(data, context)

            logger.info(f"Completed {self.name} processing")
            return result
        except Exception as e:
            logger.error(f"Error in {self.name} processing: {str(e)}", exc_info=True)
            # Re-raise the exception to be handled by the pipeline
            raise

    @abstractmethod
    async def _process_impl(self, data: Any, context: Dict[str, Any]) -> Any:
        """
        Implementation-specific processing method.

        This method must be implemented by subclasses to provide the actual
        processing logic.

        Args:
            data: The input data to process
            context: Context information for the processing

        Returns:
            The processed data
        """
        pass

    def supports_input_type(self, input_type: Type) -> bool:
        """
        Check if the processor supports the given input type.

        Args:
            input_type: The input type to check

        Returns:
            True if the processor supports the input type, False otherwise
        """
        # By default, processors support any input type
        # Subclasses can override this method to provide more specific type checking
        return True

    def get_output_type(self) -> Type:
        """
        Get the output type of the processor.

        Returns:
            The output type of the processor
        """
        # By default, processors return Any
        # Subclasses can override this method to provide more specific type information
        return Any
