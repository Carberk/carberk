from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import time

root = Path('/Users/bagtyyar/.t3/worktrees/carberk/t3-57c0ba42')
evidence = root / 'docs/evidence/issue-897/a-pr904-audit-20261102/supplemental-repair-935/prerequisite-preparation-20261103'
label = sys.argv[1]
argv = sys.argv[2:]
record_path = evidence / (label + '.command.json')
log_path = evidence / (label + '.raw.log')
if record_path.exists() or log_path.exists():
    raise SystemExit('Refusing to overwrite existing command evidence')
overrides = {}
if label == '05-db-build':
    overrides['DATABASE_URL'] = 'postgresql://issue935_prereq:synthetic@127.0.0.1:9/issue935_prereq_unreachable?schema=public'
if label.startswith('repair-api-'):
    overrides['AUTO_TM_TEST_DATABASES'] = 'off'
env = os.environ.copy()
env.update(overrides)
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
started = datetime.now(timezone.utc).isoformat()
clock = time.monotonic()
with log_path.open('wb') as output:
    result = subprocess.run(argv, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
record = {
    'cwd': str(root), 'head': head, 'argv': argv,
    'environment_overrides': overrides, 'started_at_utc': started,
    'ended_at_utc': datetime.now(timezone.utc).isoformat(),
    'duration_seconds': time.monotonic() - clock, 'exit_code': result.returncode,
    'raw_log': log_path.name,
    'raw_log_sha256': hashlib.sha256(log_path.read_bytes()).hexdigest(),
}
record_path.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2), flush=True)
print(log_path.read_text(errors='replace')[-24000:], flush=True)
raise SystemExit(result.returncode)
