/**
 * Hook for managing session synchronization before critical operations
 */

import { useState, useCallback } from 'react';
import { UnifiedSessionManager } from '@/lib/session/unified-session-manager';

export interface SessionSyncResult {
  success: boolean;
  error?: string;
  wasSynced: boolean;
}

export function useSessionSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const ensureSessionSynced = useCallback(async (sessionId: string): Promise<SessionSyncResult> => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      console.log(`🔄 Ensuring session ${sessionId} is synced before critical operation...`);
      
      const sessionManager = UnifiedSessionManager.getInstance();
      const wasSynced = await sessionManager.ensureSessionSynced(sessionId);

      if (wasSynced) {
        console.log(`✅ Session ${sessionId} is now synced to backend`);
        return { success: true, wasSynced: true };
      } else {
        const error = 'Failed to sync session to backend';
        setSyncError(error);
        console.warn(`⚠️ ${error}: ${sessionId}`);
        return { success: false, error, wasSynced: false };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
      setSyncError(errorMessage);
      console.error(`❌ Session sync error for ${sessionId}:`, error);
      return { success: false, error: errorMessage, wasSynced: false };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const syncBeforeQuestionnaireGeneration = useCallback(async (sessionId: string): Promise<boolean> => {
    console.log(`🎯 Syncing session before questionnaire generation: ${sessionId}`);
    
    const result = await ensureSessionSynced(sessionId);
    
    if (!result.success) {
      console.error(`❌ Cannot generate questionnaire - session sync failed: ${result.error}`);
      // For now, we'll allow questionnaire generation even if sync fails
      // This prevents blocking the user, but the session continuity issue may persist
      console.warn(`⚠️ Proceeding with questionnaire generation despite sync failure`);
      return true; // Allow operation to continue
    }

    return true;
  }, [ensureSessionSynced]);

  return {
    isSyncing,
    syncError,
    ensureSessionSynced,
    syncBeforeQuestionnaireGeneration,
  };
}
