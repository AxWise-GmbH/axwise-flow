import { describe, expect, it } from 'vitest';
import { constantTimeSecretEqual, serviceRequestAuthError } from './service-auth.js';

function request({ method = 'GET', token } = {}) {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

describe('serviceRequestAuthError', () => {
  it('fails closed when no service secret is configured', () => {
    expect(serviceRequestAuthError(request(), { env: {} })).toEqual({
      status: 401,
      message: 'Unauthorized',
    });
  });

  it.each(['CRON_SECRET', 'WORKER_SECRET', 'BACKUP_SECRET'])(
    'accepts a configured %s bearer',
    (name) => {
      const env = { [name]: `${name.toLowerCase()}-value` };
      expect(serviceRequestAuthError(request({ token: env[name] }), { env })).toBeNull();
    }
  );

  it('rejects user-style and incorrect bearer tokens', () => {
    const env = {
      CRON_SECRET: 'correct-secret',
      WORKER_SECRET: 'second-secret',
    };

    expect(serviceRequestAuthError(request({ token: 'signed-user-jwt' }), { env })).toEqual({
      status: 401,
      message: 'Unauthorized',
    });
    expect(serviceRequestAuthError(request({ token: 'incorrect-secre' }), { env })).toEqual({
      status: 401,
      message: 'Unauthorized',
    });
  });

  it('rejects unsupported methods before considering the token', () => {
    expect(
      serviceRequestAuthError(request({ method: 'DELETE', token: 'cron' }), {
        env: { CRON_SECRET: 'cron' },
      })
    ).toEqual({ status: 405, message: 'Method not allowed' });
  });
});

describe('constantTimeSecretEqual', () => {
  it('compares both equal- and different-length values exactly', () => {
    expect(constantTimeSecretEqual('same-value', 'same-value')).toBe(true);
    expect(constantTimeSecretEqual('same-length', 'wrong-value')).toBe(false);
    expect(constantTimeSecretEqual('short', 'a-longer-secret')).toBe(false);
  });
});
