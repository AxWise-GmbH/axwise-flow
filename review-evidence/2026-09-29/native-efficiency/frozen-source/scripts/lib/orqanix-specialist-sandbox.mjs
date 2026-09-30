/** macOS-only filesystem boundary for a fresh specialist benchmark row.
 * generateProfile({appBundle, profile, workspace, tmp, authLockRoot?}) validates
 * existing, disjoint roots and the app signature, then returns {profile,sha256,paths}.
 * preflight(options) returns that profile plus {passed:true,checks}; failure throws.
 * Launch the exact returned app path with sandbox-exec -p result.profile; children
 * inherit the profile. No HOME override. This is not network/IPC isolation.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

const BLOCKED = ['/Users', '/Volumes', '/private/tmp', '/tmp', '/private/var/folders', '/var/folders'];
const SANDBOX = '/usr/bin/sandbox-exec';
const contains = (root, path) => path === root || path.startsWith(`${root}${sep}`);
const fail = (code, checks) => { const error = new Error(code); error.code = code; if(checks)error.checks = checks; throw error; };
const quoted = value => JSON.stringify(value);
async function directory(path, label) {
  if(typeof path !== 'string' || !isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path))fail(`INVALID_${label}_PATH`);
  const canonical = await realpath(path);
  if(!(await lstat(canonical)).isDirectory())fail(`INVALID_${label}_DIRECTORY`);
  if(!BLOCKED.some(root => contains(root,canonical) && canonical !== root))fail(`UNRESTRICTED_${label}_ROOT`);
  return canonical;
}
async function inspectWritableRoot(root) {
  // Path rules cannot isolate an inode already hardlinked into an allowed root.
  // Fresh private row roots must not contain preloaded aliases to outside files.
  const visit = async path => {
    const info = await lstat(path);
    if(info.isSymbolicLink())fail('WRITABLE_ROOT_CONTAINS_SYMLINK');
    if(info.isFile() && info.nlink !== 1)fail('WRITABLE_ROOT_CONTAINS_HARDLINK');
    if(info.isDirectory())for(const name of await readdir(path))await visit(join(path,name));
    else if(!info.isFile())fail('WRITABLE_ROOT_CONTAINS_SPECIAL_FILE');
  };
  await visit(root);
}
function ancestors(path) {
  const result=[];let current=dirname(path);
  while(current!==dirname(current)){if(BLOCKED.some(root=>contains(root,current)))result.push(current);current=dirname(current);}
  return result;
}

export async function generateProfile(options) {
  if(process.platform !== 'darwin')fail('SANDBOX_UNSUPPORTED_PLATFORM');
  const paths={};
  for(const key of ['appBundle','profile','workspace','tmp'])paths[key]=await directory(options?.[key],key.toUpperCase());
  if(!paths.appBundle.endsWith('.app'))fail('APP_BUNDLE_REQUIRED');
  const entries=Object.entries(paths);
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)if(contains(entries[i][1],entries[j][1])||contains(entries[j][1],entries[i][1]))fail('OVERLAPPING_SANDBOX_ROOTS');
  if(options.authLockRoot != null){
    // Do not inspect contents: this directory contains only connector IPC locks.
    const expected=join(homedir(),'.config/orqaly-goose-connector/locks');
    if(resolve(options.authLockRoot)!==expected)fail('INVALID_AUTH_LOCK_ROOT');
    paths.authLockRoot=await directory(options.authLockRoot,'AUTH_LOCK');
    if(paths.authLockRoot!==expected)fail('ALIASED_AUTH_LOCK_ROOT');
    if(entries.some(([,path])=>contains(path,paths.authLockRoot)||contains(paths.authLockRoot,path)))fail('OVERLAPPING_AUTH_LOCK_ROOT');
  }
  for(const key of ['profile','workspace','tmp'])await inspectWritableRoot(paths[key]);
  try{execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',paths.appBundle],{stdio:'pipe',timeout:30000,maxBuffer:32768});}catch{fail('APP_SIGNATURE_VERIFICATION_FAILED');}
  const metadata=[...new Set(Object.values(paths).flatMap(ancestors))].sort();
  const rules=[
    '(version 1)',
    '; OS resources, process execution, networking and IPC remain available.',
    '(allow default)',
    `(deny file-read* file-write* ${BLOCKED.map(path=>`(subpath ${quoted(path)})`).join(' ')})`,
    // Traversal/stat only; this does not permit listing or reading parent folders.
    ...(metadata.length?[`(allow file-read-metadata ${metadata.map(path=>`(literal ${quoted(path)})`).join(' ')})`]:[]),
    `(allow file-read* (subpath ${quoted(paths.appBundle)}))`,
    `(allow file-read* file-write* (subpath ${quoted(paths.profile)}) (subpath ${quoted(paths.tmp)}))`,
    `(allow file-read* (subpath ${quoted(paths.workspace)}))`,
    `(allow file-write* (literal ${quoted(join(paths.workspace,'deliverable.json'))}))`,
    ...(paths.authLockRoot?[`(allow file-read* file-write* (subpath ${quoted(paths.authLockRoot)}))`]:[]),
  ];
  const profile=`${rules.join('\n')}\n`;
  return {profile,sha256:createHash('sha256').update(profile).digest('hex'),paths,boundary:'Filesystem restrictions on user/volume/temp roots; OS resources, network and IPC remain available. App resources are readable. Requires exclusive fresh row roots; no pre-existing symlinks/hardlinks.'};
}

export async function preflight(options) {
  const generated=await generateProfile(options),{paths,profile}=generated,checks=[];
  const prefix=`.sandbox-preflight-${randomUUID()}`;
  const deliverable=join(paths.workspace,'deliverable.json');
  const tempLink=join(paths.tmp,`${prefix}-symlink`),hardlink=join(paths.tmp,`${prefix}-hardlink`);
  const profileFile=join(paths.profile,`${prefix}-profile`),tmpFile=join(paths.tmp,`${prefix}-tmp`),extraFile=join(paths.workspace,`${prefix}-extra`);
  const ownOutput='{"sandbox_preflight":true}\n';
  // No mutation of an existing deliverable or immutable task inputs.
  try{await lstat(deliverable);fail('PREFLIGHT_REQUIRES_ABSENT_DELIVERABLE');}catch(error){if(error.code!=='ENOENT')throw error;}
  const outside=await mkdtemp('/private/tmp/orqanix-sandbox-outside-'),forbidden=join(outside,'outside.txt');
  const run=(name,script,args=[],expected=0)=>{
    const result=spawnSync(SANDBOX,['-p',profile,'/bin/sh','-c',script,'sandbox-preflight',...args],{cwd:paths.workspace,env:{...process.env,TMPDIR:paths.tmp},encoding:'utf8',timeout:10000,killSignal:'SIGKILL',maxBuffer:32768});
    const supported=!result.error && result.signal===null && !/sandbox_apply|sandbox initialization failed|syntax error/.test(result.stderr||'');
    const passed=supported&&(expected===0?result.status===0:result.status!==0);
    checks.push({name,passed,status:result.status,signal:result.signal,error:result.error?.code??null});
    if(!passed)fail(supported?'SANDBOX_PREFLIGHT_FAILED':'SANDBOX_ENFORCEMENT_UNAVAILABLE',checks);
  };
  try{
    await writeFile(forbidden,'harmless-outside-sentinel\n',{mode:0o600});
    run('OS resource read', '/bin/cat /System/Library/CoreServices/SystemVersion.plist >/dev/null');
    run('exact app bundle read','/bin/cat "$1" >/dev/null',[join(paths.appBundle,'Contents/Info.plist')]);
    run('workspace request read','/bin/cat "$1" >/dev/null',[join(paths.workspace,'request.json')]);
    run('profile write/read','printf allowed > "$1" && /bin/cat "$1" >/dev/null',[profileFile]);
    run('temporary write/read','printf allowed > "$1" && /bin/cat "$1" >/dev/null',[tmpFile]);
    run('deliverable write/read','printf \'{"sandbox_preflight":true}\\n\' > "$1" && /bin/cat "$1" >/dev/null',[deliverable]);
    run('outside read denied','/bin/cat "$1" >/dev/null',[forbidden],1);
    run('outside write denied','printf blocked >> "$1"',[forbidden],1);
    run('outside parent listing denied','/bin/ls "$1" >/dev/null',[outside],1);
    run('row parent listing denied','/bin/ls "$1" >/dev/null',[dirname(paths.profile)],1);
    run('immutable request write-open denied','exec 3>> "$1"',[join(paths.workspace,'request.json')],1);
    run('app resource write-open denied','exec 3>> "$1"',[join(paths.appBundle,'Contents/Info.plist')],1);
    run('extra workspace output denied','printf blocked > "$1"',[extraFile],1);
    run('child inherits outside read denial','/bin/sh -c \'/bin/cat "$1" >/dev/null\' child "$1"',[forbidden],1);
    await symlink(forbidden,tempLink);
    run('symlink escape read denied','/bin/cat "$1" >/dev/null',[tempLink],1);
    run('symlink escape write denied','printf blocked >> "$1"',[tempLink],1);
    run('outside hardlink creation denied','/bin/ln "$1" "$2"',[forbidden,hardlink],1);
    const unchanged=await readFile(forbidden,'utf8')==='harmless-outside-sentinel\n';checks.push({name:'outside sentinel unchanged',passed:unchanged});
    if(!unchanged)fail('SANDBOX_PREFLIGHT_FAILED',checks);
    return {...generated,passed:true,checks};
  }finally{
    for(const path of [tempLink,hardlink,profileFile,tmpFile,extraFile])await rm(path,{force:true});
    if(await readFile(deliverable,'utf8').catch(()=>null)===ownOutput)await rm(deliverable);
    await rm(outside,{recursive:true,force:true});
  }
}
