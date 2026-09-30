import json,pathlib,hashlib,statistics
root=pathlib.Path('/private/tmp/orqanix-installed242-live-20260930');path=root/'report.json';r=json.loads(path.read_text());rows=[]
for trial in r['fixtures']:
 p=root/trial['key']/'observations.json';q=root/trial['key']/'oracle.json'
 if not p.exists():continue
 x=json.loads(p.read_text());m=x['messages'];s=x['sessions'];tools=[];todo_gaps=[]
 for i,z in enumerate(m):
  for c in z['content']:
   if c.get('type')=='toolRequest':
    name=c.get('toolCall',{}).get('value',{}).get('name');tools.append(name)
    if name and 'todo' in name:
     ident=c.get('id');response=next((a for a in m[i+1:] if any(v.get('type')=='toolResponse' and v.get('id')==ident for v in a['content'])),None)
     if response:todo_gaps.append({'id':ident,'requestCreatedSec':z['created_timestamp'],'responseCreatedSec':response['created_timestamp'],'estimatedMs':max(0,response['firstObservedAtMs']-z['created_timestamp']*1000)})
 final=m[-1] if m else None;done=bool(final and final['role']=='assistant' and all(c.get('type')=='text' for c in final['content']))
 events=[e for e in r.get('uiTimingEvents',[]) if e['key']==trial['key']];send=next((e for e in events if e['kind']=='send'),None)
 wall=final['firstObservedAtMs']-send['beforeMs'] if done and send else None
 gap=sum(g['estimatedMs'] for g in todo_gaps)
 oracle=json.loads(q.read_text()) if q.exists() else None
 actual_prompt='\n'.join(c.get('text','') for z in m if z['role']=='user' for c in z['content'] if c.get('type')=='text' and c.get('text','').startswith(trial['fixture']['prompt'].split('\n')[0]))
 mounts=s[0].get('mounts',[]) if len(s)==1 else []
 row={k:trial[k] for k in ['key','difficulty','arm','repeat','flags']}
 row.update({'sessionId':s[0]['id'] if len(s)==1 else None,'mode':s[0].get('goose_mode') if s else None,'mounts':mounts,'nativeFlagMountVerified':('orqanix-engineering' in mounts)==trial['flags']['nativeGemsEnabled'],'jevAxwiseAbsent':not any('axwise' in t for t in mounts),'promptVerified':actual_prompt==trial['fixture']['prompt'],'completedSessionMessage':done,'uiCompleted':any(e['kind']=='ui-completion-verified' for e in events),'elapsedMs':wall,'todoHandlingGapMs':gap,'todoGaps':todo_gaps,'wallMinusTodoHandlingGapsMs':wall-gap if wall is not None else None,'timingCaveat':'Read-only DB observer polls every 250ms. Tool-response creation timestamps are inherited from the request, so gaps use request creation (second resolution) to response first-observed persistence. Gaps include approvals, tool handling and possible streaming. Wall minus these gaps is a rough lower bound excluding all todo handling, not an autonomous counterfactual or accepted speed metric. Smart classifier overhead for other tools remains. UI completion verified separately.','toolCalls':len(tools),'toolNames':tools,'engineeringCalls':sum(('orqanix-engineering' in str(t) or 'orqanix_engineering' in str(t)) for t in tools),'rustNativeCalls':sum(t in ['ast_search','lsp_query','hashline_edit','safe_edit_and_test'] for t in tools),'primaryAssistantResponses':sum(z['role']=='assistant' for z in m),'recordedInferenceMs':sum(z.get('metadata',{}).get('usage',{}).get('elapsedMs',0) or 0 for z in m),'recordedAccumulatedInputTokens':sum(z.get('metadata',{}).get('usage',{}).get('inputTokens',0) or 0 for z in m),'modelConfig':json.loads(s[0].get('model_config_json') or '{}') if s else None,'resolvedRemoteModelVerified':False,'oracle':oracle,'passed':bool(done and oracle and oracle['passed'] and oracle.get('originalMutation',{}).get('detected') and actual_prompt==trial['fixture']['prompt'] and ('orqanix-engineering' in mounts)==trial['flags']['nativeGemsEnabled'])})
 rows.append(row)
r['rows']=rows;r['updatedAtMs']=__import__('time').time_ns()//1000000
summary=[]
for diff in ['control','ast','lsp']:
 arms={a:[z for z in rows if z['difficulty']==diff and z['arm']==a] for a in ['default','candidate']}
 stat={'difficulty':diff}
 for a,z in arms.items():
  times=[v['wallMinusTodoHandlingGapsMs'] for v in z if v['wallMinusTodoHandlingGapsMs'] is not None]
  stat[a]={'n':len(z),'graded':sum(v['oracle'] is not None for v in z),'passed':sum(v['passed'] for v in z),'wallMinusTodoHandlingGapsMedianMs':statistics.median(times) if times else None,'wallMedianMs':statistics.median([v['elapsedMs'] for v in z if v['elapsedMs'] is not None]) if times else None}
 summary.append(stat)
r['summary']={'expectedTrials':12,'observed':len(rows),'graded':sum(z['oracle'] is not None for z in rows),'passed':sum(z['passed'] for z in rows),'engineeringCalls':sum(z['engineeringCalls'] for z in rows),'rustNativeCalls':sum(z['rustNativeCalls'] for z in rows),'byDifficulty':summary,'notComparableToV8Speed':'Live Smart mode, extra installed extensions, low thinking effort, warm reused backend, setup included. No matched 2.4.2-versus-v8 experiment.'}
path.write_text(json.dumps(r,indent=2))
print(json.dumps(r['summary'],indent=2))
