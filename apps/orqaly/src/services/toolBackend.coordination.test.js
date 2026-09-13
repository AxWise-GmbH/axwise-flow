import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  hasSupabase: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
  hasSupabase: mocks.hasSupabase,
}));

vi.mock('./auditLogBackend', () => ({
  logAction: mocks.logAction,
  buildAgentMeta: vi.fn(() => ({})),
}));

function builderFor(writeError) {
  const terminal = vi.fn().mockResolvedValue({ error: writeError });
  const secondEq = { eq: terminal };
  return {
    select: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: null, error: null }) })),
    insert: vi.fn().mockResolvedValue({ error: writeError }),
    update: vi.fn(() => ({ eq: vi.fn(() => secondEq) })),
    delete: vi.fn(() => ({ eq: vi.fn(() => secondEq) })),
  };
}

async function backendWith(writeError) {
  const builder = builderFor(writeError);
  mocks.from.mockReturnValue(builder);
  const backend = await import('./toolBackend.js');
  return { backend, builder };
}

const tool = {
  id: 'tool-owned',
  name: 'Owned tool',
  description: '',
  status: 'active',
  connectionType: 'api',
  usedBy: [],
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.hasSupabase.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('toolBackend credential coordination conflicts', () => {
  it('surfaces a protected create instead of silently falling back to localStorage', async () => {
    const conflict = { code: '42501', message: 'coordination fields are server-owned' };
    const { backend } = await backendWith(conflict);
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');

    await expect(backend.createTool(tool)).rejects.toMatchObject(conflict);

    expect(localWrite).not.toHaveBeenCalled();
    localWrite.mockRestore();
  });

  it('surfaces an update blocked by an active credential reservation', async () => {
    const conflict = { code: '42501', message: 'tool credential write is in progress' };
    const { backend } = await backendWith(conflict);
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');

    await expect(backend.updateToolById(tool.id, tool)).rejects.toMatchObject(conflict);

    expect(localWrite).not.toHaveBeenCalled();
    localWrite.mockRestore();
  });

  it('surfaces a protected delete instead of reporting a local-only success', async () => {
    const conflict = { code: '42501', message: 'tool credential write is in progress' };
    const { backend } = await backendWith(conflict);
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');

    await expect(backend.deleteToolById(tool.id)).rejects.toMatchObject(conflict);

    expect(localWrite).not.toHaveBeenCalled();
    localWrite.mockRestore();
  });

  it('turns the current-credential delete guard into an actionable error', async () => {
    const conflict = {
      code: '42501',
      message: "Delete this tool's current credential before deleting the tool",
    };
    const { backend } = await backendWith(conflict);
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');

    await expect(backend.deleteToolById(tool.id)).rejects.toMatchObject({
      code: 'TOOL_CREDENTIAL_DELETE_REQUIRED',
      message: "Delete this tool's saved credential first, then retry deleting the tool.",
      cause: conflict,
    });

    expect(localWrite).not.toHaveBeenCalled();
    localWrite.mockRestore();
  });
});
