"""
Stripe Service for handling payment processing and subscription management.
"""
import os
import stripe
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
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


class StripeService:
    """
    Service for handling Stripe payment processing and subscription management.

    This service provides methods for:
    - Creating and managing customers
    - Creating and managing subscriptions
    - Creating checkout sessions
    - Creating billing portal sessions
    - Starting free trials
    """

    def __init__(self, db: Session, user: Optional[User] = None):
        """
        Initialize the Stripe service.

        Args:
            db: SQLAlchemy database session
            user: User model instance (optional)
        """
        logger.info("StripeService.__init__ starting...")
        self.db = db
        self.user = user
        logger.info(f"StripeService.__init__ - db: {type(db)}, user: {type(user) if user else None}")

        # Configure Stripe API key
        logger.info("StripeService.__init__ - Getting STRIPE_SECRET_KEY...")
        api_key = os.getenv("STRIPE_SECRET_KEY")
        if not api_key:
            logger.warning("STRIPE_SECRET_KEY not configured")
            raise ValueError("STRIPE_SECRET_KEY not configured. Please set this environment variable.")

        # Set the API key globally for the stripe module
        logger.info("StripeService.__init__ - Setting Stripe API key...")
        stripe.api_key = api_key

        # Print the first few characters of the API key for debugging
        logger.info(f"Stripe API Key configured: {api_key[:8]}...")

        self.stripe = stripe
        logger.info("StripeService.__init__ - Initializing ClerkService...")
        self.CLERK_...=***REMOVED***
        logger.info("StripeService.__init__ completed successfully!")

    async def get_or_create_customer(self) -> str:
        """
        Get existing Stripe customer or create a new one.

        Returns:
            str: Stripe customer ID

        Raises:
            ValueError: If user is not provided
        """
        if not self.user:
            raise ValueError("User is required for this operation")

        if self.user.stripe_customer_id:
            # Check if the customer exists in the current mode (test or live)
            try:
                # Try to retrieve the customer to verify it exists in the current mode
                self.stripe.Customer.retrieve(self.user.stripe_customer_id)
                # If no exception, customer exists in current mode
                return self.user.stripe_customer_id
            except Exception as e:
                logger.warning(f"Customer {self.user.stripe_customer_id} not found in current mode: {str(e)}")
                # Customer doesn't exist in current mode, create a new one
                # First, clear the existing customer ID
                self.user.stripe_customer_id = None
                self.db.commit()

        # Create new customer
        try:
            customer = self.stripe.Customer.create(
                email=self.user.email,
                name=f"{self.user.first_name or ''} {self.user.last_name or ''}".strip() or self.user.email,
                metadata={"user_id": self.user.user_id}
            )

            # Update user record
            self.user.stripe_customer_id = customer.id
            self.db.commit()

            logger.info(f"Created Stripe customer for user {self.user.user_id}: {customer.id}")
            return customer.id

        except Exception as e:
            logger.error(f"Error creating Stripe customer: {str(e)}")
            self.db.rollback()
            raise

    async def create_checkout_session(self, price_id: str, success_url: str, cancel_url: str) -> Any:
        """
        Create a Stripe checkout session for a subscription.

        Args:
            price_id: Stripe price ID
            success_url: URL to redirect to after successful checkout
            cancel_url: URL to redirect to if checkout is canceled

        Returns:
            Stripe checkout session object

        Raises:
            ValueError: If user is not provided
        """
        if not self.user:
            raise ValueError("User is required for this operation")

        customer_id = await self.get_or_create_customer()

        # Get price details to determine if it's a subscription or one-time
        try:
            price = self.stripe.Price.retrieve(price_id)

            # Create session parameters
            session_params = {
                "customer": customer_id,
                "payment_method_types": ["card"],
                "line_items": [{"price": price_id, "quantity": 1}],
                "mode": "subscription" if price.get("recurring") else "payment",
                "success_url": success_url,
                "cancel_url": cancel_url,
                "metadata": {
                    "user_id": self.user.user_id
                }
            }

            # Create the session
            session = self.stripe.checkout.Session.create(**session_params)

            logger.info(f"Created checkout session for user {self.user.user_id}: {session.id}")
            return session

        except Exception as e:
            logger.error(f"Error creating checkout session: {str(e)}")
            raise

    async def create_subscription(self, price_id: str) -> Any:
        """
        Create a new subscription for the user directly (without checkout).

        Args:
            price_id: Stripe price ID

        Returns:
            Stripe subscription object

        Raises:
            ValueError: If user is not provided
        """
        if not self.user:
            raise ValueError("User is required for this operation")

        customer_id = await self.get_or_create_customer()

        try:
            # Create subscription
            subscription = self.stripe.Subscription.create(
                customer=customer_id,
                items=[{"price": price_id}],
                expand=["latest_invoice.payment_intent"]
            )

            # Update user record
            self.user.subscription_id = subscription.id
            self.user.subscription_status = subscription.status

            # Get product details to determine tier
            price = self.stripe.Price.retrieve(price_id)
            product = self.stripe.Product.retrieve(price.product)
            tier = product.metadata.get("tier", "starter")

            # Initialize usage_data if not exists
            if not self.user.usage_data:
                self.user.usage_data = {}

            # Update usage_data with subscription info
            self.user.usage_data["subscription"] = {
                "tier": tier,
                "status": subscription.status,
                "start_date": subscription.current_period_start,
                "current_period_end": subscription.current_period_end
            }

            # Update Clerk metadata
            await self.clerk_service.update_user_metadata(self.user.user_id, {
                "publicMetadata": {
                    "subscription": {
                        "status": subscription.status,
                        "tier": tier
                    }
                }
            })

            self.db.commit()

            logger.info(f"Created subscription for user {self.user.user_id}: {subscription.id}")
            return subscription

        except Exception as e:
            logger.error(f"Error creating subscription: {str(e)}")
            self.db.rollback()
            raise

    async def cancel_subscription(self, at_period_end: bool = True) -> Any:
        """
        Cancel the user's subscription.

        Args:
            at_period_end: Whether to cancel at the end of the billing period

        Returns:
            Stripe subscription object

        Raises:
            ValueError: If user doesn't have an active subscription
        """
        if not self.user or not self.user.subscription_id:
            raise ValueError("User with active subscription is required")

        try:
            # Cancel the subscription
            subscription = self.stripe.Subscription.modify(
                self.user.subscription_id,
                cancel_at_period_end=at_period_end
            )

            # Update user record if immediate cancellation
            if not at_period_end:
                self.user.subscription_status = "canceled"

                # Update usage_data
                if self.user.usage_data and "subscription" in self.user.usage_data:
                    self.user.usage_data["subscription"]["status"] = "canceled"

                # Update Clerk metadata
                await self.clerk_service.update_user_metadata(self.user.user_id, {
                    "publicMetadata": {
                        "subscription": {
                            "status": "canceled"
                        }
                    }
                })

                self.db.commit()

            logger.info(f"Canceled subscription for user {self.user.user_id}: {subscription.id}")
            return subscription

        except Exception as e:
            logger.error(f"Error canceling subscription: {str(e)}")
            self.db.rollback()
            raise

    async def create_billing_portal_session(self, return_url: str) -> Any:
        """
        Create a billing portal session for the user to manage their subscription.

        Args:
            return_url: URL to return to after managing billing

        Returns:
            Stripe billing portal session object

        Raises:
            ValueError: If user doesn't have a Stripe customer ID
        """
        if not self.user:
            raise ValueError("User is required for this operation")

        # Get or create customer
        try:
            customer_id = await self.get_or_create_customer()
        except Exception as e:
            logger.error(f"Error getting or creating customer: {str(e)}")
            raise ValueError(f"Could not get or create customer: {str(e)}")

        try:
            # Check if the customer has any active subscriptions
            subscriptions = self.stripe.Subscription.list(
                customer=customer_id,
                status="active",
                limit=1
            )

            # If the customer has no active subscriptions, redirect to the pricing page
            if not subscriptions.data:
                logger.warning(f"Customer {customer_id} has no active subscriptions")
                return {
                    "url": f"{return_url}?no_subscription=true"
                }

            # Create the portal session
            try:
                session = self.stripe.billing_portal.Session.create(
                    customer=customer_id,
                    return_url=return_url
                )
                logger.info(f"Created billing portal session for user {self.user.user_id}")
                return session
            except Exception as portal_error:
                # If the portal session creation fails, check if it's because the portal is not configured
                if "No configuration provided" in str(portal_error):
                    logger.warning("Billing portal not configured in Stripe Dashboard")
                    # Return a URL to the Stripe Dashboard to configure the portal
                    return {
                        "url": "https://dashboard.stripe.com/test/settings/billing/portal",
                        "message": "Please configure your billing portal in the Stripe Dashboard first"
                    }
                else:
                    # Re-raise other errors
                    raise

        except Exception as e:
            logger.error(f"Error creating billing portal session: {str(e)}")
            raise

    async def start_trial(self, trial_days: int = 7) -> Any:
        """
        Start a free trial for the user.

        Args:
            trial_days: Number of days for the trial

        Returns:
            Stripe subscription object

        Raises:
            ValueError: If user already has an active subscription
        """
        if not self.user:
            raise ValueError("User is required for this operation")

        # Check if user already has an active subscription
        if self.user.subscription_status in ["active", "trialing"]:
            raise ValueError("User already has an active subscription")

        # Get Pro tier price ID for monthly billing
        price_id = os.getenv("STRIPE_PRICE_PRO_MONTHLY", "price_1RRfiFBLhAWdLBsMevGPCZ7r")

        # Log the price ID for debugging
        logger.info(f"Using price ID for trial: {price_id}")

        # Make sure there are no extra spaces in the price ID
        price_id = price_id.strip()

        try:
            # Get or create customer
            customer_id = await self.get_or_create_customer()

            # Calculate trial end date
            trial_end = int((datetime.now() + timedelta(days=trial_days)).timestamp())

            # Create subscription with trial
            subscription = self.stripe.Subscription.create(
                customer=customer_id,
                items=[{"price": price_id}],
                trial_end=trial_end,
                metadata={"user_id": self.user.user_id}
            )

            # Update user record
            self.user.subscription_id = subscription.id
            self.user.subscription_status = subscription.status

            # Initialize usage_data if not exists
            if not self.user.usage_data:
                self.user.usage_data = {}

            # Update usage_data with subscription info
            try:
                # Convert Unix timestamps to ISO format for better compatibility
                start_date = datetime.fromtimestamp(subscription.current_period_start).isoformat() if hasattr(subscription, 'current_period_start') else None
                end_date = datetime.fromtimestamp(subscription.current_period_end).isoformat() if hasattr(subscription, 'current_period_end') else None
                trial_end_date = datetime.fromtimestamp(trial_end).isoformat()

                self.user.usage_data["subscription"] = {
                    "tier": "pro",  # Trial is for Pro tier
                    "status": subscription.status,
                    "start_date": start_date,
                    "current_period_end": end_date,
                    "trial_end": trial_end_date
                }
            except Exception as e:
                logger.warning(f"Error updating usage_data with subscription info: {str(e)}")
                # Fallback to simpler data structure
                self.user.usage_data["subscription"] = {
                    "tier": "pro",  # Trial is for Pro tier
                    "status": subscription.status,
                    "trial_end": trial_end
                }

            # Update Clerk metadata
            try:
                await self.clerk_service.update_user_metadata(self.user.user_id, {
                    "publicMetadata": {
                        "subscription": {
                            "status": subscription.status,
                            "tier": "pro",
                            "trial": True
                        }
                    }
                })
            except Exception as e:
                logger.warning(f"Error updating Clerk metadata: {str(e)}")

            self.db.commit()

            logger.info(f"Started trial for user {self.user.user_id}: {subscription.id}")
            return subscription

        except Exception as e:
            logger.error(f"Error starting trial: {str(e)}")
            self.db.rollback()
            raise
