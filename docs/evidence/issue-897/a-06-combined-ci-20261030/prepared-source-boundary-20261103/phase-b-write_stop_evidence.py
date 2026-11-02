import hashlib,json,shutil,subprocess
from pathlib import Path
from datetime import datetime,timezone
root=Path('docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103')
base='1149953c1237ea362509db7dddbed29c60395d0a'
draft='7a3333dadf8dd668c9b7df886d37988496839598'
restored='cf6c483c974580b3a57dffca1d29aa9dfbf133b8'
helper='apps/api/test/helpers/diagnosticPreparedReaderFixture.ts'
now=datetime.now(timezone.utc).isoformat()
gaps=[
 {'id':'G01','kind':'implementation-admission','case':'all 56 replacement cases','location':helper+':183-211,466-468','dependency':'A launched fixture must assert injected apiTestDatabases/workerUrls, pool 1, current_database/current_user and Redis DB1 before writes; bootstrap and governed nonowner-role clients must be separate, with recorded exact grants.','observed':'The helper takes app.get(PrismaService) directly and starts the app/bootstrap writes. No nonowner role/grants exist. assertPreparedDatabases is exported but uncalled.','status':'NOT_IMPLEMENTED_NO_RUNTIME_ATTEMPT'},
 {'id':'G02','kind':'oracle-loss','case':'43 of 56 expanded cases','location':'assertion-equivalence.json','dependency':'Restore and implement all original literal status, DTO, privacy, retry, cursor and erasure assertions.','observed':'43 expanded cases are unconditional feasibilityStop errors without original assertions. These are placeholders, not a demonstration of infeasibility.','status':'DRAFT_REJECTED'},
 {'id':'G03','kind':'weakened-probe-oracle','case':'lets only the selected current B technician reload a minimal usable handle without A access','location':'apps/api/src/modules/identity/presentation/DiagnosticContinuityHandoff.e2e.spec.ts:26-38','dependency':'Preserve exact cache-control no-store, private, original proof-detail actor, and assigned foreign technician empty handoffs assertion.','observed':'Exact toBe("no-store, private") became toContain("no-store"); the proof-detail actor changed from technician to reviewer; the assigned foreign technician empty DTO assertion was removed.','status':'DRAFT_REJECTED'},
 {'id':'G04','kind':'invalid-ownership-preparation','case':'F01 accepts a separate synthetic classification without adding it to observedVehicle or changing observation hash v1','location':'apps/api/src/modules/identity/infrastructure/ClassifiedForwardCapture.e2e.spec.ts:28-36; '+helper+':354-362','dependency':'Create the lawful ownership grant before first raw capture; preserve source Listing and seller/commissioner linkage assertions.','observed':'visit captures the first raw before grant(); sourceListingId expectation changes from the source Listing ID to null.','status':'DRAFT_REJECTED'},
 {'id':'G05','kind':'missing-erasure-and-oracles','case':'projects commissioner and currently assigned staff reads, preserving the exact technician mutation receipt and B source','location':'apps/api/src/modules/identity/presentation/DiagnosticErasedPredecessorReaders.e2e.spec.ts:19-44; '+helper+':441-443','dependency':'Use actual isolated predecessor erasure/purge and retain both commissioner/staff projections, findings/mileage literals, three unavailable documents, assignment-loss denial and retry denial.','observed':'eraseSubject only DELETEs /api/v1/me, which schedules grace-period deletion in DeleteMe.ts:48-54. No PurgeExpiredAccounts import/use exists. A/B share commissioner. Listed original assertions are omitted.','status':'DRAFT_REJECTED'},
 {'id':'G06','kind':'missing-cleanup-contract','case':'all four probe suites','location':helper+':444-460','dependency':'Own partial setup on every exit; drain callers; verify zero receipts/transactions, exact guard modes, owned object namespace, roles and connections; scoped cleanup must respect immutable guards.','observed':'Cleanup directly deletes guarded reports/proofs while orders exist and has no assertions for receipts, object-list emptiness, role/grants, Redis DB1, guard modes or active backends. Failure during openPreparedReaderFixture can leak resources before f is assigned.','status':'NOT_IMPLEMENTED_NO_RUNTIME_ATTEMPT'},
 {'id':'G07','kind':'unresolved-lawful-state-equivalence','case':'F47 omits malformed required retained evidence without a partial candidate or protected error','original_location':'apps/api/src/modules/identity/presentation/DiagnosticScopedDiscovery.spec.ts:203-209','guard_location':'packages/db/prisma/migrations/20261029190000_operational_reset_row_admission/migration.sql:434-467','dependency':'Provide an approved lawful equivalent for a retained evidence provenance SHA that disagrees with its verified provenance, while retaining the literal 200 and empty scoped DTO. Otherwise disposition this unreachable retained-data scenario at its appropriate test boundary.','observed':'The original changes diagnosticIdentityEvidence.provenance.sha256 to "f".repeat(64). The current INSERT guard binds copies to verified provenance SHA/mime/size; the UPDATE guard forbids provenance changes on unerased evidence and raises diagnostic_identity_evidence_immutable. The draft merely throws.','status':'STATIC_DEPENDENCY_OPEN_NOT_A_RUNTIME_PRODUCTION_FAILURE'},
 {'id':'G08','kind':'stale-affected-check-inputs','case':'final helper source','location':'phase-b-offline-raw/; phase-b-raw/source-amend-timeline.stdout','dependency':'After any authorized future implementation, renew the package/offline reservation and run affected TS7, TS6, lint and build against an immutable final input set.','observed':'Successful TS7/TS6/lint checks precede final helper amendments; API build excludes test/, *.spec.ts and *.e2e.spec.ts. Complete contemporaneous source/env capture was not recorded for the earlier commands.','status':'NO_FINAL_INPUT_GREEN_CLAIM'}
]
admission={'recorded_at':now,'status':'STOP_BEFORE_RUNTIME_NOT_CODE_READY','draft_commit':draft,'draft_tree':'e1a89710bdc76a1b0aab327cba7123a7628f2efb','gaps':gaps,'disposition':'Draft replacements and helper were restored/reverted in '+restored+'. Do not cherry-pick or assemble the rejected draft in isolation. No production defect, permission defect, or SQL repair is established by this source audit.'}
(root/'admission-gaps.json').write_text(json.dumps(admission,indent=2)+'\n')
receipt=json.loads((root/'offline-preparation.json').read_text())
receipt['status']='HISTORICAL_DRAFT_PREPARATION_NOT_CODE_READY'
receipt['source_pin_meaning']='Identifies the rejected draft being audited. Not a claim these commands ran against all final source bytes.'
receipt['final_source_commit']=restored
receipt['final_source_tree']='f9b9db8d7d7ef544887bc1472272f4a0e3134697'
receipt['validation_to_final_draft']='NOT_ESTABLISHED: affected checks predate final helper amendments; API build excludes tests. See admission-gaps.json G08.'
receipt['resources']['status']='NOT_STARTED_ADMISSION_STOP'
receipt['runtime_gate']='NOT_ENTERED: fixture/oracle/cleanup admission failed before resource creation; probe and full selectors not invoked.'
receipt['test_equivalence']['equivalence_status']='FAIL; declaration count only. 43 placeholders. Original files restored after audit.'
(root/'offline-preparation.json').write_text(json.dumps(receipt,indent=2)+'\n')
# Offline metadata and raw logs are copied byte-for-byte. Preserve original paths, argv, timing and limitations.
commands=[]
for p in sorted((root/'phase-b-offline-raw').glob('*.json')):
 d=json.loads(p.read_text()); rows=d.get('commands',[d])
 for row in rows:
  row=dict(row); row['metadata_file']=str(p.relative_to(root));
  log=Path(row['log']);local=root/'phase-b-offline-raw'/log.name
  row['evidence_log']=str(local.relative_to(root))
  row['copied_log_sha256']=hashlib.sha256(local.read_bytes()).hexdigest()
  row['log_hash_matches_metadata']=row['copied_log_sha256']==row['log_sha256']
  row['stream_format']='preserved original combined raw .log; separate stdout/stderr not recorded'
  commands.append(row)
