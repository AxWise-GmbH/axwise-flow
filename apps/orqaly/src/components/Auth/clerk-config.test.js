import { describe, expect, it } from 'vitest';
import { clerkBrowserOptionsFromEnvironment } from './clerk-config.js';

const preview = {
  VITE_CLERK_ENVIRONMENT: 'preview',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  VITE_ORQALY_API_ENVIRONMENT: 'preview',
  VITE_ORQALY_API_URL: 'https://preview-api.example.com',
};
const production = {
  ...preview,
  VITE_CLERK_ENVIRONMENT: 'production',
  VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
  VITE_ORQALY_API_ENVIRONMENT: 'production',
  VITE_ORQALY_API_URL: 'https://api.example.com',
};

describe('explicit browser Clerk environment', () => {
  it('retains existing builds without declaring a new environment', () => {
    expect(clerkBrowserOptionsFromEnvironment({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' }))
      .toEqual({ publishableKey: 'pk_test_fixture' });
    expect(() => clerkBrowserOptionsFromEnvironment({})).toThrow(/required/);
  });
  it.each([preview, production])('accepts a single matching identity/API environment', (environment) => {
    expect(clerkBrowserOptionsFromEnvironment(environment))
      .toEqual({ publishableKey: environment.VITE_CLERK_PUBLISHABLE_KEY });
  });
  it.each([
    { ...preview, VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_wrong' },
    { ...production, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_wrong' },
    { ...production, VITE_CLERK_ENVIRONMENT: 'prod' },
    { ...production, VITE_ORQALY_API_ENVIRONMENT: 'preview' },
    { ...production, VITE_ORQALY_API_ENVIRONMENT: undefined },
    { ...production, VITE_ORQALY_API_URL: 'http://api.example.com' },
    { ...production, VITE_ORQALY_API_URL: 'https://api.example.com/path' },
    { ...production, VITE_ORQALY_API_URL: 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app' },
  ])('fails closed on mismatched or partial declared configuration', (environment) => {
    expect(() => clerkBrowserOptionsFromEnvironment(environment)).toThrow();
  });
});
