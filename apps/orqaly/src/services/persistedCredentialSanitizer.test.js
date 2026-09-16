import { describe, expect, it } from 'vitest';

import {
  isPersistedCredentialField,
  stripPersistedCredentials,
} from './persistedCredentialSanitizer';

describe('persisted credential sanitizer', () => {
  it('removes audited credential spellings at any nesting depth', () => {
    const input = {
      id: 'tool-1',
      apiKey: 'api-secret',
      api_key: 'legacy-secret',
      TAVILY_API_KEY: 'provider-shaped-secret',
      webhookSecret: 'hook-secret',
      webhookSigningSecret: 'signing-secret',
      secret: 'generic-webhook-secret',
      nested: {
        apiSecret: 'secondary-secret',
        client_secret: 'oauth-client-secret',
        bearerToken: 'bearer-secret',
        bot_token: 'chat-bot-secret',
        secret_token: 'callback-secret',
        access_token: 'oauth-access',
        refreshToken: 'oauth-refresh',
      },
    };

    expect(stripPersistedCredentials(input)).toEqual({ id: 'tool-1', nested: {} });
  });

  it('preserves non-secret public tool configuration', () => {
    const input = {
      url: 'https://api.example.test',
      apiMethod: 'POST',
      apiHeaders: { 'X-Workspace': 'public-workspace-id' },
      webhookEvents: ['created'],
      credentials: [{ key: 'TAVILY_API_KEY', label: 'Tavily API key' }],
      sdkConfig: { region: 'eu' },
    };

    expect(stripPersistedCredentials(input)).toEqual(input);
  });

  it('does not mutate the caller object', () => {
    const input = { apiKey: 'secret', config: { region: 'eu' } };
    const clean = stripPersistedCredentials(input);
    expect(input.apiKey).toBe('secret');
    expect(clean).not.toBe(input);
    expect(clean.config).not.toBe(input.config);
  });

  it('normalizes camel, snake and kebab credential names', () => {
    expect(isPersistedCredentialField('webhook_secret')).toBe(true);
    expect(isPersistedCredentialField('webhook-secret')).toBe(true);
    expect(isPersistedCredentialField('webhookSecret')).toBe(true);
    expect(isPersistedCredentialField('webhookSigningSecret')).toBe(true);
    expect(isPersistedCredentialField('client_secret')).toBe(true);
    expect(isPersistedCredentialField('aws_secret_key')).toBe(true);
    expect(isPersistedCredentialField('bearer-token')).toBe(true);
    expect(isPersistedCredentialField('bot_token')).toBe(true);
    expect(isPersistedCredentialField('secret_token')).toBe(true);
    expect(isPersistedCredentialField('secret')).toBe(true);
    expect(isPersistedCredentialField('token')).toBe(true);
    expect(isPersistedCredentialField('TAVILY_API_KEY')).toBe(true);
    expect(isPersistedCredentialField('apiHeaders')).toBe(false);
  });
});
