"""
Secure Admin Service for AxWise
Handles admin privileges, admin trials, and role-based access control
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from backend.models import User
try:
    from backend.services.external.clerk_service import ClerkService
except Exception:
    # OSS mode: Clerk may be removed; provide a minimal stub
    class ClerkService:
        def get_user(self, user_id: str):
            return None

logger = logging.getLogger(__name__)


class AdminService:
    """Secure admin service with role-based access control"""

    # Secure admin configuration from environment
    ADMIN_EMAILS = os.getenv("ADMIN_EMAILS", "admin@example.com").split(",")
    ADMIN_USER_IDS = os.getenv(
        "ADMIN_USER_IDS", "user_admin_id_placeholder"
    ).split(",")
    ADMIN_TRIAL_DURATION_DAYS = int(os.getenv("ADMIN_TRIAL_DURATION_DAYS", "30"))
    MAX_ADMIN_TRIALS_PER_USER = int(os.getenv("MAX_ADMIN_TRIALS_PER_USER", "1"))

    def __init__(self, db: Session):
        self.db = db
        self.CLERK_...=***REMOVED***

    def is_admin(self, user: User) -> bool:
        """
        Secure admin verification using multiple factors

        Args:
            user: User object to check

        Returns:
            bool: True if user is admin
        """
        # Check by user ID (primary)
        if user.user_id in self.ADMIN_USER_IDS:
            return True

        # Check by email (secondary)
        if user.email in self.ADMIN_EMAILS:
            return True

        # Check Clerk metadata for admin role
        try:
            CLERK_...=***REMOVED***
            if (
                clerk_user
                and clerk_user.get("publicMetadata", {}).get("role") == "admin"
            ):
                return True
        except Exception as e:
            logger.warning(f"Could not verify admin status via Clerk: {e}")

        return False

    def is_admin_trial(self, subscription_id: str) -> bool:
        """
        Check if a subscription ID is an admin trial

        Args:
            subscription_id: Subscription ID to check

        Returns:
            bool: True if it's an admin trial
        """
        return subscription_id and subscription_id.startswith("admin_trial_")

    def is_admin_trial_user(self, user: User) -> bool:
        """
        Determine if a user is on an admin trial using both ID prefix and usage_data flag.
        """
        try:
            if self.is_admin_trial(user.subscription_id):
                return True
            sub_info = (user.usage_data or {}).get("subscription", {})
            return bool(sub_info.get("admin_override"))
        except Exception:
            return False

    def create_admin_trial(
        self, user: User, duration_days: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a secure admin trial with proper validation and audit trail

        Args:
            user: User to create trial for
            duration_days: Trial duration (defaults to ADMIN_TRIAL_DURATION_DAYS)

        Returns:
            Dict with trial details

        Raises:
            ValueError: If user is not admin or already has trial
        """
        # Verify admin status
        if not self.is_admin(user):
            raise ValueError("Admin privileges required to create admin trial")

        # Check if user already has an active subscription
        if user.subscription_status in ["active", "trialing"]:
            # Allow admin override for existing admin trials
            if not self.is_admin_trial(user.subscription_id):
                raise ValueError("User already has an active subscription")

        # Check admin trial limits
        existing_trials = self._count_admin_trials(user)
        if existing_trials >= self.MAX_ADMIN_TRIALS_PER_USER:
            raise ValueError(
                f"Maximum admin trials ({self.MAX_ADMIN_TRIALS_PER_USER}) exceeded"
            )

        # Create trial
        duration = duration_days or self.ADMIN_TRIAL_DURATION_DAYS
        trial_start = datetime.now(timezone.utc)
        trial_end = trial_start + timedelta(days=duration)
        trial_id = f"admin_trial_{int(trial_start.timestamp())}"

        # Update user record
        if not user.usage_data:
            user.usage_data = {}

        user.usage_data["subscription"] = {
            "tier": "pro",
            "status": "trialing",
            "trial_end": trial_end.isoformat(),
            "start_date": trial_start.isoformat(),
            "admin_override": True,
            "created_by": user.user_id,
            "created_at": trial_start.isoformat(),
            "duration_days": duration,
        }

        user.subscription_status = "trialing"
        user.subscription_id = trial_id

        # Mark as modified and commit
        from sqlalchemy.orm.attributes import flag_modified

        flag_modified(user, "usage_data")
        self.db.commit()

        # Log admin action
        logger.info(
            f"Admin trial created: user={user.user_id}, trial_id={trial_id}, duration={duration}d"
        )

        return {
            "trial_id": trial_id,
            "status": "trialing",
            "tier": "pro",
            "trial_end": trial_end.isoformat(),
            "duration_days": duration,
        }

    def validate_admin_trial(self, user: User) -> Dict[str, Any]:
        """
        Validate admin trial without calling Stripe

        Args:
            user: User to validate

        Returns:
            Dict with validation results
        """
        if not self.is_admin_trial(user.subscription_id):
            return {"valid": False, "reason": "Not an admin trial"}

        if not self.is_admin(user):
            return {"valid": False, "reason": "User is not admin"}

        # Check expiration
        if user.usage_data and "subscription" in user.usage_data:
            trial_end_str = user.usage_data["subscription"].get("trial_end")
            if trial_end_str:
                trial_end = datetime.fromisoformat(trial_end_str.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) > trial_end:
                    return {"valid": False, "reason": "Admin trial expired"}

        return {
            "valid": True,
            "tier": "pro",
            "status": "trialing",
            "is_admin_trial": True,
        }

    def _count_admin_trials(self, user: User) -> int:
        """Count existing admin trials for user"""
        # In a production system, you'd query an audit table
        # For now, we'll allow 1 trial per user
        return 1 if self.is_admin_trial(user.subscription_id) else 0

    def revoke_admin_trial(self, user: User) -> bool:
        """
        Revoke an admin trial

        Args:
            user: User whose trial to revoke

        Returns:
            bool: True if revoked successfully
        """
        if not self.is_admin_trial(user.subscription_id):
            return False

        # Reset to free tier
        user.subscription_status = "inactive"
        user.subscription_id = None

        if user.usage_data and "subscription" in user.usage_data:
            user.usage_data["subscription"]["status"] = "canceled"
            user.usage_data["subscription"]["canceled_at"] = datetime.now(
                timezone.utc
            ).isoformat()

            from sqlalchemy.orm.attributes import flag_modified

            flag_modified(user, "usage_data")

        self.db.commit()

        logger.info(f"Admin trial revoked: user={user.user_id}")
        return True
