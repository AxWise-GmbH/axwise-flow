import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { expectedBuildDefinition, jsonHash, stableJson, substitute } from './workflow-v2-gcp-attestation.mjs';

const readRepoFile = (relativePath) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shellConstant = (script, name) => {
  const match = script.match(new RegExp(`^${name}="([a-f0-9]{64})"$`, 'm'));
  expect(match, `${name} must be pinned`).not.toBeNull();
  return match[1];
};

describe('workflow v2 GCP structured attestations', () => {
  it('hashes semantically identical provider documents deterministically, including decimal values', () => {
    expect(stableJson({ z: 0.25, a: [2, 1] })).toBe('{"a":[2,1],"z":0.25}');
    expect(jsonHash({ z: 0.25, a: [2, 1] })).toBe(jsonHash({ a: [2, 1], z: 0.25 }));
  });

  it('models Cloud Build escaped dollars without applying hidden substitutions', () => {
    expect(
      substitute('$$CLERK_PUBLISHABLE_KEY|$$_IMAGE_NAME|$_IMAGE_NAME|$PROJECT_ID', {
        _IMAGE_NAME: 'image:commit',
        PROJECT_ID: 'preview-project',
      })
    ).toBe('$CLERK_PUBLISHABLE_KEY|$_IMAGE_NAME|image:commit|preview-project');
  });

  it('resolves committed web build defaults while preserving explicit attested inputs', () => {
    const config = yaml.load(readRepoFile('deploy/workflow-v2/cloudbuild.web.yaml'));
    const definition = expectedBuildDefinition(config, {
      _IMAGE_NAME: 'registry.example/web:exact-commit',
      _ORQALY_API_URL: 'https://preview-api.example.com',
      _CLERK_PUBLISHABLE_KEY_VERSION: '3',
    });
    const args = definition.steps[0].args.join('\n');
    expect(args).toContain('VITE_CLERK_ENVIRONMENT=preview');
    expect(args).toContain('VITE_ORQALY_API_ENVIRONMENT=preview');
    expect(args).toContain('VITE_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY');
    expect(args).toContain('https://preview-api.example.com');
    expect(args).not.toContain('$_CLERK_ENVIRONMENT');
    expect(definition.availableSecrets.secretManager[0].versionName).toBe(
      'projects/axwise-v2-preview-001/secrets/orqaly-v2-preview-001-clerk-publishable-key/versions/3'
    );
    const overridden = expectedBuildDefinition(config, {
      _CLERK_ENVIRONMENT: 'production', _ORQALY_API_ENVIRONMENT: 'production',
      _CLERK_PUBLISHABLE_KEY_SECRET: 'explicit-production-key',
    });
    expect(overridden.steps[0].args.join('\n')).toContain('VITE_CLERK_ENVIRONMENT=production');
    expect(overridden.availableSecrets.secretManager[0].versionName).toContain('/explicit-production-key/');
  });

  it('makes build provenance a required create-only output bound to Cloud Build IDs', () => {
    const script = readRepoFile('infra/gcp/workflow-v2/build-preview-images.sh');
    expect(script).toContain('BUILD_ATTESTATION_OUTPUT="${BUILD_ATTESTATION_OUTPUT:?');
    expect(script).toContain("--format='value(id)'");
    expect(script).toContain('archive --format=tar --output=');
    expect(script).toContain('gcloud builds submit "${orqaly_context}"');
    expect(script).toContain('--orqaly-source-snapshot-sha256');
    expect(script).toContain('workflow-v2-gcp-attestation.mjs" build');
    expect(script).toContain('--orqaly-service-build-id');
    expect(script).toContain('--axwise-service-build-id');
  });

  it('resolves shared-root source defaults and retains recoverable build contexts', () => {
    const script = readRepoFile('infra/gcp/workflow-v2/build-preview-images.sh');
    expect(script).toContain('${BASH_SOURCE[0]}');
    expect(script).toContain('AXWISE_REPOSITORY="${AXWISE_REPOSITORY:-$(git -C "${ORQALY_REPOSITORY}" rev-parse --show-toplevel)}"');
    expect(script).toContain('git -C "${worktree_root}" status --porcelain=v1 --untracked-files=all');
    expect(script).not.toContain('/Users/admin/');
    expect(script).toContain('trap record_build_contexts EXIT');
    expect(script).toContain('Retained exact source archives and build contexts at %s');
    expect(script).not.toMatch(/\brm\s+-rf\b/);
  });

  it('keeps release shell source paths app-relative while checking the entire worktree', () => {
    const appRoot = '$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)';
    for (const name of ['verify-preview-database-boundaries.sh', 'verify-preview-cloudsql.sh',
      'apply-preview-schema.sh', 'bootstrap-preview-tenant.sh']) {
      const script = readRepoFile(`infra/gcp/workflow-v2/${name}`);
      expect(script).toContain(`REPOSITORY_ROOT="${appRoot}"`);
    }
    for (const name of ['apply-preview-schema.sh', 'bootstrap-preview-tenant.sh']) {
      const script = readRepoFile(`infra/gcp/workflow-v2/${name}`);
      expect(script).toContain('WORKTREE_ROOT="$(git -C "${REPOSITORY_ROOT}" rev-parse --show-toplevel)"');
      expect(script).toContain('git -C "${WORKTREE_ROOT}" status --porcelain=v1 --untracked-files=all');
    }
    const bootstrap = readRepoFile('infra/gcp/workflow-v2/bootstrap-preview-tenant.sh');
    expect(bootstrap).toContain('show "HEAD:./${path}"');
    const deploy = readRepoFile('infra/gcp/workflow-v2/deploy-preview.sh');
    expect(deploy).toContain('ORQALY_REPOSITORY="${ORQALY_REPOSITORY:-' + appRoot + '}"');
    expect(deploy).toContain('AXWISE_REPOSITORY="${AXWISE_REPOSITORY:-$(git -C "${ORQALY_REPOSITORY}" rev-parse --show-toplevel)}"');
    expect(deploy).not.toContain('/Users/admin/');
  });

  it('allows runtime evidence only after the exact latest revisions receive all traffic', () => {
    const verifier = readRepoFile('infra/gcp/workflow-v2/verify-preview-runtime.sh');
    const deploy = readRepoFile('infra/gcp/workflow-v2/deploy-preview.sh');
    const generator = readRepoFile('scripts/workflow-v2-gcp-attestation.mjs');
    expect(verifier).toContain('REQUIRE_LATEST_TRAFFIC="${REQUIRE_LATEST_TRAFFIC:-true}"');
    expect(generator).toContain("execFileSync('bash', [resolve(orqalyRepository, verifierPath)]");
    expect(generator).toContain("REQUIRE_LATEST_TRAFFIC: 'true'");
    expect(generator).toContain(
      "typesafeApiKey: requiredEnvironment('TYPESAFE_API_KEY_SECRET_VERSION')"
    );
    expect(generator).toContain("'axwise-v2-preview-001-typesafe-api-key'");
    expect(deploy).toContain('workflow-v2-gcp-attestation.mjs" runtime');
    expect(deploy).toContain('REQUIRE_LATEST_TRAFFIC=false');
    expect(deploy).not.toContain('RUNTIME_ATTESTATION_OUTPUT= REQUIRE_LATEST_TRAFFIC=false');
    expect(deploy.trimEnd()).toContain('infra/gcp/workflow-v2/verify-preview-runtime.sh');
  });

  it('checks and stamps both the migration and release-role binding identities', () => {
    const apply = readRepoFile('infra/gcp/workflow-v2/apply-preview-schema.sh');
    const bindings = readRepoFile('infra/gcp/workflow-v2/preview-role-bindings.sql');
    for (const fragment of [
      'status --porcelain=v1 --untracked-files=all',
      'EXPECTED_BINDINGS_CHECKSUM=',
      '--set=migration_path=',
      '--set=bindings_checksum=',
      '--set=bindings_path=',
    ]) {
      expect(apply).toContain(fragment);
    }
    for (const column of ['migration_path', 'bindings_path', 'bindings_sha256']) {
      expect(bindings).toContain(column);
    }
  });

  it('pins and attests the additive rollout through Agentic execution and Gateway bindings', () => {
    const apply = readRepoFile('infra/gcp/workflow-v2/apply-preview-schema.sh');
    const verify = readRepoFile('infra/gcp/workflow-v2/verify-preview-cloudsql.sh');
    const boundaries = readRepoFile('infra/gcp/workflow-v2/verify-preview-database-boundaries.sh');
    const bootstrap = readRepoFile('infra/gcp/workflow-v2/bootstrap-preview-tenant.sh');
    const additiveLedger = readRepoFile('infra/gcp/workflow-v2/record-additive-migrations.sql');
    const agenticBindingLedger = readRepoFile(
      'infra/gcp/workflow-v2/agentic-preview-role-bindings.sql'
    );
    const catalogFingerprint = readRepoFile('infra/gcp/workflow-v2/catalog-fingerprint.sql');
    const migrationPath = 'database/workflow-v2/migrations/003_personal_tenant_jit.sql';
    const retryMigrationPath = 'database/workflow-v2/migrations/004_assistant_retry_lineage.sql';
    const eventsMigrationPath = 'database/workflow-v2/migrations/005_assistant_turn_events.sql';
    const provenanceMigrationPath =
      'database/workflow-v2/migrations/006_assistant_turn_provenance.sql';
    const groundedSourcesReasonMigrationPath =
      'database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql';
    const agenticExecutionMigrationPath =
      'database/workflow-v2/migrations/008_agentic_execution_preview.sql';
    const agenticBindingsPath = 'infra/gcp/workflow-v2/agentic-preview-role-bindings.sql';
    const retryMigration = readRepoFile(retryMigrationPath);
    const expectedRetryChecksum =
      '753186fd0c43a0b41b6318582ba680dc150a213aa8b54e4d5a25fbd30c517823';
    const expectedEventsChecksum =
      '6e2abfd9b07cc8360d485e0120e3be80fa8bc319940b3e16f08140a88179e6ee';
    const expectedProvenanceChecksum =
      '1e64db4857083e85576b4b32bf6376f9e05fc482d88b1abb465eededbab3968e';
    const expectedGroundedSourcesReasonChecksum =
      '4ca1289eb45f75c877a3f6b2afaf3b0af0f8286fbc7a041e93643381d9aeccd5';
    const expectedAgenticExecutionChecksum =
      'a7423976f5e2345d467071bae263998ff682d26b37318bd6661ef1afa05fc142';
    const expectedAgenticBindingsChecksum =
      '6b58aa0352a3e1677b70e8e687263d52b981d90a48ae93afe7bb6fceb31e4167';
    const expectedProvenanceFingerprint =
      '0b4e25a9d5ea0d19ab3b41b040e4e621486d05968572262babd13e7cd0b83d1a';
    const expectedPreAgenticExecutionFingerprint =
      '0340ef9dd0fba543f4ee4f678c65ca184809a654e36a7dc281743f043255c2d9';
    const expectedFullFingerprint =
      'a020d093fa84aae59ba84b000686a1147776eb343effff9074c1b4a1a39ea363';
    const expectedEventsFingerprint =
      '8d28f5677964c1d63cadf18817c3ed7edf832c3e96ae4485f833ce6796fb2c23';
    const expectedPersonalSessionFingerprint =
      '03706f24d36937bbde80b8ece5827ac476b1ca216cb2d4dd59924939d19b1133';
    const expectedLedgerChecksum =
      '57343afff7af3378eb89fd14a80d3f79a12ae001bbe47fcc70feaaef219de9fc';
    const expectedCatalogFingerprintFileChecksum =
      'e8881812f4d176adf2a3e1c251b71ab218c8f37e74fc558223bceef0d09c4454';

    expect(sha256(retryMigration)).toBe(expectedRetryChecksum);
    expect(sha256(readRepoFile(eventsMigrationPath))).toBe(expectedEventsChecksum);
    expect(sha256(readRepoFile(provenanceMigrationPath))).toBe(expectedProvenanceChecksum);
    expect(sha256(readRepoFile(groundedSourcesReasonMigrationPath))).toBe(
      expectedGroundedSourcesReasonChecksum
    );
    expect(sha256(readRepoFile(agenticExecutionMigrationPath))).toBe(
      expectedAgenticExecutionChecksum
    );
    expect(sha256(additiveLedger)).toBe(expectedLedgerChecksum);
    expect(sha256(agenticBindingLedger)).toBe(expectedAgenticBindingsChecksum);
    expect(sha256(catalogFingerprint)).toBe(expectedCatalogFingerprintFileChecksum);
    expect(shellConstant(apply, 'EXPECTED_ASSISTANT_RETRY_CHECKSUM')).toBe(expectedRetryChecksum);
    expect(shellConstant(verify, 'EXPECTED_ASSISTANT_RETRY_CHECKSUM')).toBe(expectedRetryChecksum);
    expect(shellConstant(bootstrap, 'EXPECTED_ASSISTANT_RETRY_MIGRATION_CHECKSUM')).toBe(
      expectedRetryChecksum
    );
    expect(shellConstant(boundaries, 'ORQALY_ASSISTANT_RETRY_CHECKSUM')).toBe(
      expectedRetryChecksum
    );
    expect(shellConstant(apply, 'EXPECTED_ASSISTANT_EVENTS_CHECKSUM')).toBe(expectedEventsChecksum);
    expect(shellConstant(apply, 'EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM')).toBe(
      expectedProvenanceChecksum
    );
    expect(shellConstant(apply, 'EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM')).toBe(
      expectedGroundedSourcesReasonChecksum
    );
    expect(shellConstant(apply, 'EXPECTED_AGENTIC_EXECUTION_CHECKSUM')).toBe(
      expectedAgenticExecutionChecksum
    );
    expect(shellConstant(verify, 'EXPECTED_AGENTIC_EXECUTION_CHECKSUM')).toBe(
      expectedAgenticExecutionChecksum
    );
    expect(shellConstant(bootstrap, 'EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM')).toBe(
      expectedAgenticExecutionChecksum
    );
    expect(shellConstant(boundaries, 'ORQALY_AGENTIC_EXECUTION_CHECKSUM')).toBe(
      expectedAgenticExecutionChecksum
    );
    expect(shellConstant(apply, 'EXPECTED_AGENTIC_BINDINGS_CHECKSUM')).toBe(
      expectedAgenticBindingsChecksum
    );
    expect(shellConstant(verify, 'EXPECTED_AGENTIC_BINDINGS_CHECKSUM')).toBe(
      expectedAgenticBindingsChecksum
    );
    expect(shellConstant(bootstrap, 'EXPECTED_AGENTIC_BINDINGS_CHECKSUM')).toBe(
      expectedAgenticBindingsChecksum
    );
    expect(shellConstant(boundaries, 'ORQALY_AGENTIC_BINDINGS_CHECKSUM')).toBe(
      expectedAgenticBindingsChecksum
    );

    for (const script of [apply, verify, bootstrap]) {
      expect(script).toContain(`PERSONAL_SESSION_MIGRATION_PATH="${migrationPath}"`);
      expect(script).toMatch(/EXPECTED_PERSONAL_SESSION_(?:MIGRATION_)?CHECKSUM="[a-f0-9]{64}"/);
      expect(script).toContain('record-additive-migrations.sql');
      expect(script).toContain(`ASSISTANT_RETRY_MIGRATION_PATH="${retryMigrationPath}"`);
      expect(script).toMatch(/EXPECTED_ASSISTANT_RETRY_(?:MIGRATION_)?CHECKSUM="[a-f0-9]{64}"/);
      expect(script).toContain(`ASSISTANT_EVENTS_MIGRATION_PATH="${eventsMigrationPath}"`);
      expect(script).toMatch(/EXPECTED_ASSISTANT_EVENTS_(?:MIGRATION_)?CHECKSUM="[a-f0-9]{64}"/);
      expect(script).toContain(
        `ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH="${provenanceMigrationPath}"`
      );
      expect(script).toMatch(
        /EXPECTED_ASSISTANT_TURN_PROVENANCE_(?:MIGRATION_)?CHECKSUM="[a-f0-9]{64}"/
      );
      expect(script).toContain(
        `ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH="${groundedSourcesReasonMigrationPath}"`
      );
      expect(script).toMatch(
        /EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_(?:MIGRATION_)?CHECKSUM="[a-f0-9]{64}"/
      );
      expect(script).toContain(
        `AGENTIC_EXECUTION_MIGRATION_PATH="${agenticExecutionMigrationPath}"`
      );
      expect(script).toMatch(/EXPECTED_AGENTIC_EXECUTION_(?:MIGRATION_)?CHECKSUM="[a-f0-9]{64}"/);
      expect(script).toContain(`AGENTIC_BINDINGS_PATH="${agenticBindingsPath}"`);
      expect(script).toMatch(/EXPECTED_AGENTIC_BINDINGS_CHECKSUM="[a-f0-9]{64}"/);
    }
    expect(apply).toContain(
      '--set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}"'
    );
    expect(apply).toContain('--file="${staged_additive_marker}"');
    expect(apply).toContain('workflow_v2_release.applied_additive_migrations');
    expect(apply).toContain(
      'expected_additives="${expected_pre_agentic_execution_additives},8:${AGENTIC_EXECUTION_MIGRATION_PATH}:${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}"'
    );
    expect(apply).toContain(
      '--set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}"'
    );
    expect(apply).toContain('--file="${staged_assistant_retry}"');
    expect(apply).toContain('--file="${staged_assistant_events}"');
    expect(apply).toContain('--file="${staged_assistant_turn_provenance}"');
    expect(apply).toContain('--file="${staged_assistant_grounded_sources_reason}"');
    expect(apply).toContain('--file="${staged_agentic_execution}"');
    expect(apply).toContain('--file="${staged_agentic_bindings}"');
    expect(verify).toContain(
      '--set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}"'
    );
    expect(verify).toContain('--file="${staged_additive_marker}"');
    expect(verify).toContain(
      '--set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}"'
    );
    expect(verify).toContain('--file="${staged_assistant_retry}"');
    expect(verify).toContain('--file="${staged_assistant_events}"');
    expect(verify).toContain('--file="${staged_assistant_turn_provenance}"');
    expect(verify).toContain('--file="${staged_assistant_grounded_sources_reason}"');
    expect(verify).toContain('--file="${staged_agentic_execution}"');
    expect(verify).toContain('--file="${staged_agentic_bindings}"');
    expect(bootstrap).toContain(
      'assert_exact_head_file "${PERSONAL_SESSION_MIGRATION_PATH}" "${EXPECTED_PERSONAL_SESSION_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${ASSISTANT_RETRY_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_RETRY_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${ASSISTANT_EVENTS_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_EVENTS_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_TURN_PROVENANCE_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${AGENTIC_EXECUTION_MIGRATION_PATH}" "${EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${AGENTIC_BINDINGS_PATH}" "${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      "FROM workflow_v2_release.applied_additive_migrations WHERE component = 'orqaly'"
    );
    expect(boundaries).toContain(`ORQALY_PERSONAL_SESSION_MIGRATION_PATH="${migrationPath}"`);
    expect(boundaries).toContain(`ORQALY_ASSISTANT_RETRY_MIGRATION_PATH="${retryMigrationPath}"`);
    expect(boundaries).toContain(`ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH="${eventsMigrationPath}"`);
    expect(boundaries).toContain(
      `ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH="${provenanceMigrationPath}"`
    );
    expect(boundaries).toContain(
      `ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH="${groundedSourcesReasonMigrationPath}"`
    );
    expect(boundaries).toContain(
      `ORQALY_AGENTIC_EXECUTION_MIGRATION_PATH="${agenticExecutionMigrationPath}"`
    );
    expect(boundaries).toContain(`ORQALY_AGENTIC_BINDINGS_PATH="${agenticBindingsPath}"`);
    expect(boundaries).toContain(
      "FROM workflow_v2_release.applied_additive_migrations WHERE component = 'orqaly'"
    );
    expect(boundaries).toContain(
      'expected_orqaly_additives="2:${ORQALY_ASSISTANT_MIGRATION_PATH}:${ORQALY_ASSISTANT_CHECKSUM}:${ORQALY_COMMIT},3:${ORQALY_PERSONAL_SESSION_MIGRATION_PATH}:${ORQALY_PERSONAL_SESSION_CHECKSUM}:${ORQALY_COMMIT},4:${ORQALY_ASSISTANT_RETRY_MIGRATION_PATH}:${ORQALY_ASSISTANT_RETRY_CHECKSUM}:${ORQALY_COMMIT},5:${ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH}:${ORQALY_ASSISTANT_EVENTS_CHECKSUM}:${ORQALY_COMMIT},6:${ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}:${ORQALY_ASSISTANT_TURN_PROVENANCE_CHECKSUM}:${ORQALY_COMMIT},7:${ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}:${ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}:${ORQALY_COMMIT},8:${ORQALY_AGENTIC_EXECUTION_MIGRATION_PATH}:${ORQALY_AGENTIC_EXECUTION_CHECKSUM}:${ORQALY_COMMIT}"'
    );
    expect(boundaries).toContain(
      'expected_orqaly_agentic_binding="8:${ORQALY_AGENTIC_BINDINGS_PATH}:${ORQALY_AGENTIC_BINDINGS_CHECKSUM}:${ORQALY_COMMIT}"'
    );

    expect(additiveLedger).toContain('PRIMARY KEY (component, migration_number)');
    expect(additiveLedger).toContain(
      'REVOKE ALL ON workflow_v2_release.applied_additive_migrations FROM PUBLIC'
    );
    expect(additiveLedger).toContain('SELECT 1 / (');
    expect(additiveLedger).toContain('COUNT(*) = 7');
    expect(additiveLedger).toMatch(
      /migration_number = 2[\s\S]*source_commit = :'source_commit'[\s\S]*migration_number = 3[\s\S]*source_commit = :'source_commit'[\s\S]*migration_number = 4[\s\S]*source_commit = :'source_commit'[\s\S]*migration_number = 5[\s\S]*source_commit = :'source_commit'[\s\S]*migration_number = 6[\s\S]*source_commit = :'source_commit'[\s\S]*migration_number = 7[\s\S]*source_commit = :'source_commit'[\s\S]*migration_number = 8[\s\S]*source_commit = :'source_commit'/
    );
    expect(additiveLedger).toContain('CHECK (migration_number IN (2, 3, 4, 5, 6, 7, 8))');
    expect(agenticBindingLedger).toContain(
      'CREATE TABLE IF NOT EXISTS workflow_v2_release.applied_additive_bindings'
    );
    expect(agenticBindingLedger).toContain(
      'REVOKE ALL ON workflow_v2_release.applied_additive_bindings FROM PUBLIC'
    );
    expect(agenticBindingLedger).toContain("'orqaly', 8, :'agentic_binding_path'");
    expect(agenticBindingLedger).toContain("bindings_sha256 = :'agentic_binding_checksum'");
    for (const script of [apply, verify, boundaries, bootstrap]) {
      expect(script).toContain('catalog-fingerprint.sql');
      expect(script).toMatch(/FULL_CATALOG_FINGERPRINT="[a-f0-9]{64}"/);
      const name =
        script === boundaries
          ? 'ORQALY_FULL_CATALOG_FINGERPRINT'
          : 'EXPECTED_FULL_CATALOG_FINGERPRINT';
      expect(shellConstant(script, name)).toBe(expectedFullFingerprint);
      const fileChecksumName =
        script === boundaries
          ? 'ORQALY_CATALOG_FINGERPRINT_FILE_CHECKSUM'
          : 'EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM';
      expect(shellConstant(script, fileChecksumName)).toBe(expectedCatalogFingerprintFileChecksum);
    }
    expect(shellConstant(apply, 'EXPECTED_PERSONAL_SESSION_CATALOG_FINGERPRINT')).toBe(
      expectedPersonalSessionFingerprint
    );
    expect(shellConstant(apply, 'EXPECTED_ASSISTANT_EVENTS_CATALOG_FINGERPRINT')).toBe(
      expectedEventsFingerprint
    );
    expect(shellConstant(apply, 'EXPECTED_ASSISTANT_TURN_PROVENANCE_CATALOG_FINGERPRINT')).toBe(
      expectedProvenanceFingerprint
    );
    expect(shellConstant(apply, 'EXPECTED_PRE_AGENTIC_EXECUTION_CATALOG_FINGERPRINT')).toBe(
      expectedPreAgenticExecutionFingerprint
    );
    for (const script of [apply, verify, bootstrap]) {
      expect(shellConstant(script, 'EXPECTED_ADDITIVE_MARKER_CHECKSUM')).toBe(
        expectedLedgerChecksum
      );
    }
    expect(apply).toMatch(/BASELINE_CATALOG_FINGERPRINT="[a-f0-9]{64}"/);
    expect(apply).toMatch(/ASSISTANT_CATALOG_FINGERPRINT="[a-f0-9]{64}"/);
    expect(apply).toContain('current_catalog_fingerprint="$(database_file_query)"');
    expect(catalogFingerprint).toContain("'postgresMajor', 16");
    expect(catalogFingerprint).toContain("extension.extname = 'pgcrypto'");
    expect(catalogFingerprint).toContain("'forceRowSecurity', relation.relforcerowsecurity");
    expect(catalogFingerprint).toContain("'definition', pg_catalog.pg_get_functiondef");
    expect(catalogFingerprint).toContain("'definition', pg_catalog.pg_get_triggerdef");
    expect(catalogFingerprint).toContain("'definition', pg_catalog.pg_get_constraintdef");
    expect(catalogFingerprint).toContain('pg_catalog.aclexplode(');
  });
});
