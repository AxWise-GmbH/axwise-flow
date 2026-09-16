/**
 * Server-owned coordination for writes to a tool-scoped credential.
 *
 * The marker contains only opaque provenance (never credential material) and
 * is written into the exact tools.data snapshot with a compare-and-swap. Every
 * cooperating `tool:*` writer must own this marker before touching Vault.
 *
 * There is intentionally no time-based takeover. A process crash or an
 * ambiguous database result needs explicit operator reconciliation; silently
 * stealing an old-looking marker could overlap a still-running Vault write.
 */
import { randomUUID } from 'node:crypto';
import { stripPersistedCredentials } from '../../security/persisted-credential-sanitizer.js';

export const TOOL_CREDENTIAL_RESERVATION_FIELD = 'credential_write_reservation';
export const TOOL_CREDENTIAL_VERSION_FIELD = 'credential_write_version';
const RESERVATION_STATUS = 'storing';

export function toolIdFromCredentialProvider(provider) {
  if (typeof provider !== 'string' || !provider.startsWith('tool:')) return null;
  const toolId = provider.slice(5);
  return toolId ? toolId : null;
}

function markerFor(attemptId) {
  return { attempt_id: attemptId, status: RESERVATION_STATUS };
}

function snapshotFilter(query, field, value) {
  return value === null ? query.is(field, null) : query.eq(field, value);
}

function exactToolSnapshotQuery(query, snapshot) {
  let filtered = query.eq('id', snapshot.id).eq('user_id', snapshot.user_id);
  filtered = snapshotFilter(filtered, 'status', snapshot.status ?? null);
  filtered = snapshotFilter(filtered, 'updated_at', snapshot.updated_at ?? null);
  // `updated_at` is the tool-row version used by every cooperating mutation.
  // Do not pass an object to Supabase `.eq('data', value)`: postgrest-js would
  // encode it as `[object Object]`, not JSON equality. The explicit missing
  // marker predicate plus a scalar opaque version prevent two reservations
  // created within one clock tick (or a stale pre-registration snapshot) from
  // both matching. Ordinary config mutations are fenced by updated_at; every
  // cooperating credential mutation additionally advances this version.
  filtered = filtered.is(`data->${TOOL_CREDENTIAL_RESERVATION_FIELD}`, null);
  const credentialVersion = snapshot.data?.[TOOL_CREDENTIAL_VERSION_FIELD];
  return credentialVersion == null
    ? filtered.is(`data->>${TOOL_CREDENTIAL_VERSION_FIELD}`, null)
    : filtered.eq(`data->>${TOOL_CREDENTIAL_VERSION_FIELD}`, String(credentialVersion));
}

function exactReservationQuery(query, reservation) {
  let filtered = query.eq('id', reservation.toolId).eq('user_id', reservation.userId);
  filtered = snapshotFilter(filtered, 'status', reservation.reservedStatus ?? null);
  filtered = snapshotFilter(filtered, 'updated_at', reservation.reservedUpdatedAt ?? null);
  filtered = filtered.eq(`data->>${TOOL_CREDENTIAL_VERSION_FIELD}`, String(reservation.attemptId));
  return filtered.contains('data', {
    [TOOL_CREDENTIAL_RESERVATION_FIELD]: markerFor(reservation.attemptId),
  });
}

function reconciliationFailure(message, error = null) {
  return {
    ok: false,
    code: 'TOOL_CREDENTIAL_RECONCILIATION_REQUIRED',
    status: 503,
    message,
    error,
    reconciliationRequired: true,
  };
}

export async function loadToolCredentialSnapshot({ admin, userId, toolId }) {
  if (!admin || !userId || !toolId) {
    return {
      ok: false,
      code: 'TOOL_RESERVATION_BAD_INPUT',
      status: 500,
      message: 'Tool credential reservation input is incomplete',
    };
  }

  try {
    const { data, error } = await admin
      .from('tools')
      .select('id, user_id, name, data, status, connection_type, updated_at')
      .eq('id', toolId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      return reconciliationFailure('Tool snapshot could not be loaded', error);
    }
    if (!data) {
      return {
        ok: false,
        code: 'TOOL_NOT_FOUND',
        status: 404,
        message: 'Tool not found',
      };
    }
    return { ok: true, snapshot: data };
  } catch (error) {
    return reconciliationFailure('Tool snapshot outcome is unknown', error);
  }
}

/**
 * Reserve an exact tool snapshot. `toolSnapshot` must have been loaded before
 * any long-running work whose output is intended for this tool.
 */
