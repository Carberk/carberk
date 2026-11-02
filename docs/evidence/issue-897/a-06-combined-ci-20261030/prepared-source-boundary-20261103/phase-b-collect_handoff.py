import hashlib,json,shutil,subprocess,time
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-2d375913')
TMP=Path('/tmp/issue938-prepared-reader-r1')
OUT=ROOT/'docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103'
PROJECT='auto_tm_ci_897_938_20261103_r1'
def sha(b): return hashlib.sha256(b).hexdigest()
def cmd(argv,label):
 t=time.monotonic();start=datetime.now(timezone.utc).isoformat()
 p=subprocess.run(argv,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 target=OUT/'phase-b-raw';target.mkdir(exist_ok=True)
 (target/(label+'.stdout')).write_bytes(p.stdout);(target/(label+'.stderr')).write_bytes(p.stderr)
 r={'argv':argv,'cwd':str(ROOT),'started_at':start,'ended_at':datetime.now(timezone.utc).isoformat(),'duration_seconds':round(time.monotonic()-t,6),'exit_code':p.returncode,'stdout':{'path':'phase-b-raw/'+label+'.stdout','sha256':sha(p.stdout),'bytes':len(p.stdout)},'stderr':{'path':'phase-b-raw/'+label+'.stderr','sha256':sha(p.stderr),'bytes':len(p.stderr)}}
 (target/(label+'.command.json')).write_text(json.dumps(r,indent=2)+'\n')
 return p,r
p1,r1=cmd(['docker','ps','-a','--filter','label=com.docker.compose.project='+PROJECT,'--format','{{json .}}'],'project-containers')
p2,r2=cmd(['docker','volume','ls','--format','{{json .}}'],'volume-inventory')
p3,r3=cmd(['docker','network','ls','--format','{{json .}}'],'network-inventory')
p4,r4=cmd(['lsof','-nP','-iTCP:61168','-iTCP:61169','-iTCP:61170','-sTCP:LISTEN'],'reserved-port-listeners')
p5,r5=cmd(['docker','ps','-a','--filter','name=^/auto_tm_ci_897_r6c_candidatea_1-postgres-1$','--format','{{json .}}'],'foreign65379-read-only')
p6,r6=cmd(['docker','compose','-f','infra/compose/docker-compose.ci.yml','-f',str(TMP/'compose-overlay.yml'),'-p',PROJECT,'config','--format','json'],'final-compose-config-not-started')
p7,r7=cmd(['git','diff','--name-status','1149953c1237ea362509db7dddbed29c60395d0a','HEAD'],'source-path-diff')
p8,r8=cmd(['git','diff','--check','1149953c1237ea362509db7dddbed29c60395d0a','HEAD'],'source-diff-check')
p9,r9=cmd(['git','diff','--quiet','87456f4fe6b564d2edbc40ef807d6a75ef37f452','HEAD','--','packages/db/src/testing/DiagnosticMemoryDatabase.ts'],'memory-refusal-equality')
p10,r10=cmd(['git','worktree','list','--porcelain'],'worktree-inventory')
p11,r11=cmd(['git','reflog','-8','--date=iso'],'source-amend-timeline')
volumes=[json.loads(x) for x in p2.stdout.decode().splitlines() if x.strip()]
networks=[json.loads(x) for x in p3.stdout.decode().splitlines() if x.strip()]
ownedvol=[x for x in volumes if PROJECT in json.dumps(x)]
ownednet=[x for x in networks if PROJECT in json.dumps(x)]
foreign=[json.loads(x) for x in p5.stdout.decode().splitlines() if x.strip()]
cleanup={'recorded_at':datetime.now(timezone.utc).isoformat(),'status':'NOT_STARTED_NO_RUNTIME_OBJECTS_CREATED','project':PROJECT,'project_container_rows':len(p1.stdout.splitlines()),'project_volumes':ownedvol,'project_networks':ownednet,'reserved_listeners':p4.stdout.decode(),'foreign65379_container_ids':[x['ID'] for x in foreign],'foreign65379_expected_id':'c5343d232d17','foreign65379_baseline_id_unchanged':any(x['ID']=='c5343d232d17' for x in foreign),'foreign_operations':'read-only docker inventory; no exec/connect/mutation','runtime_actions':{'compose_up':0,'db_connections':0,'role_grants':0,'migrations_applied':0,'test_runs':0,'redis_commands':0,'object_storage_commands':0,'compose_down':0},'not_created':['base_database','globalSetup_template','globalSetup_worker_w1','non_owner_roles','source_receipts','campaign_receipts','MinIO_bucket_or_keys','Redis_DB1_keys'],'sql_zero_row_assertions':'NOT_RUN; no owned database exists; no foreign DB was queried','guard_mode_comparison':'NOT_APPLICABLE; no database/guard modes were created or changed','connection_and_role_cleanup':'NOT_APPLICABLE; none opened/created','proof_scope':'No runtime resources were created by this writer; inventory proves no matching project resources or reserved port listeners at terminal snapshot. This is not a completed real-DB cleanup run.','commands':[r1,r2,r3,r4,r5]}
assert not p1.stdout.strip() and not ownedvol and not ownednet and not p4.stdout.strip() and cleanup['foreign65379_baseline_id_unchanged']
(OUT/'runtime-not-started-cleanup.json').write_text(json.dumps(cleanup,indent=2)+'\n')
shutil.copytree(TMP/'offline',OUT/'phase-b-offline-raw',dirs_exist_ok=True)
for f in ['compose-overlay.yml','record_command.py','runtime_preflight.py','runtime_ownership.py','audit_equivalence.cjs']:
 shutil.copy2(TMP/f,OUT/('phase-b-'+f))
# These are observed current pins, not a retroactive assertion that earlier checks used current test inputs.
tracked=subprocess.check_output(['git','ls-files','packages/contracts','packages/db','apps/worker','apps/api/package.json','apps/api/tsconfig.json','apps/api/tsconfig.build.json','apps/api/vitest.config.mts','apps/api/test/globalSetup.ts','apps/api/test/setup-env.ts','apps/api/test/helpers/testDatabases.ts','package.json','pnpm-lock.yaml','pnpm-workspace.yaml'],cwd=ROOT,text=True).splitlines()
inputs={p:sha((ROOT/p).read_bytes()) for p in tracked if (ROOT/p).is_file()}
compiled=['packages/contracts/dist/index.js','packages/db/dist/src/index.js','apps/worker/dist/jobs/PurgeExpiredAccounts.js','apps/worker/dist/jobs/diagnostics/DiagnosticArtifactWorker.js','apps/worker/dist/jobs/diagnostics/S3DiagnosticArtifactObjects.js','apps/api/dist/src/main.js']
pins={'captured_at':datetime.now(timezone.utc).isoformat(),'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'source_tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip(),'tracked_input_sha256':inputs,'observed_compiled_sha256':{p:sha((ROOT/p).read_bytes()) for p in compiled},'applied_migrations':None,'applied_migration_status':'NOT_APPLIED_NO_DATABASE_CREATED','build_scope':'API tsconfig.build.json excludes test/, *.spec.ts and *.e2e.spec.ts. API build cannot validate replacement tests.','check_input_limitation':'Final helper source amendment at 23:08:57 UTC follows successful TS7 at 23:00:39, TS6 at 23:00:47, lint at 23:01:30 and API build at 23:05:24. No compiler/lint result is claimed for the final helper.','source_input_capture_limitation':'Earlier offline manifests did not capture a complete contemporaneous source hash set or full inherited environment. Present hashes identify current files only.'}
(OUT/'phase-b-input-pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print(json.dumps({'source':pins['source_commit'],'cleanup':cleanup['status'],'project_resources':0,'reserved_listeners':0,'offline_files_copied':len(list((OUT/'phase-b-offline-raw').iterdir())),'input_files':len(inputs)},indent=2))
