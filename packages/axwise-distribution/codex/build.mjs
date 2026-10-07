import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, chmod, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../../..');
const plugin = join(root, 'axwise');
const runtimeVersion = '0.5.2';
const runtimeSha256 = '816af0bd6dd31a109300f066d41c08ff01c285d82bdcd2d0144df5d37385aea8';
const binary = process.argv[2];
if (!binary) throw new Error('Usage: node build.mjs /absolute/path/to/released/bin/axwise');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('This plugin edition is for Apple Silicon macOS. Build another platform edition explicitly.');
}
if (!(await lstat(binary)).isFile()) throw new Error('Runtime must be a regular file, not a symlink');
const runtimeBytes = await readFile(binary);
if (createHash('sha256').update(runtimeBytes).digest('hex') !== runtimeSha256) {
  throw new Error('Runtime does not match the verified public AxWise 0.5.2 binary');
}
const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
if (version !== `axwise ${runtimeVersion}`) throw new Error('Runtime version mismatch');
const manifest = JSON.parse(await readFile(join(plugin, 'plugin.json'), 'utf8'));
const openai = manifest.extensions['com.openai'];
if (openai.interface.shortDescription.length > 30) throw new Error('Listing subtitle exceeds 30 characters');
if (manifest.name !== 'axwise' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('Invalid plugin identity');
await mkdir(join(plugin, '.codex-plugin'), { recursive: true });
await writeFile(join(plugin, '.codex-plugin/plugin.json'), JSON.stringify({
  name: manifest.name, version: manifest.version, description: manifest.description,
  author: manifest.author, homepage: manifest.homepage, repository: manifest.repository,
  license: manifest.license, keywords: manifest.keywords, ...openai,
}, null, 2) + '\n');
const portableMcp = JSON.parse(await readFile(join(plugin, 'mcp.json'), 'utf8'));
const legacyMcp = structuredClone(portableMcp.mcpServers);
legacyMcp['axwise-rust'].command = '${PLUGIN_ROOT}/bin/axwise';
await writeFile(join(plugin, '.mcp.json'), JSON.stringify({ mcpServers: legacyMcp }, null, 2) + '\n');
await mkdir(join(plugin, 'bin'), { recursive: true });
await copyFile(binary, join(plugin, 'bin/axwise'));
await chmod(join(plugin, 'bin/axwise'), 0o755);
await copyFile(join(repo, 'LICENSE'), join(plugin, 'LICENSE'));
const nativeReadme = (await readFile(join(root, '../NATIVE_README.md'), 'utf8'))
  .replace('[AxWise for Codex](codex/README.md)', '[AxWise for Codex](README.md)');
await writeFile(join(plugin, 'NATIVE_README.md'), nativeReadme);
await mkdir(join(plugin, 'assets'), { recursive: true });
// Retain the existing website icon geometry; only its intrinsic display size changes.
const icon = (await readFile(join(repo, 'frontend/public/favicon.svg'), 'utf8'))
  .replace('width="32" height="32"', 'width="100" height="100"');
await writeFile(join(plugin, 'assets/icon.svg'), icon);
await writeFile(join(plugin, 'RUNTIME.json'), JSON.stringify({
  engine: 'rust_standalone', version: runtimeVersion, platform: 'darwin-arm64',
  binary: 'bin/axwise', sha256: runtimeSha256,
  release: 'https://github.com/AxWise-GmbH/axwise-flow/releases/tag/axwise-rust-v0.5.2',
  modelAccess: 'host', managedJevAudit: false,
}, null, 2) + '\n');

async function checkTree(dir) {
  const allowed = new Set([
    '.gitignore', 'plugin.json', 'mcp.json', '.mcp.json', '.codex-plugin/plugin.json',
    'README.md', 'NATIVE_README.md', 'LICENSE', 'RUNTIME.json', 'bin/axwise',
    'assets/icon.svg', 'skills/axwise/SKILL.md', 'skills/axwise/references/workflow.md',
  ]);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const name = relative(plugin, path);
    if (entry.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative(plugin, path)}`);
    if (entry.isDirectory()) {
      if (![...allowed].some(file => file.startsWith(name + '/'))) throw new Error(`Unrelated directory rejected: ${name}`);
      await checkTree(path);
    } else if (!allowed.has(name)) {
      throw new Error(`Unrelated or secret file rejected: ${name}`);
    }
  }
}
await checkTree(plugin);
const dist = join(repo, 'dist/axwise-codex-plugin');
await mkdir(dist, { recursive: true });
const archive = join(dist, `axwise-codex-v${manifest.version}-darwin-arm64.tar.gz`);
execFileSync('/usr/bin/tar', ['-czf', archive, '--exclude=.gitignore', '-C', root, 'axwise'], {
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
const archiveHash = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(archive + '.sha256', `${archiveHash}  ${archive.split('/').at(-1)}\n`);
console.log(JSON.stringify({ plugin, marketplaceRoot: root, archive, sha256: archiveHash, runtimeVersion, runtimeSha256 }));
