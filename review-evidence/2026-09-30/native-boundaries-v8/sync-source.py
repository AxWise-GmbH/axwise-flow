import json,hashlib,shutil,datetime
from pathlib import Path
source=Path('/private/tmp/orqanix-native-v8-final-timed-sources-20260930')
original=Path('/Users/admin/axwise-opensource/orqaly-goose')
evidence=Path('/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-30/native-boundaries-v8')
before=json.loads(Path('/private/tmp/orqanix-v8-before-20260930/hashes.json').read_text())
candidate=json.loads(Path('/private/tmp/orqanix-v8-frozen-rust-hashes.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
backup=Path('/private/tmp/orqanix-v8-original-source-backup-20260930')
assert not backup.exists()
for f,h in before.items(): assert sha(original/f)==h, 'ORIGINAL_CHANGED:'+f
for f,h in candidate.items(): assert sha(source/f)==h, 'FROZEN_CHANGED:'+f
for f in before:
 p=backup/f;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original/f,p)
for f in before:
 temporary=(original/f).with_name((original/f).name+'.v8-new')
 shutil.copy2(source/f,temporary);temporary.replace(original/f)
mismatches=[f for f,h in candidate.items() if sha(original/f)!=h]
receipt={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRoot':str(original),'backup':str(backup),'copiedFiles':list(before),'frozenSourcesVerified':len(candidate),'allFrozenSourcesMatch':not mismatches,'mismatches':mismatches,'extensionVersion':'1.5.3','selectionPolicy':'v8','installedAppChanged':False,'meaning':'Authorized optional native-tools source fix. Release/performance acceptance remains a measured gate.'}
(evidence/'source-sync.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
assert not mismatches
