import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertInheritedIamSearch,
  normalizeAdminPrincipals,
} from './workflow-v2-effective-iam.mjs';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

function assetSearchResponse({ resource, bindings, permissionsByRole }) {
  return [
    {
      resource,
      policy: { bindings },
      explanation: {
        matchedPermissions: Object.fromEntries(
          Object.entries(permissionsByRole).map(([role, permissions]) => [role, { permissions }])
        ),
      },
    },
  ];
}

describe('workflow v2 Preview infrastructure safety', () => {
  it('pins Goose, capability work, Gemini, and TypeSafe JEV to their exact runtimes', () => {
    const provision = read('infra/gcp/workflow-v2/provision-preview.sh');
    const deploy = read('infra/gcp/workflow-v2/deploy-preview.sh');
    const runtime = read('infra/gcp/workflow-v2/verify-preview-runtime.sh');
    const secret = 'axwise-v2-preview-001-typesafe-api-key';
    const account = 'orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com';
    const binding =
      'TYPESAFE_API_KEY=axwise-v2-preview-001-typesafe-api-key:${TYPESAFE_API_KEY_SECRET_VERSION}';
    const geminiBinding =
      'ORQALY_GOOSE_GEMINI_API_KEY=axwise-v2-preview-001-gemini-api-key:${AXWISE_GEMINI_SECRET_VERSION}';

    expect(deploy).toContain(
      'TYPESAFE_API_KEY_SECRET_VERSION="${TYPESAFE_API_KEY_SECRET_VERSION:?numeric TypeSafe API-key secret version is required}"'
    );
    expect(deploy).toContain(`require_secret_version ${secret}`);
    expect(deploy).toContain(binding);
    expect(deploy.match(new RegExp(binding.replace(/[${}]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(deploy).toContain(geminiBinding);
    expect(deploy).toContain('ORQALY_GOOSE_ENABLED=true');
    expect(deploy).toContain('ORQALY_GOOSE_OAUTH_CLIENT_ID=UNciLDGl5PPmF9M8');
    expect(deploy.match(/ORQALY_CAPABILITY_WORK_ENABLED=true/g)).toHaveLength(2);
    expect(deploy).toContain('AXWISE_CAPABILITY_GENERATORS_ENABLED=false');
    expect(deploy).toContain('AXWISE_CAPABILITY_GENERATORS_ENABLED=true');
    const apiDeploy = deploy.split('gcloud run deploy orqaly-v2-api-preview \\\n')[1]
      .split('\nrecord_invocation_created_service orqaly-v2-api-preview')[0];
    const workerDeploy = deploy.split('gcloud run deploy orqaly-v2-worker-preview \\\n')[1]
      .split('\nrecord_invocation_created_service orqaly-v2-worker-preview')[0];
    for (const block of [apiDeploy, workerDeploy]) {
      expect(block).toContain('--update-env-vars=');
      expect(block).toContain('--update-secrets=');
      expect(block).not.toContain('--set-env-vars=');
      expect(block).not.toContain('--set-secrets=');
    }
    for (const service of ['axwise-v2-preview', 'axwise-v2-worker-preview']) {
      const block = deploy.split(`gcloud run deploy ${service} \\\n`)[1]
        .split(`\nrecord_invocation_created_service ${service}`)[0];
      expect(block).toContain('--set-env-vars=');
      expect(block).toContain('--set-secrets=');
      expect(block).not.toContain('--update-env-vars=');
      expect(block).not.toContain('--update-secrets=');
    }
    const webDeploy = deploy.split('gcloud run deploy orqaly-v2-web-preview \\\n')[1]
      .split('\nrecord_invocation_created_service orqaly-v2-web-preview')[0];
    expect(webDeploy).not.toContain('--set-env-vars=');
    expect(webDeploy).not.toContain('--update-env-vars=');
    expect(webDeploy).not.toContain('--set-secrets=');
    expect(webDeploy).not.toContain('--update-secrets=');
    expect(provision).toContain(`grant_secret_access ${secret} orqaly-v2-api-preview`);
    expect(provision).toContain(`grant_secret_access ${secret} axwise-v2-worker-preview`);
    expect(provision).toContain(
      'grant_secret_access axwise-v2-preview-001-gemini-api-key orqaly-v2-api-preview'
    );
    expect(provision).toContain(`assert_secret_service_accounts ${secret}`);
    expect(provision).toContain(`"${account}"`);
    expect(runtime).toContain(`assert_direct_secret_service_accounts ${secret}`);
    expect(runtime).toContain(
      `assert_secret_ref orqaly-v2-api-preview TYPESAFE_API_KEY ${secret} "\${TYPESAFE_API_KEY_SECRET_VERSION}"`
    );
    expect(runtime).toContain(
      `assert_secret_ref axwise-v2-worker-preview TYPESAFE_API_KEY ${secret} "\${TYPESAFE_API_KEY_SECRET_VERSION}"`
    );
    expect(runtime).toContain('assert_absent_env axwise-v2-preview TYPESAFE_API_KEY');
    expect(runtime).toContain(
      'assert_secret_ref orqaly-v2-api-preview ORQALY_GOOSE_GEMINI_API_KEY axwise-v2-preview-001-gemini-api-key "${AXWISE_GEMINI_SECRET_VERSION}"'
    );
    expect(runtime).toContain('assert_plain_env orqaly-v2-api-preview ORQALY_GOOSE_ENABLED true');
    expect(runtime).toContain(
      'assert_plain_env orqaly-v2-api-preview ORQALY_GOOSE_OAUTH_CLIENT_ID UNciLDGl5PPmF9M8'
    );
    expect(runtime.match(/assert_plain_env orqaly-v2-(?:api|worker)-preview ORQALY_CAPABILITY_WORK_ENABLED true/g)).toHaveLength(2);
    expect(runtime).toContain(
      'assert_plain_env axwise-v2-preview AXWISE_CAPABILITY_GENERATORS_ENABLED false'
    );
    expect(runtime).toContain(
      'assert_plain_env axwise-v2-worker-preview AXWISE_CAPABILITY_GENERATORS_ENABLED true'
    );
  });

  it('admits native editor asset bursts without adding warm API instances or widening worker concurrency', () => {
    const deploy = read('infra/gcp/workflow-v2/deploy-preview.sh');
    const runtime = read('infra/gcp/workflow-v2/verify-preview-runtime.sh');
    const block = (service) => {
      const starts = deploy.split(`gcloud run deploy ${service} \\\n`);
      expect(starts).toHaveLength(2);
      const ends = starts[1].split(`\nrecord_invocation_created_service ${service}\n`);
      expect(ends).toHaveLength(2);
      return ends[0];
    };
    const api = block('orqaly-v2-api-preview');
    for (const flag of ['--concurrency=80', '--cpu=1', '--memory=512Mi', '--min=0', '--max=4']) {
      expect(api.split('\n').map((line) => line.trim())).toContain(`${flag} \\`);
    }
    for (const [service, concurrency] of [
      ['axwise-v2-preview', 20],
      ['axwise-v2-worker-preview', 1],
      ['orqaly-v2-worker-preview', 1],
      ['orqaly-v2-web-preview', 80],
    ]) {
      expect(block(service).match(/--concurrency=\d+/g)).toEqual([`--concurrency=${concurrency}`]);
    }
    expect(api.match(/--concurrency=\d+/g)).toEqual(['--concurrency=80']);
    expect(runtime).toContain(
      '"orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" all 80 0 4 true true'
    );
    expect(runtime).toContain(
      '"axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" internal 1 1 1 false true \\\n  1 1Gi'
    );
  });

  it('accepts only explicit user admins because IAM search cannot expand groups', () => {
    expect(normalizeAdminPrincipals('user:admin@example.com,user:ops@example.com')).toBe(
      'user:admin@example.com,user:ops@example.com'
    );
    expect(() => normalizeAdminPrincipals('allUsers')).toThrow(/explicit user/);
    expect(() => normalizeAdminPrincipals('group:ops@example.com')).toThrow(/cannot expand groups/);
    expect(() =>
      normalizeAdminPrincipals('serviceAccount:legacy@example.iam.gserviceaccount.com')
    ).toThrow(/explicit user/);
    expect(() => normalizeAdminPrincipals('user:a@example.com, user:b@example.com')).toThrow(
      /without whitespace/
    );
  });

  it('checks one ancestor search with exact workload and platform trust boundaries', () => {
    const resource = '//cloudresourcemanager.googleapis.com/projects/axwise-v2-preview-001';
    const ancestors = JSON.stringify([
      resource,
      '//cloudresourcemanager.googleapis.com/organizations/150415609495',
    ]);
    const worker =
      'serviceAccount:orqaly-v2-worker-preview@axwise-v2-preview-001.iam.gserviceaccount.com';
    const runAgent =
      'serviceAccount:service-161074549006@serverless-robot-prod.iam.gserviceaccount.com';
    const schedulerAgent =
      'serviceAccount:service-161074549006@gcp-sa-cloudscheduler.iam.gserviceaccount.com';
    const rules = {
      'iam.serviceAccounts.getAccessToken': [],
      'run.routes.invoke': [],
      'run.services.update': [],
      'storage.objects.create': [worker],
    };
    const trusted = {
      'roles/cloudscheduler.serviceAgent': [schedulerAgent],
      'roles/run.serviceAgent': [runAgent],
    };
    const bucket = '//storage.googleapis.com/axwise-v2-preview-001-orqaly-v2-preview-001-artifacts';
    const directPolicies = {
      [bucket]: [
        { role: 'roles/storage.objectCreator', members: [worker] },
        { role: 'roles/storage.objectViewer', members: [worker] },
      ],
    };
    const options = {
      ancestorResources: ancestors,
      directPolicies,
      permissionRules: rules,
      trustedPlatformBindings: trusted,
      adminMembers: 'user:admin@example.com',
    };
    const expected = assetSearchResponse({
      resource,
      bindings: [
        { role: 'roles/owner', members: ['user:admin@example.com'] },
        { role: 'roles/run.serviceAgent', members: [runAgent] },
        { role: 'roles/cloudscheduler.serviceAgent', members: [schedulerAgent] },
        { role: 'roles/storage.objectCreator', members: [worker] },
      ],
      permissionsByRole: {
        'roles/owner': ['run.services.update'],
        'roles/run.serviceAgent': ['run.routes.invoke'],
        'roles/cloudscheduler.serviceAgent': ['iam.serviceAccounts.getAccessToken'],
        'roles/storage.objectCreator': ['storage.objects.create'],
      },
    });
    expected.push({ resource: bucket, policy: { bindings: directPolicies[bucket] } });
    expect(assertInheritedIamSearch(expected, options)).toEqual({
      'iam.serviceAccounts.getAccessToken': [schedulerAgent],
      'run.routes.invoke': [runAgent],
      'run.services.update': ['user:admin@example.com'],
      'storage.objects.create': [worker],
    });

    const inheritedLegacy = structuredClone(expected);
    inheritedLegacy[0].policy.bindings.push({
      role: 'roles/run.invoker',
      members: ['serviceAccount:legacy-worker@axwise-v2-preview-001.iam.gserviceaccount.com'],
    });
    inheritedLegacy[0].explanation.matchedPermissions['roles/run.invoker'] = {
      permissions: ['run.routes.invoke'],
    };
    expect(() => assertInheritedIamSearch(inheritedLegacy, options)).toThrow(
      /unexpected inherited principal/
    );

    const wrongPlatformRole = structuredClone(expected);
    wrongPlatformRole[0].policy.bindings[1].role = 'roles/editor';
    wrongPlatformRole[0].explanation.matchedPermissions['roles/editor'] =
      wrongPlatformRole[0].explanation.matchedPermissions['roles/run.serviceAgent'];
    delete wrongPlatformRole[0].explanation.matchedPermissions['roles/run.serviceAgent'];
    expect(() => assertInheritedIamSearch(wrongPlatformRole, options)).toThrow(
      /unexpected inherited principal/
    );

    const broadDefaultBuilder = assetSearchResponse({
      resource,
      bindings: [
        {
          role: 'roles/cloudbuild.builds.builder',
          members: ['serviceAccount:161074549006@cloudbuild.gserviceaccount.com'],
        },
      ],
      permissionsByRole: {
        'roles/cloudbuild.builds.builder': ['storage.objects.create'],
      },
    });
    expect(() => assertInheritedIamSearch(broadDefaultBuilder, options)).toThrow(
      /cloudbuild\.gserviceaccount\.com/
    );

    const unresolvedCustomRole = assetSearchResponse({
      resource,
      bindings: [
        {
          role: 'projects/axwise-v2-preview-001/roles/opaque',
          members: ['user:admin@example.com'],
        },
      ],
      permissionsByRole: {
        'projects/axwise-v2-preview-001/roles/opaque': ['run.services.update'],
      },
    });
    expect(() => assertInheritedIamSearch(unresolvedCustomRole, options)).toThrow(
      /unresolved custom role/
    );

    const unresolvedCondition = structuredClone(expected);
    unresolvedCondition[0].policy.bindings[0].condition = {
      expression: 'request.time < timestamp("2030-01-01T00:00:00Z")',
    };
    expect(() => assertInheritedIamSearch(unresolvedCondition, options)).toThrow(
      /unresolved IAM condition/
    );

    const escapedScope = structuredClone(expected);
    escapedScope[0].resource = '//cloudresourcemanager.googleapis.com/projects/legacy';
    expect(() => assertInheritedIamSearch(escapedScope, options)).toThrow(
      /escaped the exact ancestor scope/
    );

    const legacyBucketAlias = structuredClone(expected);
    legacyBucketAlias[1].policy.bindings.push({
      role: 'roles/storage.legacyBucketOwner',
      members: ['projectOwner:axwise-v2-preview-001'],
    });
    expect(() => assertInheritedIamSearch(legacyBucketAlias, options)).toThrow(
      /not an exact unconditional workload binding/
    );

    expect(() => assertInheritedIamSearch(expected.slice(0, 1), options)).toThrow(
      /omitted direct policies/
    );

    const liveBucketPolicy = {
      [bucket]: [
        {
          role: 'roles/storage.legacyBucketOwner',
          members: ['projectEditor:axwise-v2-preview-001', 'projectOwner:axwise-v2-preview-001'],
        },
        {
          role: 'roles/storage.legacyBucketReader',
          members: ['projectViewer:axwise-v2-preview-001'],
        },
        {
          role: 'roles/storage.legacyObjectOwner',
          members: ['projectEditor:axwise-v2-preview-001', 'projectOwner:axwise-v2-preview-001'],
        },
        {
          role: 'roles/storage.legacyObjectReader',
          members: ['projectViewer:axwise-v2-preview-001'],
        },
        ...directPolicies[bucket],
      ],
    };
    const authoritativeOptions = {
      ...options,
      authoritativeDirectPolicies: liveBucketPolicy,
      authoritativeWorkloadMembers: [
        worker,
        'serviceAccount:orqaly-v2-api-preview@axwise-v2-preview-001.iam.gserviceaccount.com',
      ],
    };
    expect(assertInheritedIamSearch(expected.slice(0, 1), authoritativeOptions)).toEqual({
      'iam.serviceAccounts.getAccessToken': [schedulerAgent],
      'run.routes.invoke': [runAgent],
      'run.services.update': ['user:admin@example.com'],
      'storage.objects.create': [worker],
    });

    const malformedCloudAssetCopy = structuredClone(expected);
    malformedCloudAssetCopy[1].policy.bindings[0].condition = {
      expression: 'request.time < timestamp("2030-01-01T00:00:00Z")',
    };
    expect(() => assertInheritedIamSearch(malformedCloudAssetCopy, authoritativeOptions)).toThrow(
      /not an exact unconditional workload binding/
    );

    const unexpectedAuthoritativeBinding = structuredClone(liveBucketPolicy);
    unexpectedAuthoritativeBinding[bucket].push({
      role: 'roles/storage.insightsCollectorService',
      members: [worker],
    });
    expect(() =>
      assertInheritedIamSearch(expected.slice(0, 1), {
        ...options,
        authoritativeDirectPolicies: unexpectedAuthoritativeBinding,
        authoritativeWorkloadMembers: authoritativeOptions.authoritativeWorkloadMembers,
      })
    ).toThrow(/authoritative direct policy .* differs from the allowlist/);
  });

  it('pins the Cloud Scheduler service agent to its exact project-number role pair', () => {
    const runtime = read('infra/gcp/workflow-v2/verify-preview-runtime.sh');
    expect(runtime).toContain(
      'service-${project_number}@gcp-sa-cloudscheduler.iam.gserviceaccount.com'
    );
    expect(runtime).toContain('"roles/cloudscheduler.serviceAgent": [$cloudScheduler]');
  });

  it('requires build proof before mutation and restores all traffic on a failed cutover', () => {
    const deploy = read('infra/gcp/workflow-v2/deploy-preview.sh');
    const build = read('infra/gcp/workflow-v2/build-preview-images.sh');
    const runtime = read('infra/gcp/workflow-v2/verify-preview-runtime.sh');
    const origins = read('infra/gcp/workflow-v2/resolve-preview-origins.sh');
    const proof = deploy.indexOf('workflow-v2-verify-build-attestation.mjs');
    const firstMutation = deploy.indexOf('gcloud run deploy axwise-v2-preview');
    const uniformFleetPresence = deploy.indexOf(
      'Preview fleet presence must be uniformly all-present or all-absent before cutover.'
    );
    expect(proof).toBeGreaterThan(0);
    expect(proof).toBeLessThan(firstMutation);
    expect(uniformFleetPresence).toBeGreaterThan(proof);
    expect(uniformFleetPresence).toBeLessThan(firstMutation);
    expect(deploy).toContain('rollback_required=true');
    expect(deploy).toContain('restore_previous_traffic');
    expect(deploy).toContain('candidate_traffic_option');
    expect(deploy).toContain('map(select((.percent // 0) > 0))');
    expect(deploy).not.toContain('and ((.tag // "") == "")');
    expect(deploy).toContain('ensure_orqaly_direct_vpc_all_traffic_egress');
    expect(deploy).toContain('gcloud run revisions describe "${created}"');
    expect(deploy).toContain('.type == "Ready" and .status == "True"');
    expect(deploy).toContain('Cloud Run cannot');
    expect(deploy.match(/--no-invoker-iam-check/g)).toHaveLength(2);
    expect(deploy.match(/--invoker-iam-check/g)).toHaveLength(3);
    expect(deploy).not.toContain('RUNTIME_ATTESTATION_OUTPUT= REQUIRE_LATEST_TRAFFIC=false');
    expect(deploy).toContain('run.googleapis.com/urls');
    expect(runtime).toContain('run.googleapis.com/invoker-iam-disabled');
    expect(runtime).toContain('run.googleapis.com/urls');
    expect(runtime).toContain('$requireTraffic == "false" or (');
    expect(runtime).toContain('1 512Mi "${ORQALY_WEB_ORIGIN}"');
    expect(deploy).toContain('--to-revisions="${revision}=100"');
    expect(deploy).not.toContain('--to-latest');
    expect(deploy).toContain('disable_worker_service "${service}"');
    expect(deploy).toContain('--scaling=0');
    expect(deploy).toContain('--scaling=auto --min=1 --max=1');
    expect(deploy).toContain('run.googleapis.com/container/instance_count');
    expect(deploy).toContain('--header "Authorization: Bearer ${access_token}"');
    expect(deploy).not.toContain('--header="Authorization: Bearer ${access_token}"');
    expect(deploy).toContain('.metric.labels.state == $state');
    expect(deploy).toContain('wait_for_traffic_map_zero_instances "${service}"');
    expect(deploy).toContain('wait_for_revision_instance_state axwise-v2-worker-preview');
    expect(deploy).toContain('wait_for_revision_instance_state orqaly-v2-worker-preview');
    expect(deploy).toContain('restoring the safe rollback traffic floor');
    const disableWorkers = deploy.indexOf(
      'for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do\n' +
        '  disable_worker_service "${service}"'
    );
    const drainWorkers = deploy.indexOf(
      'wait_for_traffic_map_zero_instances "${service}"',
      disableWorkers
    );
    const promoteAxwiseApi = deploy.indexOf(
      'promote_candidate_revision axwise-v2-preview',
      drainWorkers
    );
    const consumerFloorMarker = deploy.indexOf('mkdir "${consumer_floor_marker}"');
    const startAxwiseWorker = deploy.indexOf(
      'enable_worker_service axwise-v2-worker-preview',
      consumerFloorMarker
    );
    const startOrqalyWorker = deploy.indexOf(
      'enable_worker_service orqaly-v2-worker-preview',
      promoteAxwiseApi
    );
    const promoteOrqalyApi = deploy.indexOf(
      'promote_candidate_revision orqaly-v2-api-preview',
      startOrqalyWorker
    );
    const promoteWeb = deploy.indexOf(
      'promote_candidate_revision orqaly-v2-web-preview',
      promoteOrqalyApi
    );
    expect(disableWorkers).toBeGreaterThan(0);
    expect(drainWorkers).toBeGreaterThan(disableWorkers);
    expect(consumerFloorMarker).toBeGreaterThan(drainWorkers);
    expect(startAxwiseWorker).toBeGreaterThan(consumerFloorMarker);
    expect(promoteAxwiseApi).toBeGreaterThan(drainWorkers);
    expect(startOrqalyWorker).toBeGreaterThan(promoteAxwiseApi);
    expect(promoteOrqalyApi).toBeGreaterThan(startOrqalyWorker);
    expect(promoteWeb).toBeGreaterThan(promoteOrqalyApi);
    const postSnapshotCutover = deploy.slice(
      deploy.indexOf('rollback_required=true'),
      deploy.indexOf('rollback_required=false', deploy.indexOf('rollback_required=true'))
    );
    expect(postSnapshotCutover).not.toContain(
      'printf present >"${traffic_state_directory}/${service}.state"'
    );
    expect(postSnapshotCutover).not.toContain(
      '>"${traffic_state_directory}/${service}.before"'
    );
    expect(deploy).toContain('test -d "${consumer_floor_marker}" && retain_consumer_floor=true');
    expect(deploy).toContain(
      'for service in orqaly-v2-api-preview orqaly-v2-web-preview; do'
    );
    for (const service of [
      'axwise-v2-preview',
      'axwise-v2-worker-preview',
      'orqaly-v2-api-preview',
      'orqaly-v2-worker-preview',
      'orqaly-v2-web-preview',
    ]) {
      expect(deploy).toContain(service);
    }
    expect(deploy).toContain(
      'capture_traffic "${service}" >"${traffic_state_directory}/${service}.before"'
    );
    expect(deploy).toContain('expected_service_origin');
    expect(deploy).toContain('AXWISE_SEARCH_URL="${AXWISE_SEARCH_URL:?');
    expect(deploy).toContain('assert_private_search_service');
    expect(deploy).toContain('.status.url == $origin');
    expect(deploy).toContain('AXWISE_SEARCH_SERVICE="axwise-v2-search-preview"');
    expect(deploy).toContain('--project="${PROJECT_ID}" --region="${REGION}" --format=json');
    expect(deploy).toContain(
      'serviceAccount:axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com'
    );
    const searchPreflight = deploy.lastIndexOf('\nassert_private_search_service\n');
    expect(searchPreflight).toBeGreaterThan(0);
    expect(searchPreflight).toBeLessThan(firstMutation);
    expect(runtime).toContain('AXWISE_SEARCH_URL="${AXWISE_SEARCH_URL:?');
    expect(runtime).toContain('assert_search_service_origin');
    expect(runtime).toContain('assert_run_invokers axwise-v2-search-preview');
    expect(runtime).toContain(
      'assert_plain_env axwise-v2-worker-preview SEARXNG_URL "${AXWISE_SEARCH_URL}"'
    );
    expect(runtime).toContain(
      'assert_plain_env axwise-v2-worker-preview SEARXNG_AUTH_MODE google_identity'
    );
    const axwiseWorkerDeploy = deploy.slice(
      deploy.indexOf('gcloud run deploy axwise-v2-worker-preview'),
      deploy.indexOf('record_invocation_created_service axwise-v2-worker-preview')
    );
    expect(axwiseWorkerDeploy.match(/--set-env-vars=/g)).toHaveLength(1);
    expect(axwiseWorkerDeploy).toContain('SEARXNG_URL=${AXWISE_SEARCH_URL}');
    expect(axwiseWorkerDeploy).toContain('SEARXNG_AUTH_MODE=google_identity');
    const orqalyApiDeploy = deploy.slice(
      deploy.indexOf('gcloud run deploy orqaly-v2-api-preview'),
      deploy.indexOf('assert_service_creation_precondition orqaly-v2-worker-preview')
    );
    expect(orqalyApiDeploy).toContain('--network="${VPC_NETWORK}"');
    expect(orqalyApiDeploy).toContain('--subnet="${VPC_SUBNET}"');
    expect(orqalyApiDeploy).toContain('--vpc-egress=all-traffic');
    expect(orqalyApiDeploy).not.toContain('--clear-network');
    expect(orqalyApiDeploy).not.toContain('--clear-vpc-connector');
    expect(orqalyApiDeploy).toContain(
      'ensure_orqaly_direct_vpc_all_traffic_egress orqaly-v2-api-preview 0 4 true'
    );
    expect(deploy).toContain(
      'ensure_orqaly_direct_vpc_all_traffic_egress orqaly-v2-worker-preview 1 1 false'
    );
    expect(runtime).toContain('for service in orqaly-v2-api-preview orqaly-v2-worker-preview; do');
    const noVpcBindingCall = runtime.indexOf('assert_no_vpc_binding "${service}"');
    const noVpcBindingLoop = runtime.slice(
      runtime.lastIndexOf('for service in', noVpcBindingCall),
      noVpcBindingCall
    );
    expect(noVpcBindingLoop).not.toContain('orqaly-v2-api-preview');
    expect(build).toContain('expected_api_origin="https://${api_dns_label}.${REGION}.run.app"');
    expect(origins).toContain("printf 'ORQALY_API_ORIGIN=%s\\n'");
    expect(origins).not.toContain('gcloud run deploy');
  });

  it('pins connector-only SQL, fresh baselines, trusted bootstrap bytes and Clerk bindings', () => {
    const provision = read('infra/gcp/workflow-v2/provision-preview.sh');
    const build = read('infra/gcp/workflow-v2/build-preview-images.sh');
    const runtime = read('infra/gcp/workflow-v2/verify-preview-runtime.sh');
    const apply = read('infra/gcp/workflow-v2/apply-preview-schema.sh');
    const bootstrap = read('infra/gcp/workflow-v2/bootstrap-preview-tenant.sh');
    const bootstrapSql = read('infra/gcp/workflow-v2/bootstrap-preview-tenant.sql');
    const additiveLedger = read('infra/gcp/workflow-v2/record-additive-migrations.sql');
    const catalogFingerprint = read('infra/gcp/workflow-v2/catalog-fingerprint.sql');
    const personalSessionMigration = read(
      'database/workflow-v2/migrations/003_personal_tenant_jit.sql'
    );
    const assistantRetryMigration = read(
      'database/workflow-v2/migrations/004_assistant_retry_lineage.sql'
    );
    const assistantEventsMigration = read(
      'database/workflow-v2/migrations/005_assistant_turn_events.sql'
    );
    const assistantTurnProvenanceMigration = read(
      'database/workflow-v2/migrations/006_assistant_turn_provenance.sql'
    );
    const assistantGroundedSourcesReasonMigration = read(
      'database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql'
    );
    const agenticExecutionMigration = read(
      'database/workflow-v2/migrations/008_agentic_execution_preview.sql'
    );
    const agenticRoleBindings = read(
      'infra/gcp/workflow-v2/agentic-preview-role-bindings.sql'
    );
    const releaseTest = read('infra/gcp/workflow-v2/verify-preview-cloudsql.sh');
    expect(provision).toContain('--connector-enforcement=REQUIRED');
    expect(provision).toContain('--clear-authorized-networks');
    expect(provision).toContain('ensure_sql_login');
    expect(provision).toContain('REVOKE cloudsqlsuperuser FROM ${username}');
    expect(provision).toContain('NOCREATEDB NOCREATEROLE NOINHERIT');
    expect(provision).toContain(
      'rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls'
    );
    expect(provision).toContain('--no-password --set=ON_ERROR_STOP=1 --file=-');
    expect(provision).not.toContain('gcloud sql users create');
    expect(provision).toContain('BUILD_SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"');
    expect(provision).toContain('--role=roles/storage.objectViewer');
    expect(build).toContain('--gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source"');
    expect(build.match(/--ignore-file=\/dev\/null/g)).toHaveLength(3);
    expect(build).toContain('orqaly-service:${orqaly_short}-${axwise_short}');
    expect(build).toContain('axwise-service:${axwise_short}-${orqaly_short}');
    const attestationGenerator = read('scripts/workflow-v2-gcp-attestation.mjs');
    expect(attestationGenerator).toContain(
      '${orqalyCommit.slice(0, 12)}-${axwiseCommit.slice(0, 12)}'
    );
    expect(attestationGenerator).toContain(
      '${axwiseCommit.slice(0, 12)}-${orqalyCommit.slice(0, 12)}'
    );
    for (const constraint of [
      'constraints/compute.skipDefaultNetworkCreation',
      'constraints/iam.automaticIamGrantsForDefaultServiceAccounts',
      'constraints/iam.disableServiceAccountKeyCreation',
      'constraints/iam.disableServiceAccountKeyUpload',
    ]) {
      expect(provision).toContain(constraint);
      expect(runtime).toContain(constraint);
    }
    expect(provision).toContain('gcloud compute networks delete default');
    expect(runtime).toContain('test "${network_names}" = workflow-v2-preview');
    expect(runtime).toContain('.settings.connectorEnforcement == "REQUIRED"');
    expect(runtime).toContain('gcloud asset search-all-iam-policies');
    expect(runtime).not.toContain('gcloud asset analyze-iam-policy');
    expect(runtime.match(/search-all-iam-policies/g)).toHaveLength(1);
    expect(runtime).not.toContain('"roles/cloudbuild.builds.builder"');
    expect(runtime).toContain('all(.bindings[]?; .role == "roles/run.invoker"');
    expect(runtime).toContain('gcloud storage buckets get-iam-policy');
    expect(runtime).toContain('--direct-policies "${direct_policies_json}"');
    expect(runtime).toContain(
      '--authoritative-direct-policies "${authoritative_direct_policies_json}"'
    );
    expect(runtime).toContain('--authoritative-workload-members "${v2_members_json}"');
    expect(runtime).toContain('{($bucket): ($policy.bindings // [])}');
    expect(runtime).toContain('{role: "roles/storage.objectCreator", members: [$worker]}');
    expect(runtime).toContain('{role: "roles/storage.objectViewer", members: [$worker]}');
    expect(runtime).toContain('Artifact Registry has an unexpected direct IAM binding.');
    expect(runtime).toContain('service account has an unexpected direct IAM binding.');
    expect(apply).toContain('target database is neither fresh nor exactly marked');
    expect(apply).toContain('stage_migration()');
    expect(apply).toContain('stage_exact_file()');
    expect(apply).not.toContain('--file=<(');
    expect(releaseTest).not.toContain('--file=<(');
    expect(apply).toContain(
      'Exact Orqaly Preview schema and additive migration ledger are already applied'
    );
    expect(apply).toContain('EXPECTED_ASSISTANT_NOINHERIT_CATALOG_FINGERPRINT');
    expect(apply).toContain('EXPECTED_PRE_AGENTIC_EXECUTION_CATALOG_FINGERPRINT');
    expect(apply).toContain(
      'AGENTIC_EXECUTION_MIGRATION_PATH="database/workflow-v2/migrations/008_agentic_execution_preview.sql"'
    );
    expect(apply).toContain(
      'AGENTIC_BINDINGS_PATH="infra/gcp/workflow-v2/agentic-preview-role-bindings.sql"'
    );
    expect(apply).toContain(
      '"${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" agentic-execution-008'
    );
    expect(apply).toContain(
      '"${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" agentic-role-bindings'
    );
    expect(apply).toContain('--file="${staged_agentic_execution}"');
    expect(apply).toContain('--file="${staged_agentic_bindings}"');
    expect(apply).toContain('workflow_v2_release.applied_additive_bindings');
    expect(
      personalSessionMigration.match(/WITH ADMIN FALSE, INHERIT TRUE, SET TRUE/g)
    ).toHaveLength(3);
    expect(bootstrap).toContain('status --porcelain=v1 --untracked-files=all');
    expect(bootstrap).toContain('git -C "${REPOSITORY_ROOT}" show "HEAD:./${path}"');
    expect(bootstrap).toContain('applied Preview baseline marker differs from exact HEAD');
    expect(bootstrap).toContain(
      'PERSONAL_SESSION_MIGRATION_PATH="database/workflow-v2/migrations/003_personal_tenant_jit.sql"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${PERSONAL_SESSION_MIGRATION_PATH}" "${EXPECTED_PERSONAL_SESSION_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'ASSISTANT_RETRY_MIGRATION_PATH="database/workflow-v2/migrations/004_assistant_retry_lineage.sql"'
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
      'AGENTIC_EXECUTION_MIGRATION_PATH="database/workflow-v2/migrations/008_agentic_execution_preview.sql"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${AGENTIC_EXECUTION_MIGRATION_PATH}" "${EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM}"'
    );
    expect(bootstrap).toContain(
      'AGENTIC_BINDINGS_PATH="infra/gcp/workflow-v2/agentic-preview-role-bindings.sql"'
    );
    expect(bootstrap).toContain(
      'assert_exact_head_file "${AGENTIC_BINDINGS_PATH}" "${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}"'
    );
    expect(bootstrap).toContain('workflow_v2_release.applied_additive_migrations');
    expect(bootstrap).toContain(
      'expected_additives="2:${ASSISTANT_MIGRATION_PATH}:${EXPECTED_ASSISTANT_MIGRATION_CHECKSUM}:${source_commit},3:${PERSONAL_SESSION_MIGRATION_PATH}:${EXPECTED_PERSONAL_SESSION_MIGRATION_CHECKSUM}:${source_commit},4:${ASSISTANT_RETRY_MIGRATION_PATH}:${EXPECTED_ASSISTANT_RETRY_MIGRATION_CHECKSUM}:${source_commit},5:${ASSISTANT_EVENTS_MIGRATION_PATH}:${EXPECTED_ASSISTANT_EVENTS_MIGRATION_CHECKSUM}:${source_commit},6:${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}:${EXPECTED_ASSISTANT_TURN_PROVENANCE_MIGRATION_CHECKSUM}:${source_commit},7:${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}:${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_CHECKSUM}:${source_commit},8:${AGENTIC_EXECUTION_MIGRATION_PATH}:${EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM}:${source_commit}"'
    );
    expect(bootstrap).toContain('workflow_v2_release.applied_additive_bindings');
    expect(bootstrap).toContain(
      'expected_agentic_binding="8:${AGENTIC_BINDINGS_PATH}:${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}:${source_commit}"'
    );
    expect(bootstrap).toContain(
      'Refusing bootstrap: Agentic role-binding marker differs from exact HEAD.'
    );
    expect(bootstrapSql).toContain(
      "FROM orqaly.ensure_personal_tenant('preview', :'clerk_user_id')"
    );
    expect(bootstrapSql).not.toContain('resolve_tenant_identity');
    expect(bootstrap).not.toContain('CLERK_ORGANIZATION_ID');
    expect(additiveLedger).toContain('migration_number integer NOT NULL');
    expect(additiveLedger).toContain('CHECK (migration_number IN (2, 3, 4, 5, 6, 7, 8))');
    expect(additiveLedger).toContain(
      'DROP CONSTRAINT IF EXISTS applied_additive_migrations_migration_number_check'
    );
    expect(additiveLedger).toMatch(
      /'orqaly', 2, :'assistant_migration_path',[\s\S]*'orqaly', 3, :'personal_session_migration_path',[\s\S]*'orqaly', 4, :'assistant_retry_migration_path',[\s\S]*'orqaly', 5, :'assistant_events_migration_path',[\s\S]*'orqaly', 6, :'assistant_turn_provenance_migration_path',[\s\S]*'orqaly', 7, :'assistant_grounded_sources_reason_migration_path',[\s\S]*'orqaly', 8, :'agentic_execution_migration_path'/
    );
    expect(additiveLedger).toContain('ON CONFLICT (component, migration_number) DO UPDATE');
    expect(additiveLedger).toContain(
      'WHERE workflow_v2_release.applied_additive_migrations.migration_path = EXCLUDED.migration_path'
    );
    expect(additiveLedger).toContain(
      'AND workflow_v2_release.applied_additive_migrations.sha256 = EXCLUDED.sha256'
    );
    expect(additiveLedger).toContain('COUNT(*) = 7');
    expect(additiveLedger).toContain('first_applied_source_commit text NOT NULL');
    expect(additiveLedger).toContain('verified_at timestamptz NOT NULL');
    expect(additiveLedger.match(/COUNT\(\*\) FILTER \(/g)).toHaveLength(7);
    expect(additiveLedger).toMatch(
      /migration_number = 2[\s\S]*migration_path = :'assistant_migration_path'[\s\S]*sha256 = :'assistant_migration_checksum'/
    );
    expect(additiveLedger).toMatch(
      /migration_number = 3[\s\S]*migration_path = :'personal_session_migration_path'[\s\S]*sha256 = :'personal_session_migration_checksum'/
    );
    expect(additiveLedger).toMatch(
      /migration_number = 4[\s\S]*migration_path = :'assistant_retry_migration_path'[\s\S]*sha256 = :'assistant_retry_migration_checksum'/
    );
    expect(additiveLedger).toMatch(
      /migration_number = 5[\s\S]*migration_path = :'assistant_events_migration_path'[\s\S]*sha256 = :'assistant_events_migration_checksum'/
    );
    expect(additiveLedger).toMatch(
      /migration_number = 6[\s\S]*migration_path = :'assistant_turn_provenance_migration_path'[\s\S]*sha256 = :'assistant_turn_provenance_migration_checksum'/
    );
    expect(additiveLedger).toMatch(
      /migration_number = 7[\s\S]*migration_path = :'assistant_grounded_sources_reason_migration_path'[\s\S]*sha256 = :'assistant_grounded_sources_reason_migration_checksum'/
    );
    expect(additiveLedger).toMatch(
      /migration_number = 8[\s\S]*migration_path = :'agentic_execution_migration_path'[\s\S]*sha256 = :'agentic_execution_migration_checksum'/
    );
    expect(assistantRetryMigration).toContain('ADD COLUMN retry_of_turn_id uuid NULL');
    expect(assistantRetryMigration).toContain('assistant_messages_retry_child_idx');
    expect(assistantEventsMigration).toContain('CREATE TABLE orqaly.assistant_turn_events');
    expect(assistantEventsMigration).toContain('event_payload jsonb NOT NULL');
    expect(assistantTurnProvenanceMigration).toContain('ADD COLUMN requested_intent text NULL');
    expect(assistantTurnProvenanceMigration).toContain(
      'ADD CONSTRAINT assistant_messages_route_provenance_check'
    );
    expect(assistantTurnProvenanceMigration).not.toMatch(
      /\bUPDATE\s+orqaly\.assistant_messages\b/i
    );
    expect(assistantGroundedSourcesReasonMigration).toContain(
      'DROP CONSTRAINT assistant_messages_route_provenance_check'
    );
    expect(assistantGroundedSourcesReasonMigration).toContain(
      'ADD CONSTRAINT assistant_messages_route_provenance_check'
    );
    expect(assistantGroundedSourcesReasonMigration).toContain("'grounded_sources_requested'");
    expect(assistantGroundedSourcesReasonMigration).not.toMatch(
      /\bUPDATE\s+orqaly\.assistant_messages\b/i
    );
    expect(agenticExecutionMigration).toContain(
      'CREATE ROLE orqaly_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT'
    );
    for (const table of [
      'executable_actions',
      'agentic_gateway_grants',
      'agentic_operational_records',
      'agentic_gateway_effects',
    ]) {
      expect(agenticExecutionMigration).toContain(
        `ALTER TABLE orqaly.${table} ENABLE ROW LEVEL SECURITY`
      );
      expect(agenticExecutionMigration).toContain(
        `ALTER TABLE orqaly.${table} FORCE ROW LEVEL SECURITY`
      );
    }
    expect(agenticExecutionMigration).toContain(
      'BEFORE UPDATE OR DELETE ON orqaly.agentic_operational_records'
    );
    expect(agenticExecutionMigration).toContain(
      'BEFORE UPDATE OR DELETE ON orqaly.agentic_gateway_effects'
    );
    expect(agenticExecutionMigration).toContain(
      'GRANT SELECT, INSERT, UPDATE ON orqaly.executable_actions TO orqaly_api'
    );
    expect(agenticExecutionMigration).toContain(
      'GRANT SELECT, INSERT ON orqaly.agentic_gateway_grants TO orqaly_api'
    );
    expect(agenticExecutionMigration).toContain('SECURITY DEFINER');
    expect(agenticExecutionMigration).toContain(
      'REVOKE ALL ON FUNCTION orqaly.redeem_agentic_gateway_grant('
    );
    expect(agenticExecutionMigration).toMatch(
      /GRANT EXECUTE ON FUNCTION orqaly\.redeem_agentic_gateway_grant\([\s\S]*\) TO orqaly_gateway;/
    );
    expect(agenticExecutionMigration).toContain(
      'GRANT SELECT, INSERT ON orqaly.agentic_operational_records TO orqaly_gateway'
    );
    expect(agenticExecutionMigration).toContain(
      'GRANT SELECT, INSERT ON orqaly.agentic_gateway_effects TO orqaly_gateway'
    );
    expect(agenticExecutionMigration.match(/TO orqaly_gateway\n[\s\S]{0,80}tenant_id = orqaly\.current_tenant_id\(\)/g)).toHaveLength(2);
    expect(agenticRoleBindings).toContain(
      '\\getenv gateway_password ORQALY_GATEWAY_DB_PASSWORD_VALUE'
    );
    expect(agenticRoleBindings).toContain(
      'CREATE ROLE orqaly_v2_001_gateway_login\n      NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT'
    );
    expect(agenticRoleBindings).toContain(
      "ALTER ROLE orqaly_v2_001_gateway_login WITH\n  LOGIN PASSWORD :'gateway_password'\n  NOCREATEDB NOCREATEROLE NOINHERIT"
    );
    expect(agenticRoleBindings).not.toMatch(
      /ALTER ROLE orqaly_v2_001_gateway_login WITH[\s\S]{0,160}(?:NOSUPERUSER|NOBYPASSRLS)/
    );
    expect(agenticRoleBindings).toContain(
      'REVOKE cloudsqlsuperuser FROM orqaly_v2_001_gateway_login'
    );
    expect(agenticRoleBindings).toContain(
      'GRANT orqaly_gateway TO orqaly_v2_001_gateway_login\n  WITH ADMIN FALSE, INHERIT TRUE, SET FALSE'
    );
    expect(agenticRoleBindings).toContain(
      "ALTER ROLE orqaly_v2_001_gateway_login SET statement_timeout = '15s'"
    );
    expect(agenticRoleBindings).toContain(
      'CREATE TABLE IF NOT EXISTS workflow_v2_release.applied_additive_bindings'
    );
    expect(agenticRoleBindings).toContain('PRIMARY KEY (component, migration_number)');
    expect(agenticRoleBindings).toContain(
      'WHERE workflow_v2_release.applied_additive_bindings.bindings_path = EXCLUDED.bindings_path'
    );
    expect(agenticRoleBindings).toContain(
      'AND workflow_v2_release.applied_additive_bindings.bindings_sha256 = EXCLUDED.bindings_sha256'
    );
    expect(agenticRoleBindings).toContain('COUNT(*) = 1');
    expect(agenticRoleBindings).toContain(
      'OR rolinherit OR rolreplication OR rolbypassrls'
    );
    expect(agenticRoleBindings).toContain('membership.admin_option = false');
    expect(agenticRoleBindings).toContain('membership.inherit_option = true');
    expect(agenticRoleBindings).toContain('membership.set_option = false');
    expect(catalogFingerprint).toContain("'rowSecurity', relation.relrowsecurity");
    expect(catalogFingerprint).toContain("'forceRowSecurity', relation.relforcerowsecurity");
    expect(catalogFingerprint).toContain("'securityDefiner', function_record.prosecdef");
    expect(catalogFingerprint).toContain('pg_catalog.pg_get_functiondef(function_record.oid)');
    expect(catalogFingerprint).toContain('pg_catalog.pg_get_triggerdef(trigger_record.oid, false)');
    expect(catalogFingerprint).toContain(
      'pg_catalog.pg_get_constraintdef(constraint_record.oid, false)'
    );
    expect(catalogFingerprint).toContain("extension.extname = 'pgcrypto'");
    expect(catalogFingerprint).toContain(
      "WHEN grantor_role.rolname IN ('postgres', 'cloudsqladmin')"
    );
    expect(catalogFingerprint).toContain("THEN 'DATABASE_ADMIN'");
    expect(catalogFingerprint).toContain("'inherit', membership.inherit_option");
    expect(apply).toContain('EXPECTED_BASELINE_CATALOG_FINGERPRINT=');
    expect(apply).toContain('EXPECTED_ASSISTANT_CATALOG_FINGERPRINT=');
    expect(apply).toContain('EXPECTED_PERSONAL_SESSION_CATALOG_FINGERPRINT=');
    expect(apply).toContain('EXPECTED_FULL_CATALOG_FINGERPRINT=');
    expect(bootstrap).toContain('EXPECTED_FULL_CATALOG_FINGERPRINT=');
    expect(releaseTest).toMatch(/DATABASE_NAME="\$\{DATABASE_PREFIX\}\$\(openssl rand -hex 8\)"/);
    expect(releaseTest).toContain('if test "${database_created}" = true');
    expect(releaseTest).not.toContain('orqaly_v2_release_test');
  });
});
