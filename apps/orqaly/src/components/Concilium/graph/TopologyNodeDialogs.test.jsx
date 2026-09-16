import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// ── Stub the four rich child surfaces so we can drive their save callbacks. ──
vi.mock('../../Organizations/OrgDetailDrawer', () => ({
  default: ({ open, org, onAttachConsilium }) =>
    open ? (
      <div data-testid="org-drawer">
        <span>{org?.name}</span>
        <button onClick={() => onAttachConsilium('b9')}>attach</button>
      </div>
    ) : null,
}));
vi.mock('../BoardForm', () => ({
  default: ({ open, editing, onSave }) =>
    open ? (
      <div data-testid="board-form">
        <span>{editing?.name}</span>
        <button onClick={() => onSave({ name: 'B2', status: 'paused', llms: [] }, ['o1'])}>
          save-board
        </button>
      </div>
    ) : null,
}));
vi.mock('../MemberDetailDialog', () => ({
  default: ({ open, member, onSave }) =>
    open ? (
      <div data-testid="member-dialog">
        <span>{member?.name}</span>
        <button onClick={() => onSave(member.id, { name: 'M2', active: false })}>
          save-member
        </button>
      </div>
    ) : null,
}));
vi.mock('./TeamEditDialog', () => ({
  default: ({ open, team, onSave }) =>
    open ? (
      <div data-testid="team-dialog">
        <span>{team?.name}</span>
        <button onClick={() => onSave({ name: 'T2', description: '', isActive: false })}>
          save-team
        </button>
      </div>
    ) : null,
}));

// ── Service mocks. ──
const svc = {
  getAllConcilium: vi.fn(async () => [{ id: 'b1', name: 'Board' }]),
  getConciliumById: vi.fn(async () => ({ id: 'b1', name: 'Board', status: 'active', llms: [] })),
  updateConcilium: vi.fn(async () => ({})),
  listOrganizations: vi.fn(async () => [{ id: 'o1', name: 'Org', consilium_id: 'b1' }]),
  getOrganization: vi.fn(async () => ({ id: 'o1', name: 'Org', org_type: 'division' })),
  updateOrganization: vi.fn(async () => ({})),
  getAllTeams: vi.fn(async () => [{ id: 't1', name: 'Team', isActive: true }]),
  editTeam: vi.fn(async () => ({})),
  getAllMembers: vi.fn(async () => [{ id: 'm1', name: 'Member', role: 'evaluator', active: true }]),
  editMember: vi.fn(async () => ({})),
  quarantineMember: vi.fn(async () => ({})),
  unquarantineMember: vi.fn(async () => ({})),
  removeMember: vi.fn(async () => ({})),
  reconcileBoardOrgs: vi.fn(async () => ({})),
};
vi.mock('../../../services/conciliumService', () => ({
  getAllConcilium: (...a) => svc.getAllConcilium(...a),
  getConciliumById: (...a) => svc.getConciliumById(...a),
  updateConcilium: (...a) => svc.updateConcilium(...a),
}));
vi.mock('../../../services/organizationService', () => ({
  listOrganizations: (...a) => svc.listOrganizations(...a),
  getOrganization: (...a) => svc.getOrganization(...a),
  updateOrganization: (...a) => svc.updateOrganization(...a),
}));
vi.mock('../../../services/conciliumTeamsService', () => ({
  getAllTeams: (...a) => svc.getAllTeams(...a),
  editTeam: (...a) => svc.editTeam(...a),
}));
vi.mock('../../../services/conciliumMembersService', () => ({
  getAllMembers: (...a) => svc.getAllMembers(...a),
  editMember: (...a) => svc.editMember(...a),
  quarantineMember: (...a) => svc.quarantineMember(...a),
  unquarantineMember: (...a) => svc.unquarantineMember(...a),
  removeMember: (...a) => svc.removeMember(...a),
}));
vi.mock('../reconcileBoardOrgs', () => ({
  reconcileBoardOrgs: (...a) => svc.reconcileBoardOrgs(...a),
}));

import TopologyNodeDialogs, { resolveEntityRef } from './TopologyNodeDialogs';

const theme = createTheme();
function renderHost(node, onSaved = vi.fn(), onClose = vi.fn()) {
  render(
    <ThemeProvider theme={theme}>
      <TopologyNodeDialogs
        node={node}
        onSaved={onSaved}
        onClose={onClose}
        user={{ email: 'u@x.com' }}
      />
    </ThemeProvider>
  );
  return { onSaved, onClose };
}
const node = (kind, extra = {}) => ({ id: `${kind}-1`, data: { kind, ...extra } });

