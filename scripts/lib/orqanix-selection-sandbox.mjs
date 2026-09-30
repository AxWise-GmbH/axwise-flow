/** Constrain the actual Goose backend and all its children, leaving Electron's
 * renderer sandbox intact. Both benchmark binaries use the identical wrapper. */
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { generateProfile } from './orqanix-specialist-sandbox.mjs';

export async function preflight(options) {
  const base=await generateProfile({...options,authLockRoot:join(homedir(),'.config/orqaly-goose-connector/locks')});
  const profile=base.profile+`(allow file-write* (subpath ${JSON.stringify(base.paths.workspace)}))\n`;
  const outside=await mkdtemp('/private/tmp/orqanix-selection-sentinel-');
  const forbidden=join(outside,'private.txt'),probe=join(base.paths.workspace,`.boundary-${randomUUID()}`),checks=[];
  await writeFile(forbidden,'synthetic-private-sentinel\n',{mode:0o600});
  const run=(name,script,args,expected=true)=>{
    const r=spawnSync('/usr/bin/sandbox-exec',['-p',profile,'/bin/sh','-c',script,'boundary-test',...args],{cwd:base.paths.workspace,encoding:'utf8',timeout:10000,maxBuffer:16384});
    const supported=!r.error&&r.signal===null&&!/sandbox_apply|sandbox initialization failed|syntax error/.test(r.stderr||'');
    const passed=supported&&((r.status===0)===expected);checks.push({name,passed});
    if(!passed){const e=new Error(`BOUNDARY_FAILED:${name}`);e.checks=checks;throw e;}
  };
  try{
    run('workspace read',['/bin/cat "$1" >/dev/null'].join(''),[join(base.paths.workspace,'README.md')]);
    run('workspace write and remove','printf x > "$1" && /bin/cat "$1" >/dev/null && /bin/rm "$1"',[probe]);
    run('profile write','printf x > "$1" && /bin/rm "$1"',[join(base.paths.profile,'sentinel')]);
    run('own temp write','printf x > "$1" && /bin/rm "$1"',[join(base.paths.tmp,'sentinel')]);
    run('other temp read denied','/bin/cat "$1" >/dev/null',[forbidden],false);
    run('other temp write denied','printf bad > "$1"',[forbidden],false);
    run('user directory listing denied','/bin/ls "$1" >/dev/null',[homedir()],false);
    run('child inherits restriction','/bin/sh -c \'/bin/cat "$1" >/dev/null\' child "$1"',[forbidden],false);
    await symlink(forbidden,probe);
    run('symlink read escape denied','/bin/cat "$1" >/dev/null',[probe],false);
    run('symlink write escape denied','printf bad > "$1"',[probe],false);
    await rm(probe);
    run('hardlink escape denied','/bin/ln "$1" "$2"',[forbidden,probe],false);
    run('app binary readable','/bin/cat "$1" >/dev/null',[join(base.paths.appBundle,'Contents/Resources/bin/goose-candidate')]);
    run('app resources immutable','printf bad >> "$1"',[join(base.paths.appBundle,'Contents/Resources/bin/selection-ab-build.json')],false);
  }finally{await rm(probe,{force:true});await rm(outside,{recursive:true,force:true});}
  return {...base,profile,sha256:createHash('sha256').update(profile).digest('hex'),checks,passed:true,boundary:'Goose backend and descendants cannot read/write unrelated user, volume or temp trees; app resources read-only; own synthetic workspace/profile/temp writable. Electron remains outside this added filesystem boundary. Network/IPC remain available; this is not complete process or network isolation.'};
}
