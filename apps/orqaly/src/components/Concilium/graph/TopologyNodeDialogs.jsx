/**
 * TopologyNodeDialogs - opens the right rich edit surface when a graph node is
 * clicked, and persists edits to the real database via existing services.
 *
 *   organization -> OrgDetailDrawer      (attach Consilium board)
 *   consilium    -> BoardForm            (name/purpose/status/LLMs/...)
 *   team         -> TeamEditDialog       (name/description/active)
 *   agent        -> MemberDetailDialog   (provider/model/prompt, quarantine, delete)
 *
 * On a successful save it calls onSaved(nodeId, patch) so the canvas can update the
 * node's presentation (label/subtitle/status) in place.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Snackbar, Alert, useTheme } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import FormDialog from '../../Common/FormDialog';
import OrgDetailDrawer from '../../Organizations/OrgDetailDrawer';
import BoardForm from '../BoardForm';
import MemberDetailDialog from '../MemberDetailDialog';
import TeamEditDialog from './TeamEditDialog';

import {
  listOrganizations,
  getOrganization,
  updateOrganization,
} from '../../../services/organizationService';
import {
  getAllConcilium,
  getConciliumById,
  updateConcilium,
} from '../../../services/conciliumService';
import { getAllTeams, editTeam } from '../../../services/conciliumTeamsService';
import {
  getAllMembers,
  editMember,
  quarantineMember,
  unquarantineMember,
  removeMember,
} from '../../../services/conciliumMembersService';
import { reconcileBoardOrgs } from '../reconcileBoardOrgs';

const ORG_TYPE_COLORS = {
  virtual: '#6366F1',
  holding: '#7C3AED',
  subsidiary: '#2563EB',
  division: '#059669',
  department: '#D97706',
};
const getTypeColor = (t) => ORG_TYPE_COLORS[t] || '#888';
const getTypeLabel = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Org');
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

/**
 * Resolve the DB record a node points at. Prefers node.data.entityId (added to
 * seeds), but falls back to parsing the node id against the loaded entity lists so
 * diagrams saved before entityId existed still work without a destructive re-seed.
 * Node ids: org-<orgId>, consilium-<orgId>-<boardId>, team-<orgId>-<teamId>,
 * agent-<orgId>-<teamId>-<memberId>. User-added nodes use node-<...> (no record).
 */
export function resolveEntityRef(node, { boards = [], orgs = [], teams = [] } = {}) {
  if (!node) return { entityId: null, conciliumId: null };
  const id = String(node.id || '');
  const kind = node.data?.kind;
  if (node.data?.entityId) {
    return { entityId: node.data.entityId, conciliumId: node.data.conciliumId || null };
  }
  if (id.startsWith('node-')) return { entityId: null, conciliumId: null };
  if (kind === 'organization' && id.startsWith('org-')) {
    return { entityId: id.slice(4) || null, conciliumId: null };
  }
  if (kind === 'consilium') {
    const b = boards.find((x) => id.endsWith(`-${x.id}`));
    return { entityId: b ? b.id : null, conciliumId: null };
  }
  if (kind === 'team') {
    const t = teams.find((x) => id.endsWith(`-${x.id}`));
    return { entityId: t ? t.id : null, conciliumId: null };
  }
  if (kind === 'agent') {
    const t = teams.find((x) => id.includes(`-${x.id}-`));
    let entityId = null;
    if (t) {
      const marker = `-${t.id}-`;
      entityId = id.slice(id.indexOf(marker) + marker.length) || null;
    }
    const o = orgs.find((x) => id.startsWith(`agent-${x.id}-`));
    return { entityId, conciliumId: o ? o.consilium_id || null : null };
  }
  return { entityId: null, conciliumId: null };
}

