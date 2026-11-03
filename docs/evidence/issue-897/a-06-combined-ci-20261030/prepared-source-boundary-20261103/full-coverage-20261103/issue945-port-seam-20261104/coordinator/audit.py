import base64, datetime, hashlib, json, subprocess
from pathlib import Path
BASE='39c63fad462885846840149b15771654980bdaa7'
SOURCE='63766f9a3ad4b10562f19c874323e1b89e2ff1fc'
HEAD='b425fe1800514f4253872463eb0db7c35556302d'
PREFIX='docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103/full-coverage-20261103/issue945-port-seam-20261104'
WRITER=Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-8df8a508')
p=WRITER/PREFIX
paths=['apps/api/test/helpers/diagnosticPreparedReaderFixture.ts','apps/api/test/helpers/diagnosticPreparedReaderFixture.boundary.spec.ts']
def git(*args): return subprocess.check_output(['git',*args])
def sha(b): return hashlib.sha256(b).hexdigest()
def tree(ref):
 d={}
 for v in git('ls-tree','-r','-z',ref).split(b'\0'):
  if v:
   h,path=v.split(b'\t',1); d[path.decode()]=h.decode().split()[2]
 return d
assert git('status','--porcelain')==b''
assert git('rev-parse','HEAD').decode().strip()==BASE
assert subprocess.check_output(['git','-C',str(WRITER),'status','--porcelain'])==b''
assert subprocess.check_output(['git','-C',str(WRITER),'rev-parse','HEAD']).decode().strip()==HEAD
remote=git('ls-remote','origin','refs/heads/agent/issue-945-diagnostic-postgres-port-seam').decode().split()[0]
assert remote==HEAD
b,s,h=tree(BASE),tree(SOURCE),tree(HEAD)
changed={q for q in set(b)|set(h) if b.get(q)!=h.get(q)}
assert sorted(q for q in changed if not q.startswith('docs/'))==sorted(paths)
assert all(q.startswith(PREFIX+'/') or q in paths for q in changed)
prior_docs={q:v for q,v in b.items() if q.startswith('docs/')}
assert all(h.get(q)==v for q,v in prior_docs.items())
assert all(h.get(q)==v for q,v in s.items() if not q.startswith('docs/'))
evidence=[q for q in changed if q.startswith(PREFIX+'/')]
assert all(q not in b for q in evidence)
assert {str(x.relative_to(WRITER)) for x in p.rglob('*') if x.is_file()}==set(evidence)
manifest_count=0
for line in (p/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split('  ',1); assert sha((p/name).read_bytes())==digest,(name,'SHA256SUMS'); manifest_count+=1
artifact=json.loads((p/'artifact-sha256.json').read_text())
for a in artifact['files']:
 raw=(p/a['path']).read_bytes(); assert len(raw)==a['bytes'] and sha(raw)==a['sha256']
 assert git('hash-object',str(p/a['path'])).decode().strip()==a['git_blob_sha1']
enc={e['logical_path']:e for e in json.loads((p/'raw-stream-encoding.json').read_text())['streams']}
def raw_for(logical):
 if logical in enc:
  e=enc[logical]; stored=(p/e['stored_path']).read_bytes(); assert sha(stored)==e['stored_sha256']
  raw=base64.b64decode(stored,validate=False)
  assert len(raw)==e['decoded_bytes'] and sha(raw)==e['decoded_sha256']; return raw
 return (p/logical).read_bytes()
raw_count=0
for f in p.rglob('*.json'):
 d=json.loads(f.read_text())
 commands=d.get('commands',[]) if isinstance(d,dict) else []
 if isinstance(d,dict) and 'argv' in d and 'stdout_sha256' in d: commands=[d]
 for c in commands:
  if 'stdout_sha256' not in c: continue
  for stream in ('stdout','stderr'):
   logical=str((f.parent/c[stream]).relative_to(p)); data=raw_for(logical)
   assert sha(data)==c[stream+'_sha256'],(str(f),stream)
   if stream+'_bytes' in c: assert len(data)==c[stream+'_bytes']
   raw_count+=1
final=json.loads((p/'checks/final/offline-command-receipts.json').read_text())
assert len(final['commands'])==6
for i,c in enumerate(final['commands']):
 assert c['exit']==0
 assert c['subsequently_committed_source']==SOURCE
 for q,v in c['checked_source_files'].items():
  raw=git('show',SOURCE+':'+q)
  assert sha(raw)==v['sha256'] and s[q]==v['git_blob_sha1']
 if i: assert c['started_at_utc']>=final['commands'][i-1]['ended_at_utc']
green=raw_for('checks/final/focused-boundary-green.stdout').decode()
assert '10 passed' in green
red=raw_for('checks/red/red.stderr').decode()
assert 'expectedDiagnosticPostgresPort' in red and 'is not a function' in red
subprocess.run(['git','diff','--check',BASE,HEAD],check=True)
patch=git('diff','--binary',BASE,SOURCE,'--',*paths)
helper=git('show',SOURCE+':'+paths[0]).decode().splitlines()
blocker=[]
for i,line in enumerate(helper,1):
 if '"owned_redis_db1"' in line or '"owned_storage"' in line:
  blocker.append({'path':paths[0],'line':i,'text':line})
result={
 'kind':'issue945-independent-coordinator-terminal-audit','recorded_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'base':BASE,'base_tree':git('rev-parse',BASE+'^{tree}').decode().strip(),
 'source':SOURCE,'source_tree':git('rev-parse',SOURCE+'^{tree}').decode().strip(),
 'evidence_head':HEAD,'evidence_tree':git('rev-parse',HEAD+'^{tree}').decode().strip(),
 'writer_remote_matches_clean_worktree':True,'source_paths':paths,'source_blobs':{q:s[q] for q in paths},
 'source_sha256':{q:sha(git('show',SOURCE+':'+q)) for q in paths},'selective_source_patch_sha256':sha(patch),
 'prior_docs_preserved':len(prior_docs),'prior_evidence_preserved':sum(q.startswith('docs/evidence/') for q in prior_docs),
 'new_writer_evidence_files':len(evidence),'sha256sums_verified':manifest_count,'artifact_entries_verified':len(artifact['files']),
 'raw_stream_verifications':raw_count,'all_six_serial_final_checks_exit_zero':True,'focused_boundary_cases_passed':10,
 'final_check_source_inputs_match_source_commit':True,'full_range_diff_check_exit':0,
 'original_F16_F17_e2e_and_production_unchanged':True,'issue945_audit_result':'PASS within its PG-only contract; reviews required',
 'issue944_runtime_readiness':'BLOCKED before reservation/services: preserved Redis and MinIO guards conflict with mandatory fresh tuple',
 'issue944_exact_source_boundary':blocker,
 'required_next_bounded_contract':'Strict explicit test-only expected Redis/MinIO endpoint seams, preserving default historical guards and fresh-tuple ownership; requires actual amended/separate issue authority, unchanged production/cases/assertions and review. Do not widen #945 unasked.',
 'runtime_started':False,'resources_reserved':False,
 'executor_settings':{'provider':'codex_work','model':'gpt-6.1-sol','reasoningEffort':'xhigh','serviceTier':'default','runtimeMode':'full-access'}
}
Path('/tmp/issue945-coordinator-terminal-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
