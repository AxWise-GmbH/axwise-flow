/**
 * Subscription API client functions
 *
 * This module provides functions for interacting with Stripe subscription endpoints.
 */

import { apiCore } from './core';
import { getAuthToken } from './auth';

export interface CreateCheckoutSessionRequest {
  price_id: string;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface CreateBillingPortalSessionResponse {
  url: string;
}

export interface StartTrialResponse {
  success: boolean;
  subscription_id: string;
  status: string;
  trial_end: number;
}

export interface SubscriptionInfo {
  subscription_id?: string;
  subscription_status?: string;
  subscription_tier?: string;
  trial_end?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  usage_data?: {
    analyses_used?: number;
    analyses_limit?: number;
    prd_generations_used?: number;
    prd_generations_limit?: number;
  };
}

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession(
  priceId: string
): Promise<CreateCheckoutSessionResponse> {
  // Ensure auth token is set
  const token = await getAuthToken();
  if (token) {
    apiCore.setHeader('Authorization', `Bearer ${token}`);
  }

  const response = await apiCore.getClient().post<CreateCheckoutSessionResponse>(
    '/api/subscription/create-checkout-session',
    { price_id: priceId }
  );

  return response.data;
}

/**
 * Create a Stripe billing portal session for managing subscription
 */
export async function createBillingPortalSession(): Promise<CreateBillingPortalSessionResponse> {
  // Ensure auth token is set
  const token = await getAuthToken();
  if (token) {
    apiCore.setHeader('Authorization', `Bearer ${token}`);
  }

  const response = await apiCore.getClient().post<CreateBillingPortalSessionResponse>(
    '/api/subscription/create-billing-portal-session',
    {}
  );

  return response.data;
}

/**
 * Start a 7-day free trial for the Pro tier
 */
export async function startTrial(): Promise<StartTrialResponse> {
  // Ensure auth token is set
  const token = await getAuthToken();
  if (token) {
    apiCore.setHeader('Authorization', `Bearer ${token}`);
  }

  const response = await apiCore.getClient().post<StartTrialResponse>(
    '/api/subscription/start-trial',
    {}
  );

  return response.data;
}

/**
 * Get current user's subscription information
 */
export async function getSubscriptionInfo(): Promise<SubscriptionInfo> {
  // Ensure auth token is set
  const token = await getAuthToken();
  if (token) {
    apiCore.setHeader('Authorization', `Bearer ${token}`);
  }

  const response = await apiCore.getClient().get<SubscriptionInfo>(
    '/api/subscription/info'
  );

  return response.data;
}

/**
 * Cancel subscription at the end of the current period
 */
export async function cancelSubscription(): Promise<{ success: boolean }> {
  // Ensure auth token is set
  const token = await getAuthToken();
  if (token) {
    apiCore.setHeader('Authorization', `Bearer ${token}`);
  }

  const response = await apiCore.getClient().post<{ success: boolean }>(
    '/api/subscription/cancel',
    {}
  );

  return response.data;
}

/**
 * Reactivate a cancelled subscription
 */
export async function reactivateSubscription(): Promise<{ success: boolean }> {
  // Ensure auth token is set
  const token = await getAuthToken();
  if (token) {
    apiCore.setHeader('Authorization', `Bearer ${token}`);
  }

  const response = await apiCore.getClient().post<{ success: boolean }>(
    '/api/subscription/reactivate',
    {}
  );

  return response.data;
}

/**
 * Redirect to Stripe checkout
 * This function creates a checkout session and redirects the user to Stripe
 */
export async function redirectToCheckout(priceId: string): Promise<void> {
  try {
    const { url } = await createCheckoutSession(priceId);

    // Redirect to Stripe checkout
    window.location.href = url;
  } catch (error) {
    console.error('Error redirecting to checkout:', error);
    throw error;
  }
}

/**
 * Redirect to billing portal
 * This function creates a billing portal session and redirects the user
 */
export async function redirectToBillingPortal(): Promise<void> {
  try {
    const { url } = await createBillingPortalSession();

    // Redirect to Stripe billing portal
    window.location.href = url;
  } catch (error) {
    console.error('Error redirecting to billing portal:', error);
    throw error;
  }
}