export default function TopologyNodeDialogs({ node, onClose, onSaved, user }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const userName = user?.email || user?.name || 'Unknown';

  const [boards, setBoards] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [listsReady, setListsReady] = useState(false);
  const [entity, setEntity] = useState(null); // fetched org / board / team / member
  const [board, setBoard] = useState(null); // board context for a member
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState(null);

  const kind = node?.data?.kind;

  // Lists loaded once; also used to back-fill entity refs for older nodes.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [b, o, t] = await Promise.all([
          getAllConcilium(),
          listOrganizations(),
          getAllTeams(),
        ]);
        if (active) {
          setBoards(b || []);
          setOrgs(o || []);
          setTeams(t || []);
        }
      } catch {
        /* non-fatal - dialogs still open */
      } finally {
        if (active) setListsReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const { entityId, conciliumId } = useMemo(
    () => resolveEntityRef(node, { boards, orgs, teams }),
    [node, boards, orgs, teams]
  );

  // Fetch the clicked node's underlying record.
  useEffect(() => {
    if (!node || !entityId) {
      setEntity(null);
      setBoard(null);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        let e = null;
        let bd = null;
        if (kind === 'organization') e = await getOrganization(entityId);
        else if (kind === 'consilium') e = await getConciliumById(entityId);
        else if (kind === 'team') e = (await getAllTeams()).find((t) => t.id === entityId) || null;
        else if (kind === 'agent') {
          const cid = conciliumId;
          const members = cid ? await getAllMembers(cid) : [];
          e = members.find((m) => m.id === entityId) || null;
          bd = cid ? await getConciliumById(cid) : null;
        }
        if (active) {
          setEntity(e);
          setBoard(bd);
        }
      } catch {
        if (active) setEntity(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [node, entityId, conciliumId, kind]);

  const notify = useCallback((severity, message) => setSnack({ severity, message }), []);

  // ── Save handlers ──────────────────────────────────────────────────────────
  const handleBoardSave = useCallback(
    async (form, orgIds) => {
      setSaving(true);
      try {
        await updateConcilium(entityId, form, userName);
        await reconcileBoardOrgs(entityId, orgIds, orgs);
        onSaved?.(node.id, {
          label: form.name,
          statusKey: form.status,
          subtitle: `${cap(form.status)} · ${(form.llms || []).length} LLM${(form.llms || []).length === 1 ? '' : 's'}`,
        });
        notify('success', 'Board saved');
        onClose();
      } catch (err) {
        notify('error', err?.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [entityId, orgs, userName, node, onSaved, onClose, notify]
  );

  const handleTeamSave = useCallback(
    async (updates) => {
      setSaving(true);
      try {
        await editTeam(entityId, updates);
        onSaved?.(node.id, {
          label: updates.name,
          statusKey: updates.isActive ? 'active' : 'inactive',
        });
        notify('success', 'Team saved');
        onClose();
      } catch (err) {
        notify('error', err?.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [entityId, node, onSaved, onClose, notify]
  );

  const handleMemberSave = useCallback(
    async (id, updates) => {
      try {
        await editMember(id, updates);
        const patch = {};
        if (updates.name != null) patch.label = updates.name;
        if (updates.role != null) {
          patch.role = updates.role;
          patch.subtitle = cap(updates.role);
        }
        if (updates.active != null) patch.statusKey = updates.active ? 'active' : 'inactive';
        onSaved?.(node.id, patch);
        notify('success', 'Member saved');
      } catch (err) {
        notify('error', err?.message || 'Save failed');
      }
    },
    [node, onSaved, notify]
  );

  const handleAttachConsilium = useCallback(
    async (boardId) => {
      try {
        await updateOrganization(entityId, { consilium_id: boardId || null });
        setEntity((o) => (o ? { ...o, consilium_id: boardId || null } : o));
        notify('success', boardId ? 'Board attached' : 'Board detached');
      } catch (err) {
        notify('error', err?.message || 'Update failed');
      }
    },
    [entityId, notify]
  );

  const snackEl = (
    <Snackbar
      open={Boolean(snack)}
      autoHideDuration={3500}
      onClose={() => setSnack(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {snack ? (
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(null)}>
          {snack.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );

  if (!node) return snackEl;

  // A user-added node has no backing record at all.
  if (String(node.id).startsWith('node-')) {
    return (
      <>
        <FormDialog
          open
          onClose={onClose}
          title={node.data?.label || 'Node'}
          subtitle="Not linked to a database record"
          icon={InfoOutlinedIcon}
          maxWidth="xs"
          primaryLabel="Close"
          onPrimary={onClose}
          hideCancel
        >
          This node was added manually and is not connected to a saved record, so there is nothing
          to edit in the database.
        </FormDialog>
        {snackEl}
      </>
    );
  }

  // Still resolving the record (waiting on the entity lists or the fetch).
  if (!listsReady || loading) {
    return (
      <>
        <FormDialog open onClose={onClose} title="Loading…" maxWidth="xs" hideFooter>
          Loading record…
        </FormDialog>
        {snackEl}
      </>
    );
  }

  if (!entity) {
    return (
      <>
        <FormDialog
          open
          onClose={onClose}
          title="Record not found"
          icon={InfoOutlinedIcon}
          maxWidth="xs"
          primaryLabel="Close"
          onPrimary={onClose}
          hideCancel
        >
          This record could not be loaded (it may have been deleted). Use <strong>Refresh</strong>{' '}
          to rebuild the graph.
        </FormDialog>
        {snackEl}
      </>
    );
  }

  if (kind === 'organization') {
    return (
      <>
        <OrgDetailDrawer
          open
          onClose={onClose}
          org={entity}
          orgTeamMap={{}}
          orgAgentMap={{}}
          allTeams={[]}
          allAgents={[]}
          concilium={boards}
          orgs={orgs}
          getTypeColor={getTypeColor}
          getTypeLabel={getTypeLabel}
          onAttachConsilium={handleAttachConsilium}
        />
        {snackEl}
      </>
    );
  }

  if (kind === 'consilium') {
    return (
      <>
        <BoardForm
          open
          onClose={onClose}
          onSave={handleBoardSave}
          editing={entity}
          saving={saving}
          theme={theme}
          isDark={isDark}
          orgs={orgs}
        />
        {snackEl}
      </>
    );
  }

  if (kind === 'team') {
    return (
      <>
        <TeamEditDialog
          open
          team={entity}
          onClose={onClose}
          onSave={handleTeamSave}
          saving={saving}
        />
        {snackEl}
      </>
    );
  }

  if (kind === 'agent') {
    return (
      <>
        <MemberDetailDialog
          open
          member={entity}
          board={board}
          isDark={isDark}
          onClose={onClose}
          onEdit={() => {}}
          onSave={handleMemberSave}
          onDelete={async () => {
            try {
              await removeMember(entity.id);
              notify('success', 'Member deleted');
            } catch (err) {
              notify('error', err?.message || 'Delete failed');
            }
            onClose();
          }}
          onQuarantine={async () => {
            try {
              await quarantineMember(entity.id, 'Manual quarantine');
              onSaved?.(node.id, { statusKey: 'quarantined' });
              notify('success', 'Member quarantined');
            } catch (err) {
              notify('error', err?.message || 'Action failed');
            }
            onClose();
          }}
          onUnquarantine={async () => {
            try {
              await unquarantineMember(entity.id);
              onSaved?.(node.id, { statusKey: 'active' });
              notify('success', 'Member released');
            } catch (err) {
              notify('error', err?.message || 'Action failed');
            }
            onClose();
          }}
        />
        {snackEl}
      </>
    );
  }

  return snackEl;
}
