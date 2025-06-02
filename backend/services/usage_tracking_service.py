"""
Usage Tracking Service for monitoring and enforcing subscription limits.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
import logging

# Setup logging
logger = logging.getLogger(__name__)

# Import models
try:
    from backend.models import User
except ImportError:
    logger.warning("Could not import User model. This is expected during initial setup.")
    # Create a placeholder for development/testing
    class User:
        pass

# Import Clerk service
try:
    from backend.services.external.clerk_service import ClerkService
except ImportError:
    logger.warning("Could not import ClerkService. This is expected during initial setup.")
    # Create a placeholder for development/testing
    class ClerkService:
        async def update_user_metadata(self, user_id: str, metadata: Dict[str, Any]) -> bool:
            logger.warning(f"Mock ClerkService.update_user_metadata called with {user_id}, {metadata}")
            return True


class UsageTrackingService:
    """
    Service for tracking and enforcing usage limits based on subscription tiers.

    This service provides methods for:
    - Tracking analysis and PRD generation usage
    - Checking subscription limits
    - Determining if operations can be performed based on usage and limits
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the usage tracking service.

        Args:
            db: SQLAlchemy database session
            user: User model instance
        """
        self.db = db
        self.user = user
        self.CLERK_...=***REMOVED***

        # Ensure user has proper usage_data structure
        self._ensure_usage_data_initialized()

    def _ensure_usage_data_initialized(self):
        """
        Ensure the user has proper usage_data structure initialized.
        This helps with users created before the proper initialization was added.
        """
        try:
            # Initialize usage_data if not exists or invalid
            if not self.user.usage_data or not isinstance(self.user.usage_data, dict):
                self.user.usage_data = {
                    "subscription": {
                        "tier": "free",
                        "status": "active"
                    },
                    "usage": {}
                }
                self.db.commit()
                logger.info(f"Initialized usage_data for user {self.user.user_id}")

            # Ensure subscription section exists
            elif "subscription" not in self.user.usage_data:
                self.user.usage_data["subscription"] = {
                    "tier": "free",
                    "status": "active"
                }
                self.db.commit()
                logger.info(f"Added subscription section to usage_data for user {self.user.user_id}")

            # Ensure usage section exists
            elif "usage" not in self.user.usage_data:
                self.user.usage_data["usage"] = {}
                self.db.commit()
                logger.info(f"Added usage section to usage_data for user {self.user.user_id}")

        except Exception as e:
            logger.error(f"Error initializing usage_data for user {self.user.user_id}: {str(e)}")
            # Don't fail the entire service if this fails
            pass

    async def get_current_month_usage(self) -> Dict[str, int]:
        """
        Get the current month's usage statistics.

        Returns:
            Dict with analyses_count and prd_generations_count
        """
        current_month = datetime.now().strftime("%Y-%m")

        # Check if usage_data exists
        if not self.user.usage_data:
            return {"analyses_count": 0, "prd_generations_count": 0}

        # Ensure usage_data is a dictionary
        if not isinstance(self.user.usage_data, dict):
            logger.warning(f"User {self.user.user_id} has invalid usage_data type: {type(self.user.usage_data)}. Returning zero usage.")
            return {"analyses_count": 0, "prd_generations_count": 0}

        # Check if usage key exists
        if "usage" not in self.user.usage_data:
            return {"analyses_count": 0, "prd_generations_count": 0}

        # Check if current month exists in usage data
        if current_month not in self.user.usage_data["usage"]:
            return {"analyses_count": 0, "prd_generations_count": 0}

        # Get usage counts with safe defaults
        try:
            return {
                "analyses_count": self.user.usage_data["usage"][current_month].get("analyses_count", 0),
                "prd_generations_count": self.user.usage_data["usage"][current_month].get("prd_generations_count", 0)
            }
        except Exception as e:
            logger.error(f"Error getting usage data: {str(e)}")
            return {"analyses_count": 0, "prd_generations_count": 0}

    async def get_subscription_limits(self) -> Dict[str, int]:
        """
        Get the usage limits based on the user's subscription tier.

        Returns:
            Dict with analyses_per_month and prd_generations_per_month limits
        """
        # Default to free tier limits (unlimited for self-hosted)
        limits = {
            "analyses_per_month": 0,  # 0 means unlimited
            "prd_generations_per_month": 0,  # 0 means unlimited
        }

        try:
            # Check if usage_data exists and is a dictionary
            if not self.user.usage_data or not isinstance(self.user.usage_data, dict):
                logger.warning(f"User {self.user.user_id} has invalid or missing usage_data. Using default limits.")
                return limits

            # Get subscription info
            subscription_info = self.user.usage_data.get("subscription", {})
            if not isinstance(subscription_info, dict):
                logger.warning(f"User {self.user.user_id} has invalid subscription_info type: {type(subscription_info)}. Using default limits.")
                return limits

            tier = subscription_info.get("tier", "free")

            # Set limits based on tier
            if tier == "starter":
                limits["analyses_per_month"] = 20
                limits["prd_generations_per_month"] = 2
            elif tier == "pro":
                limits["analyses_per_month"] = 100
                limits["prd_generations_per_month"] = 100
            elif tier == "enterprise":
                # Enterprise limits are customized, get from subscription info
                limits["analyses_per_month"] = subscription_info.get("analyses_limit", 1000)
                limits["prd_generations_per_month"] = subscription_info.get("prd_limit", 1000)

            return limits
        except Exception as e:
            logger.error(f"Error getting subscription limits: {str(e)}")
            return limits

    async def can_perform_analysis(self) -> bool:
        """
        Check if the user can perform an analysis based on their subscription and usage.

        Returns:
            True if the user can perform an analysis, False otherwise
        """
        # Get current usage
        current_usage = await self.get_current_month_usage()

        # Get subscription limits
        limits = await self.get_subscription_limits()

        # If self-hosted (limits are 0), allow unlimited
        if limits["analyses_per_month"] == 0:
            return True

        # Check if quota exceeded
        return current_usage["analyses_count"] < limits["analyses_per_month"]

    async def can_generate_prd(self) -> bool:
        """
        Check if the user can generate a PRD based on their subscription and usage.

        Returns:
            True if the user can generate a PRD, False otherwise
        """
        # Get current usage
        current_usage = await self.get_current_month_usage()

        # Get subscription limits
        limits = await self.get_subscription_limits()

        # If self-hosted (limits are 0), allow unlimited
        if limits["prd_generations_per_month"] == 0:
            return True

        # Check if quota exceeded
        return current_usage["prd_generations_count"] < limits["prd_generations_per_month"]

    async def track_analysis(self, analysis_id: int) -> int:
        """
        Track a new analysis for the current user.

        Args:
            analysis_id: ID of the analysis to track

        Returns:
            Current analysis count for the month
        """
        try:
            # Initialize usage_data if not exists
            if not self.user.usage_data:
                self.user.usage_data = {}

            # Ensure usage_data is a dictionary
            if not isinstance(self.user.usage_data, dict):
                logger.warning(f"User {self.user.user_id} has invalid usage_data type: {type(self.user.usage_data)}. Resetting to empty dict.")
                self.user.usage_data = {}

            # Get current month and year for tracking
            current_month = datetime.now().strftime("%Y-%m")

            # Initialize usage tracking if not exists
            if "usage" not in self.user.usage_data:
                self.user.usage_data["usage"] = {}

            if current_month not in self.user.usage_data["usage"]:
                self.user.usage_data["usage"][current_month] = {
                    "analyses_count": 0,
                    "prd_generations_count": 0,
                    "analyses": [],
                    "prd_generations": []
                }

            # Increment analysis count and add to list
            self.user.usage_data["usage"][current_month]["analyses_count"] += 1
            self.user.usage_data["usage"][current_month]["analyses"].append({
                "analysis_id": analysis_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Update user in database
            self.db.commit()

            # Update Clerk metadata with current usage
            try:
                # Check if CLERK_SECRET_KEY is configured
                if not self.clerk_service.clerk_secret:
                    logger.warning("Skipping Clerk metadata update: CLERK_SECRET_KEY not configured")
                else:
                    # Create a simplified usage object for Clerk
                    usage_data = {
                        "analyses_count": self.user.usage_data["usage"][current_month]["analyses_count"],
                        "prd_generations_count": self.user.usage_data["usage"][current_month]["prd_generations_count"]
                    }

                    # Update Clerk metadata
                    await self.clerk_service.update_user_metadata(self.user.user_id, {
                        "publicMetadata": {
                            "usage": usage_data
                        }
                    })
            except Exception as clerk_error:
                logger.warning(f"Error updating Clerk metadata: {str(clerk_error)}")
                # Continue even if Clerk update fails

            logger.info(f"Tracked analysis {analysis_id} for user {self.user.user_id}")
            return self.user.usage_data["usage"][current_month]["analyses_count"]

        except Exception as e:
            logger.error(f"Error tracking analysis: {str(e)}")
            try:
                self.db.rollback()
            except Exception as rollback_error:
                logger.error(f"Error during rollback: {str(rollback_error)}")

            # Return current count or 0 if we can't determine it
            try:
                return self.user.usage_data["usage"][current_month]["analyses_count"]
            except:
                return 0

    async def track_prd_generation(self, result_id: int) -> int:
        """
        Track a new PRD generation for the current user.

        Args:
            result_id: ID of the PRD result to track

        Returns:
            Current PRD generation count for the month
        """
        try:
            # Initialize usage_data if not exists
            if not self.user.usage_data:
                self.user.usage_data = {}

            # Ensure usage_data is a dictionary
            if not isinstance(self.user.usage_data, dict):
                logger.warning(f"User {self.user.user_id} has invalid usage_data type: {type(self.user.usage_data)}. Resetting to empty dict.")
                self.user.usage_data = {}

            # Get current month and year for tracking
            current_month = datetime.now().strftime("%Y-%m")

            # Initialize usage tracking if not exists
            if "usage" not in self.user.usage_data:
                self.user.usage_data["usage"] = {}

            if current_month not in self.user.usage_data["usage"]:
                self.user.usage_data["usage"][current_month] = {
                    "analyses_count": 0,
                    "prd_generations_count": 0,
                    "analyses": [],
                    "prd_generations": []
                }

            # Increment PRD generation count and add to list
            self.user.usage_data["usage"][current_month]["prd_generations_count"] += 1
            self.user.usage_data["usage"][current_month]["prd_generations"].append({
                "result_id": result_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Update user in database
            self.db.commit()

            # Update Clerk metadata with current usage
            try:
                # Check if CLERK_SECRET_KEY is configured
                if not self.clerk_service.clerk_secret:
                    logger.warning("Skipping Clerk metadata update: CLERK_SECRET_KEY not configured")
                else:
                    # Create a simplified usage object for Clerk
                    usage_data = {
                        "analyses_count": self.user.usage_data["usage"][current_month]["analyses_count"],
                        "prd_generations_count": self.user.usage_data["usage"][current_month]["prd_generations_count"]
                    }

                    # Update Clerk metadata
                    await self.clerk_service.update_user_metadata(self.user.user_id, {
                        "publicMetadata": {
                            "usage": usage_data
                        }
                    })
            except Exception as clerk_error:
                logger.warning(f"Error updating Clerk metadata: {str(clerk_error)}")
                # Continue even if Clerk update fails

            logger.info(f"Tracked PRD generation {result_id} for user {self.user.user_id}")
            return self.user.usage_data["usage"][current_month]["prd_generations_count"]

        except Exception as e:
            logger.error(f"Error tracking PRD generation: {str(e)}")
            try:
                self.db.rollback()
            except Exception as rollback_error:
                logger.error(f"Error during rollback: {str(rollback_error)}")

            # Return current count or 0 if we can't determine it
            try:
                return self.user.usage_data["usage"][current_month]["prd_generations_count"]
            except:
                return 0
