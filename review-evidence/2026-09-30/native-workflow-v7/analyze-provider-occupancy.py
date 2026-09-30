import json
from pathlib import Path
from datetime import datetime

root = Path('/private/tmp/orqanix-native-v7-live-ready-20260930')
report = json.loads((root / 'report.json').read_text())
rows = []
for row in report['rows']:
    operations = []
    for tool in row.get('tools', []):
        name = tool.get('_meta', {}).get('goose', {}).get('toolCall', {}).get('toolName', '')
        if name not in ['ast_search', 'lsp_query', 'safe_edit_and_test', 'hashline_edit']:
            continue
        args, output = tool.get('rawInput', {}), tool.get('rawOutput', {})
        output = output if isinstance(output, dict) else {}
        result = output.get('result', {})
        result = result if isinstance(result, dict) else {}
        operations.append(dict(tool=name, action=args.get('action'), status=tool.get('status'),
            milliseconds=tool['lastAt']-tool['firstAt'], verified=output.get('verified'),
            code=output.get('code'), error=output.get('error'), compact=args.get('compact'),
            planApplied=args.get('plan_id') is not None and output.get('verified') is True,
            filesChanged=result.get('files_changed'), analysisInputs=result.get('analysis_inputs'),
            matches=len(output.get('matches', [])), previewComplete=result.get('preview_complete')))
    wire = json.loads((Path(row['directory']) / 'wire.json').read_text())
    sent = next(event['at'] for event in wire if event.get('direction') == 'sent' and
        event.get('message', {}).get('method') == 'session/prompt')
    start = sent - row['acpPromptDelayMs']
    end = start + row['elapsedMs']
    intervals = []
    for request in row['telemetry']['modelRequests']:
        begin = datetime.fromisoformat(request['startedAt'].replace('Z', '+00:00')).timestamp()*1000
        finish = begin + request.get('elapsedMs', 0)
        if request.get('source') == 'primary' and min(finish, end) > max(begin, start):
            intervals.append((max(begin, start), min(finish, end)))
    merged = []
    for begin, finish in sorted(intervals):
        if merged and begin <= merged[-1][1]:
            merged[-1][1] = max(finish, merged[-1][1])
        else:
            merged.append([begin, finish])
    rows.append(dict(key=row['key'], seconds=row['elapsedMs']/1000, passed=row['passed'],
        providerOccupancySeconds=sum(b-a for a,b in merged)/1000,
        providerCallsInSendWindow=len(intervals), operations=operations))
result = dict(rows=rows,
    successfulAst=sum(o['tool']=='ast_search' and o['status']=='completed' for r in rows for o in r['operations']),
    successfulRenamePlans=sum(o['tool']=='lsp_query' and o['action']=='rename' and o['status']=='completed' for r in rows for o in r['operations']),
    verifiedPlanApplies=sum(o['planApplied'] for r in rows for o in r['operations']),
    diagnosticTimeouts=sum(o['tool']=='lsp_query' and o['action']=='diagnostics' and o['code']=='timeout' for r in rows for o in r['operations']),
    limitation='Tool durations include IPC; provider occupancy is a clipped union of request intervals, not causal attribution or paid/uncached token accounting.')
(root / 'operation-diagnostics.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k != 'rows'}))
