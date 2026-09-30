import json
import os
import subprocess
import time
from pathlib import Path

root = Path('/private/tmp/orqaly-goose-verified-fixes')
runtime = '/private/tmp/orqanix-native-v6p1-app-20260930/Orqanix Native v6.1 Test.app/Contents/Resources/orqaly-runtime'
env = dict(os.environ, GOOSE_REAL_LSP_RUNTIME=runtime)
base = ['--offline', '--no-default-features', '--features', 'rustls-tls']
steps = [('clippy', ['cargo', 'clippy', '-p', 'goose', '-p', 'goose-cli', '--all-targets'] + base + ['--', '-D', 'warnings']), ('release', ['cargo', 'build', '-p', 'goose-cli', '--bin', 'goose', '--release'] + base)]
results = json.loads(Path('/private/tmp/orqanix-v8-validation.json').read_text())
for name, command in steps:
    print(json.dumps({'event': 'starting', 'step': name}), flush=True)
    start = time.monotonic()
    log = Path('/private/tmp/orqanix-v8-' + name + '-tests.log')
    with log.open('w') as output:
        process = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    result = {'name': name, 'command': command, 'exitCode': process.returncode, 'seconds': time.monotonic() - start, 'log': str(log)}
    results.append(result)
    Path('/private/tmp/orqanix-v8-validation.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'event': 'finished', **result}), flush=True)
    if process.returncode:
        print(log.read_text()[-7000:], flush=True)
        raise SystemExit(process.returncode)
