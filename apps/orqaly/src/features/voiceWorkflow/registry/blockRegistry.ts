import type { BlockDefinition } from '../types';

export class BlockRegistry {
  private readonly byType = new Map<string, BlockDefinition>();
  private readonly aliases = new Map<string, string>(); // alias -> type

  constructor(definitions: BlockDefinition[], opts?: { aliases?: Record<string, string> }) {
    definitions.forEach((d) => this.register(d));
    const aliasMap = opts?.aliases || {};
    Object.entries(aliasMap).forEach(([alias, type]) => this.registerAlias(alias, type));
  }

  register(def: BlockDefinition) {
    if (!def?.type || typeof def.type !== 'string')
      throw new Error('BlockDefinition.type is required');
    if (this.byType.has(def.type)) throw new Error(`Duplicate block type: ${def.type}`);
    this.byType.set(def.type, def);
  }

  registerAlias(alias: string, type: string) {
    const a = normalizeToken(alias);
    if (!a) return;
    if (!this.byType.has(type)) return; // silently ignore invalid alias targets
    this.aliases.set(a, type);
  }

  has(typeOrAlias: string) {
    return Boolean(this.resolveType(typeOrAlias));
  }

  resolveType(typeOrAlias: string): string | null {
    const token = normalizeToken(typeOrAlias);
    if (!token) return null;
    if (this.byType.has(token)) return token;
    const viaAlias = this.aliases.get(token);
    if (viaAlias && this.byType.has(viaAlias)) return viaAlias;
    return null;
  }

  get(typeOrAlias: string): BlockDefinition | null {
    const type = this.resolveType(typeOrAlias);
    if (!type) return null;
    return this.byType.get(type) || null;
  }

  list(): BlockDefinition[] {
    return Array.from(this.byType.values());
  }
}

function normalizeToken(v: string) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}
