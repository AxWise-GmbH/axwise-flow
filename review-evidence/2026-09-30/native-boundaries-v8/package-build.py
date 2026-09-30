import datetime
import hashlib
import json
import shutil
import subprocess
import plistlib
from pathlib import Path

source = Path('/private/tmp/orqaly-goose-verified-fixes')
old_app = Path('/private/tmp/orqanix-native-v7-ready-app-20260930/Orqanix Native v7 Test.app')
app = Path('/private/tmp/orqanix-native-v8-app-20260930/Orqanix Native v8 Test.app')
frozen = Path('/private/tmp/orqanix-native-v8-final-timed-sources-20260930')
evidence = Path('/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-30/native-boundaries-v8')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
hashes = json.loads(Path('/private/tmp/orqanix-v8-frozen-rust-hashes.json').read_text())
for name, expected in hashes.items():
    assert sha(source / name) == sha(frozen / name) == expected, name
if not app.exists():
    app.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(old_app, app, symlinks=True)
plist = app / 'Contents/Info.plist'
info = plistlib.loads(plist.read_bytes())
info['CFBundleDisplayName'] = 'Orqanix Native v8 Test'
plist.write_bytes(plistlib.dumps(info))
binary = source / 'target/release/goose'
signed = Path('/private/tmp/orqanix-goose-native-v8-signed')
assert not signed.exists()
shutil.copy2(binary, signed)
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', '--identifier', 'net.orqanix.benchmark.goose-v8', str(signed)], check=True)
bindir = app / 'Contents/Resources/bin'
for name in ['goose-baseline', 'goose-candidate']:
    temporary = bindir / (name + '.new')
    shutil.copy2(signed, temporary)
    temporary.replace(bindir / name)
manifest = {
    'schemaVersion': 'orqanix.local-native-boundaries-v8-build.v1',
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'releaseEligible': False,
    'source': {'repository': str(source), 'frozen': str(frozen),
        'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip(),
        'dirty': True, 'contentFingerprint': hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()},
    'rustSources': hashes,
    'build': {'profile': 'release', 'cargoArguments': ['build', '-p', 'goose-cli', '--bin', 'goose', '--release', '--offline', '--no-default-features', '--features', 'rustls-tls'],
        'rustc': subprocess.check_output(['rustc', '--version'], cwd=source, text=True).strip()},
    'binary': {'source': str(binary), 'buildOutputSha256': sha(binary), 'sha256': sha(bindir / 'goose-candidate')},
    'candidate': 'v8 whole-line boundary preservation with exact-text opt-in, coherent batch/check guidance and optional real AST/LSP, large-project guards and recovery',
    'limitation': 'Isolated local benchmark app; no automatic classifier or deferred tool schemas. Identical rebuilt backend in both arms. Historical v4 gains are not assumed; v7 timing is a prior regression reference, not a matched causal release comparison. Installed app unchanged.'
}
selection = {'schema': 'orqanix.native-boundaries-v8-build.v1', 'profile': 'release', 'features': ['rustls-tls'], 'codeMode': False, 'releaseEligible': False,
    'baselineSha256': sha(bindir / 'goose-baseline'), 'candidateSha256': sha(bindir / 'goose-candidate'),
    'arms': {'default': 'same rebuilt Goose binary, native tools mode off', 'candidate': 'same rebuilt Goose binary, optional native tools workflow v8 on'},
    'otherFlags': {'jev': False, 'axwise': False}}
for name, value in [('orqanix-goose-benchmark-build.json', manifest), ('selection-ab-build.json', selection)]:
    (bindir / name).write_text(json.dumps(value, indent=2) + '\n')
subprocess.run(['/usr/bin/codesign', '--force', '--sign', '-', str(app)], check=True)
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)], check=True)
assert sha(bindir / 'goose-baseline') == sha(bindir / 'goose-candidate') == manifest['binary']['sha256']
(evidence / 'build.json').write_text(json.dumps(manifest, indent=2) + '\n')
(evidence / 'binaries.json').write_text(json.dumps(selection, indent=2) + '\n')
receipt = {'app': str(app), 'signedSha256': manifest['binary']['sha256'], 'sameBinary': True, 'signatureVerified': True, 'sourceFiles': len(hashes)}
Path('/private/tmp/orqanix-v8-packaging.json').write_text(json.dumps(receipt, indent=2) + '\n')
(evidence / 'packaging.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
