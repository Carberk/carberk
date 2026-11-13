#!/usr/bin/env python3
"""Run from a bounded transient systemd unit, with a prepared private manifest/config."""
import argparse
import json
from pathlib import Path
import subprocess
import threading
import time

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--manifest', required=True)
p.add_argument('--config', required=True)
p.add_argument('--xray', default='/usr/local/bin/xray')
a = p.parse_args()
root = Path(__file__).resolve().parent
relay = None


def emit(value):
    print(json.dumps(value), flush=True)


def probe(*options):
    return subprocess.run(['python3', str(root / 'probe.py'), '--manifest', a.manifest, *options], timeout=240).returncode


try:
    manifest = json.loads(Path(a.manifest).read_text())
    config = json.loads(Path(a.config).read_text())
    assert manifest.get('api', {}).get('draftId') and {d['label'] for d in manifest['storage']} == {'photo', 'video'}
    assert [o['tag'] for o in config['outbounds']] == ['blocked', 'fixed-relay']
    assert config['inbounds'][0]['listen'] == '127.0.0.1'
    port = config['inbounds'][0]['port']
    proxy = 'http://127.0.0.1:' + str(port)
    peer = config['outbounds'][1]['settings']['vnext'][0]
    endpoint = str(peer['address']) + ':' + str(peer['port'])

    def start():
        child = subprocess.Popen([a.xray, 'run', '-c', a.config], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.5)
        if child.poll() is not None:
            raise ValueError('relay failed to start')
        return child

    emit({'kind': 'phase', 'phase': 'direct-diagnostic'})
    probe('--read-only', '--timeout', '8')  # Diagnostic only; never implicit fallback.
    results = []
    for round_number in [1, 2]:
        relay = start()
        stop = threading.Event()
        observed = {'relay_peer': False, 'mac_port': False}

        def sample():
            while not stop.is_set():
                result = subprocess.run(['ss', '-ntp'], capture_output=True, text=True, timeout=3)
                lines = [line for line in result.stdout.splitlines() if 'pid=' + str(relay.pid) + ',' in line]
                observed['relay_peer'] |= any(endpoint in line for line in lines)
                observed['mac_port'] |= any(':18080 ' in line for line in lines)
                stop.wait(0.5)

        monitor = threading.Thread(target=sample, daemon=True)
        monitor.start()
        try:
            emit({'kind': 'phase', 'phase': 'fixed-relay', 'round': round_number})
            status = probe('--proxy', proxy, '--timeout', '45')
        finally:
            stop.set()
            monitor.join(timeout=5)
            relay.terminate()
            relay.wait(timeout=5)
            relay = None
        ok = status == 0 and observed['relay_peer'] and not observed['mac_port']
        emit({'kind': 'round-result', 'round': round_number, 'ok': ok, **observed})
        results.append(ok)
        emit({'kind': 'phase', 'phase': 'relay-stopped'})
        results.append(probe('--proxy', proxy, '--read-only', '--timeout', '6') != 0)
    emit({'kind': 'isolated-result', 'ok': all(results)})
    raise SystemExit(0 if all(results) else 1)
except (AssertionError, ValueError, KeyError, OSError, subprocess.TimeoutExpired):
    emit({'kind': 'isolated-result', 'ok': False, 'message': 'Preparation/process failure; details suppressed'})
    raise SystemExit(1)
finally:
    if relay:
        relay.terminate()
        relay.wait(timeout=5)
    # Credentials/config are caller-owned: retain on failure for reconciliation;
    # the procedure requires removing their private scratch directory afterward.
