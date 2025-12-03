/**
 * Authentication-related methods for the API client (Clerk removed)
 */

import { apiCore } from "./core";

const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || "dev_test_token_";

export async function getAuthToken(): Promise<string | null> {
  // No Clerk: always return a development token
  return DEV_TOKEN;
}

export function setAuthToken(token: string): void {
  if (!token) return;
  apiCore.setHeader("Authorization", `Bearer ${token}`);
}

export function clearAuthToken(): void {
  apiCore.removeHeader("Authorization");
}

export async function initializeAuth(): Promise<void> {
  setAuthToken(DEV_TOKEN);
}
