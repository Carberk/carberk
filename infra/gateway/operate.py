#!/usr/bin/env python3
"""Initial closed-staging installation or rollback to the prior absent gateway.

Run only after approval of the concrete shared-ingress change. Never replaces an
existing Carberk installation; later upgrades require their own reviewed plan.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

CONFIG = Path('/etc/carberk')
RELEASE = Path('/opt/carberk-gateway')
OVERRIDE = Path('/etc/snikket/docker-compose.override.yml')
UNIT_DIR = Path('/etc/systemd/system')
UNITS = ['carberk-egress.service', 'carberk-gateway.service']
CONTAINER = 'snikket-proxy'
INGRESS = '/etc/nginx/conf.d/carberk.conf'


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL, timeout=45)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect():
    item = json.loads(run('docker', 'inspect', CONTAINER))[0]
    volume = next(m['Source'] for m in item['Mounts'] if m['Destination'] == '/snikket')
    return item['Id'], Path(volume) / 'carberk-staging-tls'


def absent():
    container_id, tls_dir = inspect()
    paths = [CONFIG, RELEASE, OVERRIDE, tls_dir, *(UNIT_DIR / n for n in UNITS)]
    if any(p.exists() or p.is_symlink() for p in paths):
        raise ValueError('Managed destination already exists')
    run('docker', 'exec', CONTAINER, 'test', '!', '-e', INGRESS)
    run('docker', 'exec', CONTAINER, 'nginx', '-t')
    return container_id, tls_dir


def apply(prepared, runtime):
    container_id, tls_dir = absent()
    descriptor = json.loads((runtime / 'runtime.json').read_text())
    if sha(runtime / 'node.tar.xz') != descriptor['sha256']:
        raise ValueError('Runtime checksum mismatch')
    config = json.loads((runtime / 'gateway.json').read_text())
    if config['origin'] != 'https://api-staging-2861.up.railway.app':
        raise ValueError('Staging required')
    CONFIG.mkdir(mode=0o700)
    state = {'container': container_id, 'tls_dir': str(tls_dir), 'files': {}}
    def record():
        (CONFIG / 'install-state.json').write_text(json.dumps(state))
    record()  # Retain a receipt even if installation stops part-way.
    for name in ['gateway.json', 'relay.json']:
        destination = CONFIG / ('egress.json' if name == 'relay.json' else name)
        shutil.copyfile(runtime / name, destination)
        destination.chmod(0o600)
    shutil.copyfile(prepared / 'gateway.conf', CONFIG / 'gateway.conf')
    RELEASE.mkdir(mode=0o755)
    release = RELEASE / 'initial'
    release.mkdir(mode=0o755)
    (release / 'node/bin').mkdir(parents=True, mode=0o755)
    shutil.copyfile(runtime / ('node-v' + descriptor['version'] + '-linux-x64/bin/node'), release / 'node/bin/node')
    (release / 'node/bin/node').chmod(0o755)
    for name in ['gateway.mjs', 'serve.mjs']:
        shutil.copyfile(runtime / name, release / name)
    (RELEASE / 'current').symlink_to(release, target_is_directory=True)
    tls_dir.mkdir(mode=0o700)
    for name in ['fullchain.pem', 'privkey.pem']:
        shutil.copyfile(prepared / 'tls' / name, tls_dir / name)
        (tls_dir / name).chmod(0o600)
    for directory in [CONFIG, RELEASE, tls_dir]:
        for owned in directory.rglob('*'):
            if owned.is_file() and owned.name != 'install-state.json':
                state['files'][str(owned)] = sha(owned)
    record()
    for name in UNITS:
        destination = UNIT_DIR / name
        shutil.copyfile(prepared / name, destination)
        state['files'][str(destination)] = sha(destination)
        record()
    shutil.copyfile(prepared / 'docker-compose.override.yml', OVERRIDE)
    state['files'][str(OVERRIDE)] = sha(OVERRIDE)
    state['ingress_sha256'] = sha(CONFIG / 'gateway.conf')
    record()
    run('docker', 'cp', str(CONFIG / 'gateway.conf'), CONTAINER + ':' + INGRESS)
    run('docker', 'exec', CONTAINER, 'nginx', '-t')
    run('systemctl', 'daemon-reload')
    run('systemctl', 'enable', '--now', *UNITS)
    # A failed readiness gate leaves the old nginx workers serving unchanged.
    request = urllib.request.Request('http://127.0.0.1:11880/healthz', headers={
        'Host': config['hostname'], 'X-Carberk-Gateway-Key': config['accessKey']})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + 25
    while True:
        try:
            with opener.open(request, timeout=min(6, max(0.1, deadline - time.monotonic()))) as response:
                body = json.load(response)
                if body.get('environment') != 'staging' or body.get('service') != 'api':
                    raise ValueError('Staging identity mismatch')
                break
        except OSError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.5)  # Only this side-effect-free readiness GET is retried.
    run('docker', 'exec', CONTAINER, 'nginx', '-s', 'reload')
    print(json.dumps({'installed': True, 'nginx_gracefully_reloaded': True}))


def rollback():
    state = json.loads((CONFIG / 'install-state.json').read_text())
    container_id, tls_dir = inspect()
    if container_id != state['container'] or str(tls_dir) != state['tls_dir']:
        raise ValueError('Ingress container changed; review rollback before proceeding')
    for directory in [CONFIG, RELEASE, tls_dir]:
        for owned in directory.rglob('*'):
            if owned.is_file() and owned.name != 'install-state.json' and str(owned) not in state['files']:
                raise ValueError('Unrecorded file; preserve it for review')
    for external in [OVERRIDE, *(UNIT_DIR / n for n in UNITS)]:
        if external.exists() and str(external) not in state['files']:
            raise ValueError('Unrecorded external file; preserve it for review')
    for name, digest in state['files'].items():
        if sha(Path(name)) != digest:
            raise ValueError('Managed file changed; preserve it for review')
    try:
        content = run('docker', 'exec', CONTAINER, 'cat', INGRESS)
    except subprocess.CalledProcessError:
        content = None
    if content is not None:
        if hashlib.sha256(content).hexdigest() != state.get('ingress_sha256'):
            raise ValueError('Ingress changed; preserve it for review')
        run('docker', 'exec', CONTAINER, 'rm', INGRESS)
        run('docker', 'exec', CONTAINER, 'nginx', '-t')
        run('docker', 'exec', CONTAINER, 'nginx', '-s', 'reload')
    for unit in UNITS:
        if (UNIT_DIR / unit).exists():
            run('systemctl', 'disable', '--now', unit)
            (UNIT_DIR / unit).unlink()
    OVERRIDE.unlink(missing_ok=True)
    for path in [tls_dir, RELEASE, CONFIG]:
        if path.exists():
            shutil.rmtree(path)
    run('systemctl', 'daemon-reload')
    print(json.dumps({'rolled_back_to_absent': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'apply', 'rollback'])
    parser.add_argument('--prepared', type=Path)
    parser.add_argument('--runtime', type=Path)
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            raise ValueError('Root required')
        if args.action == 'rollback':
            rollback()
        elif args.action == 'check':
            absent()
            print(json.dumps({'destinations_absent': True, 'existing_nginx_valid': True}))
        else:
            if args.prepared is None or args.runtime is None:
                raise ValueError('Prepared files required')
            apply(args.prepared, args.runtime)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print(json.dumps({'ok': False, 'action': args.action,
                          'message': 'Operation stopped; preserve private state and use reviewed rollback. Raw output suppressed.'}))
        raise SystemExit(1)
