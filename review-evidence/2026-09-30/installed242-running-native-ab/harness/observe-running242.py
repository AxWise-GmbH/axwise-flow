import sqlite3,json,time,sys,pathlib
root=pathlib.Path('/private/tmp/orqanix-installed242-live-20260930')
db='/Users/admin/Library/Application Support/Orqaly Preview/goose/accounts/34528d0777aad85a3368ba892fc9f03a6b4474aae8cbe6cecd1003b8689833ff/data/sessions/sessions.db'
report=json.loads((root/'report.json').read_text())
key=sys.argv[1]
f=next(x for x in report['fixtures'] if x['key']==key)
workspace=f['fixture']['workspace']
path=root/key/'observations.json'
seen={};sessions=[];start=time.time_ns()//1000000
(root/key/'observer-start.json').write_text(json.dumps({'atMs':start,'workspace':workspace}))
while not (root/key/'END_OBSERVATION').exists():
    try:
        con=sqlite3.connect('file:'+db+'?mode=ro',uri=True,timeout=2);con.row_factory=sqlite3.Row
        sessions=[dict(x) for x in con.execute('SELECT id,working_dir,created_at,updated_at,extension_data,provider_name,model_config_json,goose_mode,input_tokens,output_tokens,accumulated_input_tokens,accumulated_output_tokens,accumulated_cost FROM sessions WHERE working_dir=?',(workspace,))]
        for s in sessions:
            ext=json.loads(s.pop('extension_data') or '{}');s['mounts']=[e.get('name') for e in ext.get('enabled_extensions.v0',{}).get('extensions',[])]
        messages=[]
        for session in sessions:
            for x in con.execute('SELECT * FROM messages WHERE session_id=? ORDER BY id',(session['id'],)):
                row=dict(x);row['content']=json.loads(row.pop('content_json'));row['metadata']=json.loads(row.pop('metadata_json') or '{}')
                for block in row['content']:
                    if isinstance(block.get('metadata'),dict):block['metadata'].pop('extra_content',None)
                row['firstObservedAtMs']=seen.setdefault(str(row['id']),time.time_ns()//1000000)
                messages.append(row)
        con.close()
        data={'schema':'running242-readonly-session-observer.v1','key':key,'startedAtMs':start,'observedAtMs':time.time_ns()//1000000,'sessions':sessions,'messages':messages}
        temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,indent=2));temp.replace(path)
    except Exception as e:
        (root/key/'observer-error.txt').write_text(str(e))
    time.sleep(.25)
print(json.dumps({'key':key,'observations':str(path),'sessions':[s['id'] for s in sessions],'observedMessages':len(seen)}))