assert all(x['log_hash_matches_metadata'] for x in commands)
(root/'offline-command-index.json').write_text(json.dumps({'status':'HISTORICAL_ATTEMPTS_ONLY','commands':commands,'environment_completeness':'Only environment values explicitly captured by original metadata are available; full inherited environment is not reconstructed.','input_completeness':'Current input hashes are separately observed. Earlier attempts lack complete contemporaneous source hashes.','final_draft_validation':'NOT_ESTABLISHED'},indent=2)+'\n')
paths=[c['source_path'] for c in json.loads((root/'case-map.json').read_text())['cases']]
paths=list(dict.fromkeys(paths))+[x['path'] for x in json.loads((root/'assertion-equivalence.json').read_text())['unchanged']]
files=[]
for p in paths:
 b=subprocess.check_output(['git','show',base+':'+p]);c=Path(p).read_bytes()
 files.append({'path':p,'base_sha256':hashlib.sha256(b).hexdigest(),'restored_sha256':hashlib.sha256(c).hexdigest(),'byte_equal':b==c})
assert all(x['byte_equal'] for x in files)
restoration={'recorded_at':now,'status':'ORIGINAL_COVERAGE_RESTORED_NO_ACCEPTANCE_RUN','rejected_draft_commit':draft,'restoration_commit':restored,'restoration_tree':subprocess.check_output(['git','rev-parse',restored+'^{tree}'],text=True).strip(),'initial_base':base,'tree_equals_initial_base':subprocess.check_output(['git','rev-parse',restored+'^{tree}'],text=True)==subprocess.check_output(['git','rev-parse',base+'^{tree}'],text=True),'original_four_case_count':56,'unchanged_five_case_count':168,'required_total':224,'files':files,'memory_refusal':'byte-identical to source 87456f4f; preserved','replacement_files_and_helper':'absent from delivered source; rejected draft retained in git history','source_delta_to_initial_base':'none','tests_executed':0}
(root/'restoration-receipt.json').write_text(json.dumps(restoration,indent=2)+'\n')
shutil.copy2('/tmp/issue938-prepared-reader-r1/collect_handoff.py',root/'phase-b-collect_handoff.py')
shutil.copy2('/tmp/issue938-prepared-reader-r1/write_stop_evidence.py',root/'phase-b-write_stop_evidence.py')
print(json.dumps({'status':admission['status'],'gaps':len(gaps),'offline_commands':len(commands),'raw_log_hashes_match':True,'restored_files':len(files),'restoration_commit':restored},indent=2))
