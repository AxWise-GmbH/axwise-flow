import { describe, expect, it } from 'vitest';
import {
  GCP_FOOTER_NAV_ITEMS,
  GCP_PRIMARY_NAV_ITEMS,
  gcpNavStorageKey,
  isGcpNavItemActive,
} from './gcpNavItems.js';

describe('GCP Standard navigation manifest', () => {
  it('keeps the approved launch taxonomy and no deferred legacy modules', () => {
    expect(GCP_PRIMARY_NAV_ITEMS.map((item) => item.label)).toEqual([
      'New chat',
      'Recents',
      'Pinned',
      'Home',
      'Assistant',
      'Goals',
      'Workflows',
      'Workspace',
      'Intelligence',
      'History',
    ]);
    expect(
      GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'intelligence').children.map(
        (item) => item.label
      )
    ).toEqual(['Agents', 'Capabilities', 'Knowledge', 'Results']);
    expect(
      GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'history').children.map((item) => item.label)
    ).toEqual(['Assistant Chats', 'Goal Runs', 'Results & Artifacts']);
    expect(GCP_FOOTER_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Notifications',
      'Activity & Usage',
      'Settings',
      'Edit sidebar',
    ]);

    const serialized = JSON.stringify([GCP_PRIMARY_NAV_ITEMS, GCP_FOOTER_NAV_ITEMS]);
    for (const deferred of ['communicator', 'partners', 'finances', 'replicators', 'arena']) {
      expect(serialized.toLowerCase()).not.toContain(deferred);
    }
  });

  it('matches query-specific destinations without confusing New chat and Assistant', () => {
    const newChat = GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'new-chat');
    const assistant = GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'assistant');
    expect(isGcpNavItemActive(newChat, '/assistant?new=nonce')).toBe(true);
    expect(isGcpNavItemActive(newChat, '/assistant?thread=thread-1')).toBe(false);
    expect(isGcpNavItemActive(assistant, '/assistant')).toBe(true);
    expect(isGcpNavItemActive(assistant, '/assistant?thread=thread-1')).toBe(true);
    expect(isGcpNavItemActive(assistant, '/assistant?new=nonce')).toBe(false);
  });

  it('matches a dynamic recent row by both route and query value', () => {
    const recent = { to: '/goals?run=run-1' };
    expect(isGcpNavItemActive(recent, '/goals?run=run-1')).toBe(true);
    expect(isGcpNavItemActive(recent, '/goals?run=run-2')).toBe(false);
    expect(isGcpNavItemActive(recent, '/assistant?run=run-1')).toBe(false);
  });

  it('uses Workspace as the canonical destination while retaining the stable preference id', () => {
    const workspace = GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'structure');
    expect(workspace).toMatchObject({ label: 'Workspace', to: '/workspace' });
    expect(isGcpNavItemActive(workspace, '/workspace')).toBe(true);
    expect(isGcpNavItemActive(workspace, '/organizations')).toBe(false);
  });

  it('uses a versioned Clerk-user-scoped preference key', () => {
    expect(gcpNavStorageKey('user_one')).not.toBe(gcpNavStorageKey('user_two'));
    expect(gcpNavStorageKey('user/a')).toContain('user%2Fa');
    expect(gcpNavStorageKey(null)).toBeNull();
  });

  it('keeps drafts and saved workflows in one navigation destination', () => {
    const workflows = GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'workflows');
    const workspace = GCP_PRIMARY_NAV_ITEMS.find((item) => item.id === 'structure');
    for (const path of [
      '/workspace/workflows',
      '/workspace/builds/build-1',
      '/workspace/solutions/solution-1',
    ]) {
      expect(isGcpNavItemActive(workflows, path)).toBe(true);
      expect(isGcpNavItemActive(workspace, path)).toBe(false);
    }
    expect(isGcpNavItemActive(workflows, '/workspace')).toBe(false);
    expect(isGcpNavItemActive(workflows, '/workspace/solutions-other')).toBe(false);
  });
});
