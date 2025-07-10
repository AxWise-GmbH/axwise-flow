"""
Unit of Work pattern implementation.

This module provides an implementation of the Unit of Work pattern for managing
database transactions.
"""

import logging
from typing import Callable, Type
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from backend.infrastructure.persistence.interview_repository import InterviewRepository
from backend.infrastructure.persistence.analysis_repository import AnalysisRepository

logger = logging.getLogger(__name__)


class UnitOfWork:
    """
    Unit of Work implementation.

    This class provides an implementation of the Unit of Work pattern for managing
    database transactions. It creates repositories and manages the transaction
    lifecycle.
    """

    def __init__(self, session_factory: Callable[[], Session]):
        """
        Initialize the Unit of Work.

        Args:
            session_factory: Factory function that creates a new SQLAlchemy session
        """
        self.session_factory = session_factory
        self.session = None

        # Repositories will be initialized in __enter__
        self.interviews = None
        self.analyses = None
        self.personas = None
        self.prds = None

    def __enter__(self):
        """
        Enter the context manager.

        This method is called when entering a 'with' block. It creates a new
        session and initializes the repositories.

        Returns:
            The UnitOfWork instance
        """
        self.session = self.session_factory()

        # Initialize repositories with the session
        self.interviews = InterviewRepository(self.session)
        self.analyses = AnalysisRepository(self.session)
        # TODO: Initialize other repositories

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """
        Exit the context manager.

        This method is called when exiting a 'with' block. It commits the transaction
        if no exception occurred, or rolls it back if an exception occurred.

        Args:
            exc_type: Type of exception that occurred, or None
            exc_val: Exception instance that occurred, or None
            exc_tb: Traceback of exception that occurred, or None
        """
        if exc_type is not None:
            self._rollback_sync()
            logger.error(f"Transaction rolled back due to exception: {exc_val}")
        else:
            try:
                self._commit_sync()
            except Exception as e:
                self._rollback_sync()
                logger.error(f"Transaction rolled back due to commit error: {str(e)}")

        self.session.close()

    async def __aenter__(self):
        """
        Enter the async context manager.

        This method is called when entering an 'async with' block. It creates a new
        session and initializes the repositories.

        Returns:
            The UnitOfWork instance
        """
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """
        Exit the async context manager.

        This method is called when exiting an 'async with' block. It commits the transaction
        if no exception occurred, or rolls it back if an exception occurred.

        Args:
            exc_type: Type of exception that occurred, or None
            exc_val: Exception instance that occurred, or None
            exc_tb: Traceback of exception that occurred, or None
        """
        if exc_type is not None:
            await self.rollback()
            logger.error(f"Transaction rolled back due to exception: {exc_val}")
        else:
            try:
                await self.commit()
            except Exception as e:
                await self.rollback()
                logger.error(f"Transaction rolled back due to commit error: {str(e)}")

        self.session.close()

    async def commit(self):
        """
        Commit the transaction.

        This method commits the current transaction, making all changes permanent.
        """
        try:
            self.session.commit()
            logger.debug("Transaction committed successfully")
        except SQLAlchemyError as e:
            logger.error(f"Error committing transaction: {str(e)}")
            raise

    async def rollback(self):
        """
        Roll back the transaction.

        This method rolls back the current transaction, discarding all changes.
        """
        try:
            self.session.rollback()
            logger.debug("Transaction rolled back")
        except SQLAlchemyError as e:
            logger.error(f"Error rolling back transaction: {str(e)}")
            raise

    def _commit_sync(self):
        """
        Commit the transaction (synchronous helper).

        This method commits the current transaction, making all changes permanent.
        """
        try:
            self.session.commit()
            logger.debug("Transaction committed successfully")
        except SQLAlchemyError as e:
            logger.error(f"Error committing transaction: {str(e)}")
            raise

    def _rollback_sync(self):
        """
        Roll back the transaction (synchronous helper).

        This method rolls back the current transaction, discarding all changes.
        """
        try:
            self.session.rollback()
            logger.debug("Transaction rolled back")
        except SQLAlchemyError as e:
            logger.error(f"Error rolling back transaction: {str(e)}")
            raise

    async def execute_in_transaction(self, func, *args, **kwargs):
        """
        Execute a function within a transaction.

        This method executes the given function within a transaction, committing
        if the function succeeds or rolling back if it raises an exception.

        Args:
            func: Function to execute
            *args: Positional arguments to pass to the function
            **kwargs: Keyword arguments to pass to the function

        Returns:
            The return value of the function
        """
        try:
            result = await func(*args, **kwargs)
            await self.commit()
            return result
        except Exception as e:
            await self.rollback()
            logger.error(f"Transaction rolled back due to error in function: {str(e)}")
            raise
