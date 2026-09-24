import { describe, expect, it } from 'vitest';
import { validateClerkKeyEnvironment } from './clerk-config.js';
import { clerkMiddlewareOptionsFromEnvironment, createCorsMiddleware } from './http-app.js';

const preview = {
  ORQALY_ENVIRONMENT: 'preview', CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  CLERK_SECRET_KEY: 'sk_test_fixture', ORQALY_BROWSER_ORIGINS: 'https://preview.orqanix.com',
};
const production = {
  ORQALY_ENVIRONMENT: 'production', CLERK_PUBLISHABLE_KEY: 'pk_live_fixture',
  CLERK_SECRET_KEY: 'sk_live_fixture', ORQALY_BROWSER_ORIGINS: 'https://orqanix.com',
};

describe('single-instance Clerk deployment boundary', () => {
  it.each([preview, production])('accepts matching keys and only the explicit browser origins', (environment) => {
    expect(() => validateClerkKeyEnvironment(environment)).not.toThrow();
    expect(clerkMiddlewareOptionsFromEnvironment(environment)).toEqual({
      authorizedParties: [environment.ORQALY_BROWSER_ORIGINS],
    });
  });
  it('preserves existing local entrypoints without a deployment declaration', () => {
    expect(() => validateClerkKeyEnvironment({})).not.toThrow();
  });
  it.each([
    { ...production, CLERK_SECRET_KEY: 'sk_test_wrong' },
    { ...production, CLERK_PUBLISHABLE_KEY: 'pk_test_wrong' },
    { ...preview, CLERK_SECRET_KEY: 'sk_live_wrong' },
    { ...preview, CLERK_PUBLISHABLE_KEY: 'pk_live_wrong' },
    { ...production, CLERK_SECRET_KEY: undefined },
    { ...production, ORQALY_ENVIRONMENT: 'prod' },
    { ...production, ORQALY_BROWSER_ORIGINS: '' },
    { ...production, ORQALY_BROWSER_ORIGINS: '*' },
  ])('fails startup instead of falling back to another identity environment', (environment) => {
    expect(() => clerkMiddlewareOptionsFromEnvironment(environment)).toThrow();
  });
  it('does not infer a production allowlist from preview hostnames during migration', () => {
    expect(clerkMiddlewareOptionsFromEnvironment({
      ...preview, ORQALY_BROWSER_ORIGINS: 'https://preview.orqanix.com,https://orqanix.com',
    }).authorizedParties).toEqual(['https://preview.orqanix.com', 'https://orqanix.com']);
  });
  it('rejects a preview browser at a production API configured only for production', () => {
    const middleware = createCorsMiddleware(clerkMiddlewareOptionsFromEnvironment(production).authorizedParties);
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    middleware({ get: () => 'https://preview.orqanix.com' }, response, () => { throw new Error('must not proceed'); });
    expect(response.statusCode).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_DENIED');
  });
});