beforeEach(() => vi.clearAllMocks());

describe('TopologyNodeDialogs', () => {
  it('opens BoardForm for a consilium node and saves via updateConcilium', async () => {
    const { onSaved } = renderHost(node('consilium', { entityId: 'b1', label: 'Board' }));
    fireEvent.click(await screen.findByText('save-board'));
    await waitFor(() => expect(svc.updateConcilium).toHaveBeenCalled());
    expect(svc.updateConcilium.mock.calls[0][0]).toBe('b1');
    expect(svc.reconcileBoardOrgs).toHaveBeenCalledWith('b1', ['o1'], expect.any(Array));
    expect(onSaved).toHaveBeenCalledWith('consilium-1', expect.objectContaining({ label: 'B2' }));
  });

  it('opens TeamEditDialog for a team node and saves via editTeam', async () => {
    const { onSaved } = renderHost(node('team', { entityId: 't1' }));
    fireEvent.click(await screen.findByText('save-team'));
    await waitFor(() =>
      expect(svc.editTeam).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'T2' }))
    );
    expect(onSaved).toHaveBeenCalledWith(
      'team-1',
      expect.objectContaining({ statusKey: 'inactive' })
    );
  });

  it('opens MemberDetailDialog for an agent node and saves via editMember', async () => {
    const { onSaved } = renderHost(node('agent', { entityId: 'm1', conciliumId: 'b1' }));
    fireEvent.click(await screen.findByText('save-member'));
    await waitFor(() =>
      expect(svc.editMember).toHaveBeenCalledWith('m1', expect.objectContaining({ name: 'M2' }))
    );
    expect(onSaved).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ statusKey: 'inactive' })
    );
  });

  it('opens the org drawer for an organization node and attaches a board', async () => {
    renderHost(node('organization', { entityId: 'o1' }));
    expect(await screen.findByTestId('org-drawer')).toBeTruthy();
    fireEvent.click(screen.getByText('attach'));
    await waitFor(() =>
      expect(svc.updateOrganization).toHaveBeenCalledWith('o1', { consilium_id: 'b9' })
    );
  });

  it('back-fills the entity from the node id for an older org node (no entityId)', async () => {
    renderHost({ id: 'org-o1', data: { kind: 'organization' } });
    expect(await screen.findByTestId('org-drawer')).toBeTruthy();
    expect(svc.getOrganization).toHaveBeenCalledWith('o1');
  });

  it('shows a not-linked notice only for a manually-added node', async () => {
    renderHost({ id: 'node-abc', data: { kind: 'team' } });
    expect(await screen.findByText(/added manually/i)).toBeTruthy();
  });
});

describe('resolveEntityRef', () => {
  it('prefers node.data.entityId when present', () => {
    expect(
      resolveEntityRef({ id: 'x', data: { kind: 'team', entityId: 't9', conciliumId: 'b1' } })
    ).toEqual({
      entityId: 't9',
      conciliumId: 'b1',
    });
  });

  it('parses an org id (uuid with hyphens) by prefix', () => {
    const r = resolveEntityRef({ id: 'org-11-22-33', data: { kind: 'organization' } });
    expect(r.entityId).toBe('11-22-33');
  });

  it('matches consilium/team ids as a suffix against the loaded lists', () => {
    const boards = [{ id: 'concilium-1-a' }];
    const teams = [{ id: 'tid-9' }];
    expect(
      resolveEntityRef(
        { id: 'consilium-o1-concilium-1-a', data: { kind: 'consilium' } },
        { boards }
      ).entityId
    ).toBe('concilium-1-a');
    expect(
      resolveEntityRef({ id: 'team-o1-tid-9', data: { kind: 'team' } }, { teams }).entityId
    ).toBe('tid-9');
  });

  it('parses an agent id into member + conciliumId', () => {
    const teams = [{ id: 'tid9' }];
    const orgs = [{ id: 'o1', consilium_id: 'b1' }];
    const r = resolveEntityRef(
      { id: 'agent-o1-tid9-mid7', data: { kind: 'agent' } },
      { teams, orgs }
    );
    expect(r).toEqual({ entityId: 'mid7', conciliumId: 'b1' });
  });

  it('returns no record for a manually-added node', () => {
    expect(resolveEntityRef({ id: 'node-abc', data: { kind: 'team' } }).entityId).toBeNull();
  });
});
