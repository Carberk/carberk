from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, subprocess
root=Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-57c0ba42')
prefix='docs/evidence/issue-897/a-pr904-audit-20261102/supplemental-repair-935'
evidence=root/prefix/'prerequisite-preparation-20261103'
base='a6de7b1b51039ea4b1d24ef7db9d8b21ca91d568'
source='cd7f4adb773f0a190dba74015ca2583f615c791b'
assembled='4199eb86d4846fecc6b53edca6c447ec868b1566'
expected={
'apps/admin/src/app/diagnostics/evidence-proxy.spec.ts',
'apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.ts',
'apps/api/src/modules/identity/infrastructure/PrismaStaffAuthority.spec.ts',
'apps/api/src/modules/identity/application/testing/DiagnosticMaterialHarness.ts',
'apps/api/src/modules/identity/application/testing/ReportPreparedHarness.ts',
'apps/api/src/modules/identity/infrastructure/ClassifiedForwardCapture.spec.ts',
'apps/api/src/modules/identity/infrastructure/DiagnosticMaterialPrepared.e2e.spec.ts',
'apps/api/src/modules/identity/infrastructure/DiagnosticPurgeEffectClosure.e2e.spec.ts',
'apps/api/src/modules/identity/infrastructure/DiagnosticReportsPrepared.e2e.spec.ts',
'apps/api/src/modules/identity/infrastructure/IdentityAuthorityPrepared.e2e.spec.ts',
'apps/api/src/modules/identity/infrastructure/IdentityAuthorityPrepared.spec.ts',
'apps/api/src/modules/identity/presentation/DiagnosticContinuityHandoff.spec.ts',
'apps/api/src/modules/identity/presentation/DiagnosticErasedPredecessorReaders.spec.ts',
'apps/api/src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts',
'packages/db/tests/service-history-callers.e2e.spec.ts',
}
def git(*argv): return subprocess.check_output(['git',*argv],cwd=root)
def sha(data): return hashlib.sha256(data).hexdigest()
def write(name,value):
 p=evidence/name
 with p.open('x') as f: f.write(json.dumps(value,indent=2)+'\n')
checks=[]
def compare(label,*argv):
 r=subprocess.run(['git',*argv],cwd=root,capture_output=True)
 d={'label':label,'argv':['git',*argv],'exit_code':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()}
 checks.append(d)
 return r.returncode
changed=git('diff','--name-only',base,source,'--','.','from-unused').decode().splitlines() if False else git('diff','--name-only',base,source).decode().splitlines()
source_paths={p for p in changed if not p.startswith('docs/')}
assert source_paths==expected,source_paths.symmetric_difference(expected)
assert all(p in expected or p.startswith(prefix+'/') for p in changed)
assert git('rev-parse','HEAD').decode().strip()==source
assert git('rev-parse','t3/57c0ba42').decode().strip()==base
assert compare('Base source equals assembled source excluding ONLY docs','diff','--exit-code',assembled,base,'--','.',':(exclude)docs/**',':(exclude)docs')==0
assert compare('Full final source intentionally differs from assembled source','diff','--quiet',assembled,source,'--','.',':(exclude)docs/**',':(exclude)docs')==1
assert compare('Everything outside exact allowed source and docs equals assembled source','diff','--exit-code',assembled,source,'--','.',':(exclude)docs/**',':(exclude)docs',*[':(exclude)'+p for p in sorted(expected)])==0
before=json.loads((evidence/'01-inputs-before.json').read_text())
inputs=[]
for item in before['inputs']:
 p=item['path']; digest=sha((root/p).read_bytes())
 inputs.append({**item,'afterSha256':digest,'unchanged':digest==item['sha256'],'authorizedRepairPath':p in expected})
assert all(i['unchanged'] or i['authorizedRepairPath'] for i in inputs)
for p in sorted(expected-set(i['path'] for i in inputs)):
 inputs.append({'path':p,'sha256':None,'afterSha256':sha((root/p).read_bytes()),'unchanged':False,'authorizedRepairPath':True})
preserved=[]
for pin in ['e322a639c6c996b04f6eca7c0144db9f9af04293','06b2110c3f26c5beb54ca514269ab9b7a785ac48','019cd45ebb883e5d5cee9b0b21a301b2199e2c85']:
 paths=git('ls-tree','-r','--name-only',pin,'--','docs/evidence/issue-897/a-pr904-audit-20261102').decode().splitlines()
 rows=[]
 for p in paths:
  old=git('show',pin+':'+p); current=(root/p).read_bytes()
  rows.append({'path':p,'sha256':sha(old),'afterSha256':sha(current),'unchanged':old==current})
 assert all(i['unchanged'] for i in rows)
 preserved.append({'pin':pin,'files':rows})
