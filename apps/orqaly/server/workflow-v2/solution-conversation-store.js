export function createSolutionConversationStore(repository) {
  const transaction = (scope, callback) => repository.solutionBuildTransaction(scope, callback);
  return {
    transaction,
    claim: (leaseToken) => repository.claimSolutionConversationTurnV2(leaseToken),
    async readClaim(scope, id, leaseToken) {
      return transaction(
        scope,
        async (client) =>
          (
            await client.query(
              "SELECT * FROM orqaly.solution_conversation_turns WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND lease_token=$4 AND status='running'",
              [scope.tenantId, scope.userId, id, leaseToken]
            )
          ).rows[0] ?? null
      );
    },
    async finish(scope, id, leaseToken, result) {
      return transaction(
        scope,
        async (client) =>
          (
            await client.query(
              'SELECT orqaly.complete_solution_conversation_turn($1::uuid,$2::uuid,$3::jsonb) AS result',
              [id, leaseToken, JSON.stringify(result)]
            )
          ).rows[0]?.result ?? null
      );
    },
    async advance(scope, id, leaseToken, lifecycle) {
      return transaction(
        scope,
        async (client) =>
          (
            await client.query(
              'SELECT orqaly.advance_solution_conversation_turn($1::uuid,$2::uuid,$3::jsonb) AS result',
              [id, leaseToken, JSON.stringify(lifecycle)]
            )
          ).rows[0]?.result ?? null
      );
    },
  };
}
