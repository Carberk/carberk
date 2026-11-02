#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT='auto_tm_ci_897_938_20261103_r1'
ROOT=Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-2d375913')
BASE=ROOT/'infra/compose/docker-compose.ci.yml'
OVERLAY=Path('/tmp/issue938-prepared-reader-r1/compose-overlay.yml')
EXPECTED_VOLUMES={
  f'{PROJECT}-postgres-data', f'{PROJECT}-redis-data', f'{PROJECT}-minio-data',
}
EXPECTED_PORTS={61168,61169,61170}

def run(*argv):
    p=subprocess.run(list(argv),cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,check=False)
    return {'argv':list(argv),'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr}

def rows(text):
    return [line for line in text.splitlines() if line.strip()]

started=datetime.now(timezone.utc)
config=run('docker','compose','-f',str(BASE),'-f',str(OVERLAY),'-p',PROJECT,'config','--format','json')
config_hash=hashlib.sha256(config['stdout'].encode()).hexdigest()
ps=run('docker','compose','-f',str(BASE),'-f',str(OVERLAY),'-p',PROJECT,'ps','-a','--format','json')
project_ps=run('docker','ps','-a','--filter',f'label=com.docker.compose.project={PROJECT}','--format','{{json .}}')
volumes=run('docker','volume','ls','--format','{{.Name}}')
networks=run('docker','network','ls','--format','{{.Name}}')
ports=run('lsof','-nP','-iTCP:61168','-iTCP:61169','-iTCP:61170','-sTCP:LISTEN')
foreign=run('docker','ps','-a','--filter','publish=65379','--format','{{json .}}')
volume_rows=set(rows(volumes['stdout']))
network_rows=set(rows(networks['stdout']))
port_rows=rows(ports['stdout'])
foreign_rows=rows(foreign['stdout'])
errors=[]
if config['exit_code'] != 0: errors.append('compose-config-failed')
if ps['exit_code'] != 0: errors.append('compose-ps-failed')
if rows(ps['stdout']): errors.append('fresh-project-has-containers')
if rows(project_ps['stdout']): errors.append('fresh-project-label-has-containers')
if EXPECTED_VOLUMES & volume_rows: errors.append('fresh-project-has-volumes:'+','.join(sorted(EXPECTED_VOLUMES & volume_rows)))
if any(name == PROJECT or name.startswith(PROJECT+'-') for name in network_rows): errors.append('fresh-project-has-network')
if len(port_rows) > 1: errors.append('reserved-ports-occupied')
# lsof prints a header even when no listeners; only process rows count.
if any('LISTEN' in line for line in port_rows[1:]): errors.append('reserved-port-listener-present')
if not foreign_rows: errors.append('foreign-65379-missing-from-baseline')
result={
  'checked_at':started.isoformat(), 'project':PROJECT,
  'base_compose':str(BASE), 'overlay':str(OVERLAY),
  'overlay_sha256':hashlib.sha256(OVERLAY.read_bytes()).hexdigest(),
  'config_sha256':config_hash, 'config':config,
  'compose_ps':ps, 'project_label_ps':project_ps,
  'volumes':volumes, 'networks':networks, 'ports':ports,
  'foreign_65379':foreign, 'errors':errors,
  'expected_volumes':sorted(EXPECTED_VOLUMES), 'reserved_ports':sorted(EXPECTED_PORTS),
}
out=Path('/tmp/issue938-prepared-reader-r1/runtime/preflight.json')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'checked_at':result['checked_at'],'project':PROJECT,'overlay_sha256':result['overlay_sha256'],'config_sha256':config_hash,'errors':errors,'foreign_65379_lines':len(foreign_rows)},indent=2))
if errors: sys.exit(2)
