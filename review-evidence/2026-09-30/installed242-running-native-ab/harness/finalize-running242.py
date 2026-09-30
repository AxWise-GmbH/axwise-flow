import json,pathlib,hashlib,shutil
rdir=pathlib.Path('/private/tmp/orqanix-installed242-live-20260930');r=json.loads((rdir/'report.json').read_text());rows=r['rows']
checks={'exactly12Rows':len(rows)==12,'exactSchedule':{z['key'] for z in rows}=={z['key'] for z in r['schedule']},'allQualityPassed':all(z['passed'] for z in rows),'allUICompletionsVerified':all(z['uiCompleted'] for z in rows),'allPromptsExact':all(z['promptVerified'] for z in rows),'allFlagsMatchedMounts':all(z['nativeFlagMountVerified'] for z in rows),'allSmartMode':all(z['mode']=='smart_approve' for z in rows),'allLowThinkingEffort':all(z['modelConfig'].get('request_params',{}).get('thinking_effort')=='low' for z in rows),'sameRequestedModel':all(z['modelConfig'].get('model_name')=='orqaly-gemini' for z in rows),'installedFilesUnchanged':r['installedFilesUnchanged'],'sameRunningProcesses':r['processesFinal']['sameOriginalProcessesVerified'],'originalSettingsRestored':r['restoration']['nativeGemsEnabled']==False and r['restoration']['jevReviewEnabled']==True and r['restoration']['axwiseLocalEnabled']==True,'noEngineeringToolCalls':all(z['engineeringCalls']==0 for z in rows),'allIndependentGraderBoundariesPassed':all(z['oracle']['boundary']['passed'] for z in rows),'sameNonEngineeringExtensionMounts':len({tuple(sorted(n for n in z['mounts'] if n!='orqanix-engineering')) for z in rows})==1}
verification={'schema':'orqanix.running242-verification.v1','checks':checks,'passed':all(checks.values()),'scope':'Functional correctness, exact task prompts, extension mount behavior, unchanged installation/processes and restored settings. Does not certify bridge operation execution, actual advertised schema inventory, resolved upstream model identity, or performance equivalence.'}
(rdir/'verification.json').write_text(json.dumps(verification,indent=2))
if not verification['passed']:raise SystemExit('VERIFICATION_FAILED')
f={'build':'Installed Orqanix 2.4.2 ('+str(r['finalInstalledIdentity']['build'])+')','trials':12,'nativeOff':{'trials':6,'passed':6},'nativeOn':{'trials':6,'passed':6},'qualityGates':['independent behavior checks','TypeScript compile','public tests','added regression tests','original bug mutation caught','immutable inputs and permitted file scope'],'flagBehavior':'Engineering bridge mounted only for on chats; all other mounted extensions matched. Jev/Axwise disabled during trials, original settings restored.','engineeringToolsCalled':0,'newRustNativeToolsPresent':False,'toolExecutionCoverage':'Bridge execution not exercised; tasks used normal Goose tools, including existing Analyze tree.','installation':'Same original app/backend processes, unchanged Goose/app.asar hashes, no install or restart.','timingConclusion':'No defensible speed gain established. Smart approval pauses contaminate wall time; subtracting whole todo handling gaps is a rough bound, not an autonomous counterfactual. Extra installed extensions, low thinking effort and warm backend differ from prior v8 protocol. Raw times, gaps and all samples retained.','upstreamModel':'Existing orqaly-gemini alias preserved with low effort; exact resolved remote model identity was not instrumented in this no-rerouting live app test.','verificationPassed':True,'rawReport':str(rdir/'report.json')}
(rdir/'findings.json').write_text(json.dumps(f,indent=2))
out=pathlib.Path('/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-30/installed242-running-native-ab');out.mkdir(parents=True,exist_ok=True)
for name in ['report.json','verification.json','findings.json']:shutil.copy2(rdir/name,out/name)
for trial in r['fixtures']:
 key=trial['key'];dest=out/'trials'/key;dest.mkdir(parents=True,exist_ok=True)
 for name in ['observations.json','oracle.json']:shutil.copy2(rdir/key/name,dest/name)
 # Preserve only source/test fixture files; Git metadata and grader scratch stay in private temp.
 for name in trial['fixture']['files']|{'tests/regression.test.mjs':None}:
  source=pathlib.Path(trial['fixture']['workspace'])/name
  if source.exists():
   p=dest/'solution'/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,p)
helpers=out/'harness';helpers.mkdir(exist_ok=True)
for name in ['observe-running242.py','grade-running242.mjs','status-running242.py','summarize-running242.py','finalize-running242.py']:shutil.copy2(pathlib.Path('/private/tmp')/name,helpers/name)
repo=pathlib.Path('/Users/admin/axwise-opensource/axwise-flow-oss')
for name in ['scripts/lib/orqanix-semantic-tasks.mjs','scripts/lib/orqanix-selection-sandbox.mjs','scripts/lib/orqanix-specialist-sandbox.mjs']:
 dest=helpers/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(repo/name,dest)
hashes={str(p.relative_to(helpers)):hashlib.sha256(p.read_bytes()).hexdigest() for p in helpers.rglob('*') if p.is_file()}
(out/'harness-hashes.json').write_text(json.dumps(hashes,indent=2))
print(json.dumps({'evidence':str(out),'verification':verification,'findings':f},indent=2))
