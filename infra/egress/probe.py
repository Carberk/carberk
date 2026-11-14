#!/usr/bin/env python3
"""Bounded staging transport probe. Signed URLs/tokens enter only via a private file."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlsplit
from diagnose import load_answers


def emit(value):
    print(json.dumps(value), flush=True)


def digest(body):
    return hashlib.sha256(body).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--proxy', help='Explicit loopback HTTP CONNECT proxy; omitted means direct')
    parser.add_argument('--reverse-ports', help='Private label-to-loopback-port map for an already established reverse tunnel')
    parser.add_argument('--public-answers', help='Fresh validated private DoH receipt from diagnose.py')
    parser.add_argument('--protocol-checks', action='store_true', help='Require signed HEAD and a verified 1 KiB Range response per store')
    parser.add_argument('--read-only', action='store_true')
    parser.add_argument('--samples', type=int, choices=range(1, 4), default=1)
    parser.add_argument('--timeout', type=int, choices=range(6, 61), default=30)
    args = parser.parse_args()
    if args.proxy:
        p = urlsplit(args.proxy)
        if p.scheme != 'http' or p.hostname != '127.0.0.1' or not p.port or p.username or p.password:
            raise ValueError('proxy must be loopback HTTP')
    manifest = json.loads(Path(args.manifest).read_text())
    size = manifest['bytes']
    if not isinstance(size, int) or not 1 <= size <= 8 * 1024 * 1024:
        raise ValueError('fixture exceeds bound')
    storage = manifest['storage']
    if not 1 <= len(storage) <= 2:
        raise ValueError('expected one or two storage origins')
    hosts = [urlsplit(s['downloadUrl']).hostname for s in storage]
    if manifest.get('api'):
        hosts.append(urlsplit(manifest['api']['origin']).hostname)
    if args.proxy and args.public_answers:
        raise ValueError('public answers are direct diagnostics only')
    resolves = load_answers(args.public_answers, hosts) if args.public_answers else []
    reverse = json.loads(Path(args.reverse_ports).read_text()) if args.reverse_ports else {}
    labels = {'api'} if manifest.get('api') else set()
    labels.update(s['label'] for s in storage)
    if args.reverse_ports and (args.proxy or args.public_answers or set(reverse) != labels
                    or any(type(port) is not int or not 1024 <= port <= 65535 for port in reverse.values())):
        raise ValueError('one fixed loopback reverse listener per target required')
    failures = 0
    with tempfile.TemporaryDirectory(prefix='carberk-egress-') as directory:
        directory = Path(directory)
        upload = directory / 'upload.bin'
        upload.write_bytes(os.urandom(size))
        upload_hash = digest(upload.read_bytes())

        def request(url, label, kind, method='GET', body=None, token=None, expected=200, checksum=None, byte_range=None):
            nonlocal failures
            u = urlsplit(url)
            if u.scheme != 'https' or u.username or u.password or any(ord(c) < 32 for c in url):
                raise ValueError('HTTPS URL required')
            output = directory / 'response'
            command = ['curl', '-q', '--config', '-', '--silent', '--show-error', '--proto', '=https',
                       '--max-redirs', '0', '--connect-timeout', '6', '--max-time', str(args.timeout),
                       '--max-filesize', str(8 * 1024 * 1024), '--output', str(output),
                       '--write-out', '%{json}', '--request', method, '--noproxy', '' if args.proxy else '*']
            if method == 'HEAD':
                command += ['--head']
            if byte_range:
                command += ['--range', byte_range]
            if reverse:
                command += ['--connect-to', u.hostname + ':' + str(u.port or 443) + ':127.0.0.1:' + str(reverse[label])]
            if args.proxy:
                command += ['--proxy', args.proxy]
            for value in resolves:
                command += ['--resolve', value]
            config = 'url = ' + json.dumps(url) + '\n'
            if token:
                config += 'header = ' + json.dumps('Authorization: Bearer ' + token) + '\n'
            if isinstance(body, Path):
                command += ['--upload-file', str(body), '--header', 'Content-Type: application/octet-stream',
                            '--header', 'Cache-Control: no-store', '--header', 'Expect:']
            elif body is not None:
                data = directory / 'body.json'
                data.write_text(json.dumps(body))
                command += ['--data-binary', '@' + str(data), '--header', 'Content-Type: application/json']
            output.unlink(missing_ok=True)
            result = subprocess.run(command, input=config, capture_output=True, text=True, timeout=args.timeout + 3)
            metrics = json.loads(result.stdout) if result.stdout else {}
            content = output.read_bytes() if output.exists() else b''
            ok = result.returncode == 0 and metrics.get('http_code') == expected and metrics.get('ssl_verify_result') == 0
            row = {'kind': kind, 'target': label, 'curl_exit': result.returncode,
                   **{k: metrics.get(k) for k in ['http_code', 'ssl_verify_result', 'time_total', 'time_connect', 'time_appconnect', 'time_starttransfer', 'size_download', 'size_upload']}}
            if checksum:
                row['checksum_ok'] = digest(content) == checksum and len(content) == size
                ok = ok and row['checksum_ok']
            row['ok'] = ok
            emit(row)
            failures += not ok
            return content if ok else None

        api = manifest.get('api')
        if api:
            health = request(api['origin'] + '/healthz', 'api', 'health')
            if health:
                identity = json.loads(health)
                valid = identity.get('environment') == 'staging' and identity.get('service') == 'api'
                emit({'kind': 'identity', 'staging': valid, 'commitSha': identity.get('commitSha')})
                failures += not valid
                if not valid:
                    return 1
            if health and not args.read_only:
                request(api['origin'] + '/api/v1/listings/drafts/' + api['draftId'], 'api', 'draft-write',
                        method='PATCH', body={'description': api['description']}, token=api['token'])
                result = request(api['origin'] + '/api/v1/me/drafts?limit=20', 'api', 'draft-read', token=api['token'])
                found = next((d for d in json.loads(result)['items'] if d['id'] == api['draftId']), None) if result else None
                ok = found is not None and found['payload'].get('description') == api['description']
                emit({'kind': 'api-integrity', 'ok': ok, 'sha256': digest(api['description'].encode())})
                failures += not ok
        for entry in storage:
            for _ in range(args.samples):
                content = request(entry['downloadUrl'], entry['label'], 'download', checksum=manifest['sha256'])
                if args.protocol_checks:
                    request(entry['headUrl'], entry['label'], 'head', method='HEAD')
                    partial = request(entry['downloadUrl'], entry['label'], 'range', expected=206,
                                      byte_range='0-' + str(min(size, 1024) - 1))
                    ok = content is not None and partial == content[:1024]
                    emit({'kind': 'range-integrity', 'target': entry['label'], 'ok': ok})
                    failures += not ok
            if not args.read_only:
                request(entry['uploadUrl'], entry['label'], 'upload', method='PUT', body=upload)
                request(entry['uploadReadUrl'], entry['label'], 'upload-readback', checksum=upload_hash)
        emit({'kind': 'summary', 'ok': failures == 0, 'failures': failures,
              'route': 'railway-initiated' if reverse else 'explicit-proxy' if args.proxy else 'direct', 'bytes_per_file': size})
    return int(failures != 0)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError, subprocess.TimeoutExpired):
        emit({'kind': 'error', 'ok': False, 'message': 'Invalid input or bounded probe failure; raw details suppressed'})
        raise SystemExit(1)
