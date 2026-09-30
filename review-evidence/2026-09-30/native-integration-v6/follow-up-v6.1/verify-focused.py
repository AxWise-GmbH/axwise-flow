import hashlib
import json
import re
import statistics
from pathlib import Path

root = Path('/private/tmp/orqanix-native-v6p1-focused-20260930')
project = Path('/Users/admin/axwise-opensource/axwise-flow-oss')
app = Path('/private/tmp/orqanix-native-v6p1-app-20260930/Orqanix Native v6.1 Test.app')
source = Path('/private/tmp/orqanix-native-v6p1-final-timed-sources-20260930')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
report = json.loads((root / 'report.json').read_text())
failures = []
expected_keys = ['control-default-1', 'control-candidate-1', 'control-candidate-2', 'control-default-2']
if [row['key'] for row in report['rows']] != expected_keys:
    failures.append('four_counterbalanced_control_trials')
for name, expected in report['fingerprint'].items():
    path = None
    if name == 'app.asar' or name.startswith(('bin/', 'orqaly-runtime/', 'axwise-runtime/')):
        path = app / 'Contents/Resources' / name
    elif name.startswith(('benchmark-', 'lib/')):
        path = project / 'scripts' / name
    elif name in ['goose-provider-http.js', 'desktop-decision-service.js', 'engineering-review-service.js']:
        path = project / 'apps/orqaly/server/workflow-v2' / name
    elif name == 'executableSha256':
        path = app / 'Contents/MacOS/Orqanix Benchmark'
    if path is not None and sha(path) != expected:
        failures.append('fingerprint:' + name)
manifest = json.loads((app / 'Contents/Resources/bin/orqanix-goose-benchmark-build.json').read_text())
for name, expected in manifest['rustSources'].items():
    if sha(source / name) != expected:
        failures.append('build_source:' + name)
for name in ['goose-baseline', 'goose-candidate']:
    if sha(app / 'Contents/Resources/bin' / name) != manifest['binary']['sha256']:
        failures.append('same_binary:' + name)
sync = json.loads(Path('/private/tmp/orqanix-v6p1-source-sync.json').read_text())
for entry in sync['files']:
    if sha(Path(sync['root']) / entry['path']) != entry['sha256']:
        failures.append('original_source_sync:' + entry['path'])

native_names = {'ast_search', 'lsp_query', 'hashline_edit', 'safe_edit_and_test'}
rows = []
for row in report['rows']:
    key = row['key']
    if not row['boundary']['checks'] or not all(c['passed'] for c in row['boundary']['checks']):
        failures.append(key + ':boundary')
    if row['pendingApprovals'] or row['telemetry']['pending']:
        failures.append(key + ':pending')
    requests = row['telemetry']['modelRequests']
    if not requests or any(m['modelIdentity'] != 'verified' or m['requestedModel'] != 'gemini-3.8-flash'
        or m['httpStatus'] != 200 or not m.get('usage') or not m.get('responseModels')
        or any(n != 'gemini-3.8-flash' for n in m['responseModels']) for m in requests):
        failures.append(key + ':model_or_usage')
    expected_flags = {'nativeGemsEnabled': row['arm'] == 'candidate', 'jevReviewEnabled': False, 'axwiseLocalEnabled': False}
    if any(row['persistedFlags'].get(k) != v or row['flags'].get(k) != v for k, v in expected_flags.items()):
        failures.append(key + ':flags')
    if not row['inventoryMatches']:
        failures.append(key + ':inventory')
    inventory = row.get('mounts', []) + row.get('actualToolInventory', [])
    if any(re.search(r'(?:^|[_\s-])omp(?:[_\s-]|$)|orqanix_engineering', name, re.I) for name in inventory):
        failures.append(key + ':omp_present')
    if row['status'] != 'completed' or not row['passed'] or not row['oracle']['passed']:
        failures.append(key + ':quality')
    tools = {}
    for tool in row['tools']:
        name = tool.get('_meta', {}).get('goose', {}).get('toolCall', {}).get('toolName', tool.get('title', 'unknown'))
        tools[name] = tools.get(name, 0) + 1
    rows.append({'key': key, 'arm': row['arm'], 'seconds': row['elapsedMs'] / 1000, 'passed': row['passed'],
        'tools': tools, 'nativeToolCalls': {k: v for k, v in tools.items() if k in native_names},
        'requestsIncludingPreSendTitleCalls': len(requests),
        'reportedInputTokensIncludingCachedTokens': sum(m['usage'].get('prompt_tokens', 0) for m in requests)})

verification = {'passed': not failures, 'failures': failures, 'reportSha256': sha(root / 'report.json'),
    'scope': 'Exactly four actual-desktop simple-task follow-up trials, not the twelve-trial matrix.',
    'frozenRustSourcesChecked': len(manifest['rustSources']), 'originalSyncedFilesChecked': len(sync['files']),
    'meaning': 'Provenance, model, flag, boundary and quality validation; not performance acceptance.'}
(root / 'verification.json').write_text(json.dumps(verification, indent=2) + '\n')
arms = {}
for arm in ['default', 'candidate']:
    rs = [r for r in rows if r['arm'] == arm]
    arms[arm] = {'count': len(rs), 'passed': sum(r['passed'] for r in rs), 'medianSeconds': statistics.median(r['seconds'] for r in rs),
        'totalSeconds': sum(r['seconds'] for r in rs)}
summary = {'schema': 'orqanix.operations.focused-follow-up.v1', 'build': 'v6.1', 'verification': verification,
    'method': 'Four counterbalanced actual-desktop Send-to-clean-terminal simple-task trials: mode off/on, twice each. Same signed rebuilt Goose binary; Gemini 3.8 Flash verified; Jev/Axwise/Code Mode off; fresh profiles and fixtures. Setup and independent grading excluded. The raw report retains the full scheduled matrix metadata, but only these four keys ran.',
    'arms': arms, 'candidateTimeChangePercent': (arms['candidate']['medianSeconds'] / arms['default']['medianSeconds'] - 1) * 100,
    'focusedSpeedGatePassed': arms['candidate']['medianSeconds'] <= arms['default']['medianSeconds'],
    'fullMatrixRequalified': False, 'releaseEligible': False, 'rows': rows,
    'limitation': 'Two repeats per arm cannot establish statistical equivalence. Do not splice these timings into the earlier v6 matrix or attribute the time gap causally to AST/LSP. AST/LSP were not called in these simple-task trials. One mode-on trial called hashline/safe tools; semanticToolsUsed only counts AST/LSP.'}
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'verification': verification, 'arms': arms, 'candidateTimeChangePercent': summary['candidateTimeChangePercent'],
    'nativeTools': {r['key']: r['nativeToolCalls'] for r in rows}}, indent=2))
if failures:
    raise SystemExit(1)