outputs_before=json.loads((evidence/'08-generated-output-hashes.json').read_text())
outputs=[]
for item in outputs_before['outputs']:
 p=item['path']; digest=sha((root/p).read_bytes())
 ignored=subprocess.run(['git','check-ignore','--quiet','--',p],cwd=root).returncode==0
 outputs.append({**item,'afterSha256':digest,'unchanged':digest==item['sha256'],'ignoredAfter':ignored})
assert all(i['unchanged'] and i['ignoredAfter'] for i in outputs)
commands=[]
for p in sorted(evidence.glob('*.command.json')):
 d=json.loads(p.read_text()); raw=evidence/d['raw_log']; matches=sha(raw.read_bytes())==d['raw_log_sha256']
 assert matches,p
 commands.append({'path':str(p.relative_to(root)),**d,'rawLogHashMatches':matches})
failures={}
for label in ['repair-api-red-confirmed','repair-api-green']:
 content=(evidence/(label+'.raw.log')).read_text()
 names=re.findall(r'^ FAIL  (.+)$',content,re.M)
 counts={}
 for name in names:
  suite=name.split(' > ')[0]; counts[suite]=counts.get(suite,0)+1
 failures[label]={'failures':names,'failuresBySuite':counts,'totals':re.findall(r'^\s*(?:Test Files|Tests) .+$',content,re.M)}
red=set(failures['repair-api-red-confirmed']['failures']); green=set(failures['repair-api-green']['failures'])
removed=red-green; added=green-red
assert len(green)==47 and len(removed)==9 and not added,(len(green),len(removed),added)
assert all('PrismaStaffAuthority.spec.ts' in n for n in removed)
constructors=git('grep','-n','new PrismaStaffAuthority',source,'--','apps/api/src','packages/db/tests').decode().splitlines()
changed_rows=[]
for p in changed:
 old=subprocess.run(['git','show',base+':'+p],cwd=root,capture_output=True)
 new=git('show',source+':'+p)
 changed_rows.append({'path':p,'baseSha256':sha(old.stdout) if old.returncode==0 else None,'sourceSha256':sha(new),'scope':'source/test' if p in expected else 'new supplemental evidence'})
write('repair-final-input-hashes-r2.json',{'checkedAtUtc':datetime.now(timezone.utc).isoformat(),'inputs':inputs,'preservedEvidence':preserved,'generatedOutputs':outputs})
write('repair-final-audit-r2.json',{'checkedAtUtc':datetime.now(timezone.utc).isoformat(),'cwd':str(root),'executor':'issue935-supplemental-repair-20261103-r1','branch':git('branch','--show-current').decode().strip(),'scaffold':{'ref':'t3/57c0ba42','head':base},'sourceCommit':source,'sourceTree':git('rev-parse',source+'^{tree}').decode().strip(),'redCheckpoint':'019cd45ebb883e5d5cee9b0b21a301b2199e2c85','preparationCheckpoint':'06b2110c3f26c5beb54ca514269ab9b7a785ac48','checks':checks,'changedPathsAtSource':changed_rows,'constructorInventory':constructors,'commands':commands,'apiFailureComparison':{'runs':failures,'removedFailures':sorted(removed),'addedFailures':sorted(added)},'summary':{'originalTrackedNonDocInputs':len(before['inputs']),'unchangedOriginalInputs':sum(i['unchanged'] for i in inputs),'changedAllowedExistingInputs':sum(not i['unchanged'] for i in inputs if i['sha256'] is not None),'newAllowedInputs':sum(i['sha256'] is None for i in inputs),'sourceTestPaths':len(expected),'generatedOutputsUnchangedAndIgnored':len(outputs)}})
print(json.dumps({'source':source,'sourcePaths':len(expected),'commandsHashed':len(commands),'unchangedExistingInputs':sum(i['unchanged'] for i in inputs),'preservedPins':[(r['pin'],len(r['files'])) for r in preserved],'generatedOutputs':len(outputs),'apiFailuresRemoved':len(removed),'apiUnchangedFailures':len(green)},indent=2))
