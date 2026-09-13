import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ user: null, loading: false }));

vi.mock('./AuthContext', () => ({
  useAuth: () => authState,
}));

import { PartnerAccessProvider, usePartnerAccess } from './PartnerAccessContext';

function renderAccess() {
  function CaptureAccess() {
    const access = usePartnerAccess();
    return <output data-testid="access">{JSON.stringify(access)}</output>;
  }

  render(
    <PartnerAccessProvider>
      <CaptureAccess />
    </PartnerAccessProvider>
  );

  return JSON.parse(screen.getByTestId('access').textContent);
}

beforeEach(() => {
  authState.user = null;
  authState.loading = false;
});

describe('personal Clerk partner access compatibility', () => {
  it('keeps access unresolved while Clerk is loading', () => {
    authState.loading = true;
    const access = renderAccess();

    expect(access).toEqual({
      roleId: null,
      linkedPartnerId: null,
      isPartnerRole: false,
      loaded: false,
    });
  });

  it('does not grant a UI role when signed out', () => {
    const access = renderAccess();

    expect(access).toMatchObject({ roleId: null, linkedPartnerId: null, loaded: true });
  });

  it('preserves the owner UI for an authenticated personal Clerk user', () => {
    authState.user = { uid: 'user_personal123' };
    const access = renderAccess();

    expect(access).toEqual({
      roleId: 'role-super-admin',
      linkedPartnerId: null,
      isPartnerRole: false,
      loaded: true,
    });
  });
});
