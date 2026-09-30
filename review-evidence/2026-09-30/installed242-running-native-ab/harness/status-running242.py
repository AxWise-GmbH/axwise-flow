import json,pathlib,sys,time
r=pathlib.Path('/private/tmp/orqanix-installed242-live-20260930')
for key in sys.argv[1:]:
 x=json.loads((r/key/'observations.json').read_text());m=x['messages'];calls=[]
 for z in m:
  for c in z['content']:
   if c.get('type')=='toolRequest': calls.append(c.get('toolCall',{}).get('value',{}).get('name'))
 print(json.dumps({'key':key,'messages':len(m),'lastId':m[-1]['id'] if m else None,'lastRole':m[-1]['role'] if m else None,'lastTypes':[c.get('type') for c in m[-1]['content']] if m else [],'lastObservedAgeSec':round((time.time()*1000-m[-1]['firstObservedAtMs'])/1000,1) if m else None,'lastTools':[c.get('toolCall',{}).get('value',{}).get('name') for c in m[-1]['content'] if c.get('type')=='toolRequest'] if m else [],'calls':calls,'providerRecordedMs':sum(z.get('metadata',{}).get('usage',{}).get('elapsedMs',0) or 0 for z in m),'assistantResponses':sum(z['role']=='assistant' for z in m)}))
