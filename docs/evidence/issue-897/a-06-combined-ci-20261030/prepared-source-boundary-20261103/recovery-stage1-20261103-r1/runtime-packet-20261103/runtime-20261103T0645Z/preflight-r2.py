import json,hashlib,subprocess,datetime
from pathlib import Path
root=Path('/Users/bagtyyar/.t3/worktrees/carberk/agent-release897-candidate-a-20261029')
packet=root/'docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103/recovery-stage1-20261103-r1/runtime-packet-20261103'
run=Path('/tmp/issue938-runtime-packet-20261103/run-20261103T0645Z')
run.mkdir(exist_ok=False)
w=Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-2d375913')
d=json.loads((packet/'input-pins.json').read_text()); stage=json.loads((packet/'stage-command.json').read_text())
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'worker':str(w),'expectedWorkerHead':stage['expectedWorkerHead'],'pinCounts':{},'commands':[]}
def command(argv,cwd=root):
 p=subprocess.run(argv,cwd=cwd,capture_output=True,text=True)
 out['commands'].append({'argv':argv,'cwd':str(cwd),'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
 return p
try:
 for group in ['trackedFiles','compiledFiles','migrations']:
  mism=[]
  for name,h in d[group].items():
   p=w/name if group!='migrations' else w/'packages/db/prisma/migrations'/name/'migration.sql'
   got=hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
   if got!=h: mism.append({'name':name,'expected':h,'got':got})
  out['pinCounts'][group]={'total':len(d[group]),'mismatches':mism}
  assert not mism,(group,mism[:5])
 assert command(['git','rev-parse','HEAD'],w).stdout.strip()==stage['expectedWorkerHead']
 assert command(['git','status','--porcelain'],w).stdout==''
 for kind,argv in [('containers',['docker','ps','--all','--filter',f'label=com.docker.compose.project={stage["project"]}','--format','{{.ID}} {{.Names}}']),('volumes',['docker','volume','ls','--filter',f'label=com.docker.compose.project={stage["project"]}','--format','{{.Name}}']),('networks',['docker','network','ls','--filter',f'label=com.docker.compose.project={stage["project"]}','--format','{{.Name}}'])]:
  p=command(argv); assert p.returncode==0 and not p.stdout.strip(),kind
 p=command(['lsof','-nP','-iTCP:61168','-iTCP:61169','-iTCP:61170','-sTCP:LISTEN']); assert p.returncode==1 and not p.stdout.strip(),'listeners'
 c=['docker','compose','--file',stage['composeFiles'][0],'--file',stage['composeFiles'][1],'--project-name',stage['project']]
 p=command(c+['config','--format','json'],w); assert p.returncode==0
 # resolved config is checked structurally; the reviewed raw canonical config is independently hashed.
 live=json.loads(p.stdout); reviewed=json.loads((packet/'resolved-compose.json').read_text()); assert live==reviewed,'resolved config differs'
 out['resolvedComposeSha256']=hashlib.sha256((packet/'resolved-compose.json').read_bytes()).hexdigest()
 p=command(['docker','image','inspect','postgres:16-alpine','redis:7-alpine','cgr.dev/chainguard/minio@sha256:8d5a0265f0e18fb3b29f95598147f1cc2a86b782181668bad176b0e90cce9569','--format','{{.RepoTags}} {{.RepoDigests}}']); assert p.returncode==0
 out['pass']=True
finally:
 (run/'preflight.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'pass':out.get('pass',False),'pins':{k:v['total'] for k,v in out['pinCounts'].items()},'path':str(run/'preflight.json')}))
