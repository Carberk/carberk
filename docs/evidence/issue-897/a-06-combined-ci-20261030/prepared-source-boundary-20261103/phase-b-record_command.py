#!/usr/bin/env python3
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

if len(sys.argv) < 3:
    raise SystemExit('usage: record_command.py <record-dir> <label> <argv...>')
record_dir = Path(sys.argv[1])
label = sys.argv[2]
argv = sys.argv[3:]
record_dir.mkdir(parents=True, exist_ok=True)
started = datetime.now(timezone.utc)
t0 = time.monotonic()
proc = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
t1 = time.monotonic()
ended = datetime.now(timezone.utc)
stdout_path = record_dir / f'{label}.stdout'
stderr_path = record_dir / f'{label}.stderr'
stdout_path.write_bytes(proc.stdout)
stderr_path.write_bytes(proc.stderr)
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
# Record only deterministic, non-secret runtime inputs. Callers pass the exact values needed by the run.
record = {
    'label': label,
    'argv': argv,
    'cwd': os.getcwd(),
    'env': {key: os.environ[key] for key in sorted(os.environ) if key in {
        'DATABASE_URL', 'REDIS_URL', 'MINIO_ENDPOINT', 'MINIO_PUBLIC_URL',
        'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_REGION', 'APP_ENV',
        'NODE_ENV', 'AUTO_TM_TEST_DATABASES', 'VITEST_POOL_ID', 'VITEST_MAX_WORKERS',
    }},
    'started_at': started.isoformat(),
    'ended_at': ended.isoformat(),
    'duration_ms': round((t1 - t0) * 1000, 3),
    'exit_code': proc.returncode,
    'stdout': {'path': str(stdout_path), 'bytes': len(proc.stdout), 'sha256': digest(stdout_path)},
    'stderr': {'path': str(stderr_path), 'bytes': len(proc.stderr), 'sha256': digest(stderr_path)},
}
(record_dir / f'{label}.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
sys.exit(proc.returncode)