export async function reserveToolCredentialWrite({
  admin,
  userId,
  toolSnapshot,
  source,
  attemptId = randomUUID(),
}) {
  if (
    !admin ||
    !userId ||
    !toolSnapshot?.id ||
    toolSnapshot.user_id !== userId ||
    !Object.hasOwn(toolSnapshot, 'data') ||
    !Object.hasOwn(toolSnapshot, 'status') ||
    !Object.hasOwn(toolSnapshot, 'updated_at')
  ) {
    return {
      ok: false,
      code: 'TOOL_RESERVATION_BAD_SNAPSHOT',
      status: 500,
      message: 'Exact tool snapshot is unavailable',
    };
  }

  if (toolSnapshot.data?.[TOOL_CREDENTIAL_RESERVATION_FIELD]) {
    return {
      ok: false,
      code: 'TOOL_CREDENTIAL_WRITE_IN_PROGRESS',
      status: 409,
      message:
        'Another credential write is already in progress. If this persists, an operator must reconcile it.',
    };
  }

  const baseData = stripPersistedCredentials(toolSnapshot.data || {});
  const startedAt = new Date().toISOString();
  const marker = {
    ...markerFor(attemptId),
    source: String(source || 'server').slice(0, 64),
    started_at: startedAt,
  };
  const finalizedData = {
    ...baseData,
    [TOOL_CREDENTIAL_VERSION_FIELD]: attemptId,
  };
  const reservedData = {
    ...finalizedData,
    [TOOL_CREDENTIAL_RESERVATION_FIELD]: marker,
  };

  try {
    const query = exactToolSnapshotQuery(
      admin.from('tools').update({ data: reservedData, updated_at: startedAt }),
      toolSnapshot
    );
    const { data: reservedTool, error } = await query
      .select('id, user_id, name, data, status, connection_type, updated_at')
      .maybeSingle();
    if (error) {
      return reconciliationFailure('Tool reservation outcome is unknown', error);
    }
    if (!reservedTool) {
      return {
        ok: false,
        code: 'TOOL_SNAPSHOT_STALE',
        status: 409,
        message: 'Tool changed before credential storage',
      };
    }

    return {
      ok: true,
      reservation: {
        attemptId,
        toolId: toolSnapshot.id,
        userId,
        source: marker.source,
        finalizedData,
        baseStatus: toolSnapshot.status ?? null,
        reservedData,
        reservedStatus: reservedTool.status ?? null,
        reservedUpdatedAt: reservedTool.updated_at ?? null,
      },
      tool: reservedTool,
    };
  } catch (error) {
    return reconciliationFailure('Tool reservation outcome is unknown', error);
  }
}

export function reservationMatchesToolProvider(reservation, { userId, provider }) {
  const toolId = toolIdFromCredentialProvider(provider);
  return Boolean(
    toolId &&
    reservation?.attemptId &&
    reservation.toolId === toolId &&
    reservation.userId === userId
  );
}

/** Verify the exact marker immediately before the Vault side effect. */
export async function verifyToolCredentialWriteReservation({ admin, reservation }) {
  if (!admin || !reservation?.attemptId) {
    return reconciliationFailure('Tool credential reservation is unavailable');
  }
  try {
    const query = exactReservationQuery(admin.from('tools').select('id, updated_at'), reservation);
    const { data, error } = await query.maybeSingle();
    if (error) {
      return reconciliationFailure('Tool reservation verification is unknown', error);
    }
    if (!data) {
      return {
        ok: false,
        code: 'TOOL_RESERVATION_LOST',
        status: 409,
        message: 'Tool credential reservation was lost',
      };
    }
    return { ok: true };
  } catch (error) {
    return reconciliationFailure('Tool reservation verification is unknown', error);
  }
}

async function endReservation({ admin, reservation, status, message }) {
  if (
    !admin ||
    !reservation?.attemptId ||
    !reservation.finalizedData ||
    typeof reservation.finalizedData !== 'object' ||
    Array.isArray(reservation.finalizedData)
  ) {
    return reconciliationFailure(message);
  }
  const updatedAt = new Date().toISOString();
  try {
    const query = exactReservationQuery(
      admin.from('tools').update({
        data: reservation.finalizedData,
        status,
        updated_at: updatedAt,
      }),
      reservation
    );
    const { data, error } = await query.select('id, status, data, updated_at').maybeSingle();
    if (error || !data) {
      return reconciliationFailure(message, error || null);
    }
    return { ok: true, tool: data };
  } catch (error) {
    return reconciliationFailure(message, error);
  }
}

/** Release only this attempt's exact marker after a known pre-commit failure. */
export async function releaseToolCredentialWrite({ admin, reservation }) {
  return endReservation({
    admin,
    reservation,
    status: reservation?.baseStatus ?? null,
    message: 'Tool credential reservation could not be released',
  });
}

/** Finalize only this attempt's exact marker after encrypted storage succeeds. */
export async function finalizeToolCredentialWrite({ admin, reservation }) {
  return endReservation({
    admin,
    reservation,
    status: 'active',
    message: 'Stored credential needs tool-state reconciliation',
  });
}

/**
 * Finalize an exact credential deletion. A tool stays active when another
 * current slot remains; otherwise it returns to owner setup without allowing
 * a stale browser writer to cross the deletion boundary.
 */
export async function finalizeToolCredentialDelete({ admin, reservation, hasRemainingCredential }) {
  return endReservation({
    admin,
    reservation,
    status: hasRemainingCredential ? (reservation?.baseStatus ?? 'active') : 'inactive',
    message: 'Deleted credential needs tool-state reconciliation',
  });
}

export const _internal = {
  RESERVATION_STATUS,
  exactToolSnapshotQuery,
  exactReservationQuery,
};
