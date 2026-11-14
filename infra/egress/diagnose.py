#!/usr/bin/env python3
"""Separate bounded system-DNS and independent-address TCP/TLS diagnostics; no byte-proof claim."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlencode, urlsplit


def emit(row):
    print(json.dumps(row), flush=True)


def global_address(value):
    ip = ipaddress.ip_address(value)
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def targets(manifest):
    result = []
    if manifest.get('api'):
        result.append(('api', manifest['api']['origin'] + '/healthz'))
    result.extend((s['label'], s['downloadUrl']) for s in manifest['storage'])
    if not 1 <= len(result) <= 3 or len({label for label, _ in result}) != len(result):
        raise ValueError('one target per origin')
    for label, url in result:
        u = urlsplit(url)
        if (label not in ['api', 'photo', 'video'] or u.scheme != 'https' or not u.hostname
                or u.port not in [None, 443] or u.username or u.password
                or any(ord(c) < 32 for c in url)):
            raise ValueError('fixed HTTPS origins required')
    return result


def load_answers(file, hosts):
    receipt = json.loads(Path(file).read_text())
    if not 0 <= time.time() - receipt['createdAt'] <= 300 or set(receipt['hosts']) != set(hosts):
        raise ValueError('public answers expired or origin set changed')
    overrides = []
    for host, addresses in receipt['hosts'].items():
        if not 1 <= len(addresses) <= 8 or any(not global_address(ip) for ip in addresses):
            raise ValueError('non-global public answer')
        overrides.extend(host + ':443:' + ip for ip in addresses)
    return overrides


def curl(url, directory, resolve=None, head=False):
    body = directory / 'body'
    command = ['curl', '-q', '--config', '-', '--silent', '--show-error', '--proto', '=https',
               '--noproxy', '*', '--proxy', '', '--max-redirs', '0', '--connect-timeout', '6',
               '--max-time', '8', '--max-filesize', '65536', '--output', str(body), '--write-out', '%{json}']
    if resolve:
        command += ['--resolve', resolve]
    if head:
        command += ['--head']
    body.unlink(missing_ok=True)
    r = subprocess.run(command, input='url = ' + json.dumps(url) + '\n', text=True,
                       capture_output=True, timeout=10)
    return r.returncode, json.loads(r.stdout) if r.stdout else {}, body.read_bytes() if body.exists() else b''


def collect(entries, resolver, directory):
    u = urlsplit(resolver)
    if u.scheme != 'https' or u.username or u.password or u.query or u.fragment:
        raise ValueError('validated HTTPS DoH required')
    answers = {}
    for label, url in entries:
        host = urlsplit(url).hostname
        code, metrics, body = curl(resolver + '?' + urlencode({'name': host, 'type': 'A'}), directory)
        if code or metrics.get('http_code') != 200 or metrics.get('ssl_verify_result') != 0:
            raise ValueError('DoH unavailable')
        response = json.loads(body)
        allowed_names = {host}
        records = response.get('Answer', [])
        # Follow only the answer's CNAME chain, never unrelated additional records.
        for _ in records:
            for record in records:
                if record.get('type') == 5 and record['name'].rstrip('.') in allowed_names:
                    allowed_names.add(record['data'].rstrip('.'))
        addresses = sorted({r['data'] for r in records if r.get('type') == 1 and r['name'].rstrip('.') in allowed_names})
        if response.get('Status') != 0 or not 1 <= len(addresses) <= 8 or any(not global_address(ip) for ip in addresses):
            raise ValueError('DoH returned non-global or missing answers')
        answers[host] = addresses
        emit({'kind': 'public-dns', 'target': label, 'ok': True, 'count': len(addresses)})
    return {'createdAt': time.time(), 'resolver': resolver, 'hosts': answers}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest', required=True)
    p.add_argument('--dns-only', action='store_true', help='Control-plane collection only; never transfer media here')
    p.add_argument('--doh', default='https://dns.google/resolve')
    p.add_argument('--output', help='Exclusive private public-answer receipt, valid for five minutes')
    p.add_argument('--public-answers', help='Fresh receipt collected here or independently on operator host')
    p.add_argument('--samples', type=int, choices=range(1, 4), default=1)
    a = p.parse_args()
    entries = targets(json.loads(Path(a.manifest).read_text()))
    with tempfile.TemporaryDirectory(prefix='carberk-diagnostic-') as scratch:
        directory = Path(scratch)
        if a.dns_only:
            if not a.output or a.public_answers:
                raise ValueError('output required')
            receipt = collect(entries, a.doh, directory)
            with os.fdopen(os.open(a.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
                json.dump(receipt, f)
            return 0
        overrides = load_answers(a.public_answers, [urlsplit(u).hostname for _, u in entries]) if a.public_answers else []
        failures = 0
        for label, url in entries:
            host = urlsplit(url).hostname
            try:
                r = subprocess.run([sys.executable, '-c',
                    'import socket,json,sys; print(json.dumps(list({r[4][0] for r in socket.getaddrinfo(sys.argv[1],443)})))', host],
                    capture_output=True, text=True, timeout=6)
                addresses = json.loads(r.stdout) if r.returncode == 0 else []
                usable = bool(addresses) and all(global_address(ip) for ip in addresses)
                emit({'kind': 'system-dns', 'target': label, 'ok': usable, 'count': len(addresses)})
            except subprocess.TimeoutExpired:
                usable = False
                emit({'kind': 'system-dns', 'target': label, 'ok': False, 'timeout': True})
            failures += not usable
            routes = [('system', None)] if usable else []
            routes.extend(('public-answer', v) for v in overrides if v.startswith(host + ':443:'))
            for route, override in routes:
                for sample in range(a.samples):
                    code, m, _ = curl(url, directory, resolve=override, head=True)
                    tcp = (m.get('time_connect') or 0) > 0
                    tls = (m.get('time_appconnect') or 0) > 0 and m.get('ssl_verify_result') == 0
                    emit({'kind': 'transport', 'target': label, 'route': route, 'sample': sample + 1,
                          'tcp': tcp, 'tls': tls, 'curl_exit': code, 'http_code': m.get('http_code'),
                          'seconds': m.get('time_total'), 'ok': tls, 'media_usable': False})
                    failures += not tls
        emit({'kind': 'diagnostic-summary', 'ok': failures == 0, 'failures': failures, 'byte_proof': False})
        return int(failures != 0)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired):
        emit({'kind': 'error', 'ok': False, 'message': 'Invalid input or bounded diagnostic failure; raw details suppressed'})
        raise SystemExit(1)
