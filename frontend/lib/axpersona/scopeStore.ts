import { create } from 'zustand';
import type {
  PipelineExecutionResult,
  ScopeSummary,
} from './types';

export interface ScopeState {
  scopes: ScopeSummary[];
  selectedScopeId?: string;
  resultsByScopeId: Record<string, PipelineExecutionResult>;
  selectScope: (id: string) => void;
  upsertScopeResult: (
    id: string,
    scope: ScopeSummary,
    result: PipelineExecutionResult,
  ) => void;
}

export const useScopeStore = create<ScopeState>((set) => ({
  scopes: [],
  selectedScopeId: undefined,
  resultsByScopeId: {},
  selectScope: (id) =>
    set({
      selectedScopeId: id,
    }),
  upsertScopeResult: (id, scope, result) =>
    set((state) => {
      const index = state.scopes.findIndex((s) => s.id === id);
      const nextScopes = [...state.scopes];

      if (index >= 0) {
        nextScopes[index] = { ...state.scopes[index], ...scope };
      } else {
        nextScopes.push(scope);
      }

      return {
        scopes: nextScopes,
        selectedScopeId: state.selectedScopeId ?? id,
        resultsByScopeId: {
          ...state.resultsByScopeId,
          [id]: result,
        },
      };
    }),
}));

