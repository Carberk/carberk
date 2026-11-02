#!/usr/bin/env python3
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PROJECT='auto_tm_ci_897_938_20261103_r1'
ROOT=Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-2d375913')
BASE=ROOT/'infra/compose/docker-compose.ci.yml'
OVERLAY=Path('/tmp/issue938-prepared-reader-r1/compose-overlay.yml')

def run(*argv):
    p=subprocess.run(list(argv),cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,check=False)
    return {'argv':list(argv),'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr}

def lines(s): return [x for x in s.splitlines() if x.strip()]

def json_lines(s):
    out=[]
    for line in lines(s):
        try: out.append(json.loads(line))
        except Exception: out.append({'raw':line})
    return out

compose_args=['docker','compose','-f',str(BASE),'-f',str(OVERLAY),'-p',PROJECT]
ps=run(*compose_args,'ps','-a','--format','json')
labels=run('docker','ps','-a','--filter',f'label=com.docker.compose.project={PROJECT}','--format','{{json .}}')
volumes=run('docker','volume','ls','--filter',f'label=com.docker.compose.project={PROJECT}','--format','{{json .}}')
networks=run('docker','network','ls','--filter',f'label=com.docker.compose.project={PROJECT}','--format','{{json .}}')
ports={service:run(*compose_args,'port',service,target) for service,target in [('postgres','5432'),('redis','6379'),('minio','9000')]}
ids=[]
for row in json_lines(ps['stdout']):
    if isinstance(row,dict) and row.get('ID'): ids.append(row['ID'])
inspects=[]
for cid in ids:
    inspects.append(run('docker','inspect',cid))
result={'captured_at':datetime.now(timezone.utc).isoformat(),'project':PROJECT,'compose_ps':ps,'project_labels':labels,'volumes':volumes,'networks':networks,'ports':ports,'container_inspects':inspects,'parsed_ps':json_lines(ps['stdout']),'parsed_labels':json_lines(labels['stdout']),'parsed_volumes':json_lines(volumes['stdout']),'parsed_networks':json_lines(networks['stdout'])}
out=Path('/tmp/issue938-prepared-reader-r1/runtime/ownership.json')
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'captured_at':result['captured_at'],'containers':ids,'ps_exit':ps['exit_code'],'volume_rows':len(result['parsed_volumes']),'network_rows':len(result['parsed_networks']),'ports':{k:v['stdout'].strip() for k,v in ports.items()}},indent=2))
if ps['exit_code'] != 0 or len(ids) != 3: raise SystemExit('ownership snapshot did not find exactly three project containers')
