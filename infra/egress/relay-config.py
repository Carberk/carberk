#!/usr/bin/env python3
"""Prepare a separate fail-closed Xray config; never edit or restart the source service."""
import argparse
import copy
import ipaddress
import json
import os
import re

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--source', required=True)
p.add_argument('--tag', required=True)
p.add_argument('--port', type=int, default=11809)
p.add_argument('--host', action='append', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
try:
    if not 1024 <= a.port <= 65535 or any(not re.fullmatch(r'[a-zA-Z0-9.-]+', h) for h in a.host):
        raise ValueError()
    with open(a.source) as source:
        matches = [o for o in json.load(source)['outbounds'] if o.get('tag') == a.tag]
    if len(matches) != 1:
        raise ValueError()
    relay = copy.deepcopy(matches[0])
    peers = relay.get('settings', {}).get('vnext', [])
    stream = relay.get('streamSettings', {})
    if (relay.get('protocol') != 'vless' or len(peers) != 1
            or not ipaddress.ip_address(peers[0]['address']).is_global
            or relay.get('proxySettings') or stream.get('sockopt', {}).get('dialerProxy')
            or stream.get('security') != 'reality'):
        raise ValueError()
    relay['tag'] = 'fixed-relay'
    config = {'log': {'loglevel': 'none'},
              'inbounds': [{'tag': 'probe', 'listen': '127.0.0.1', 'port': a.port, 'protocol': 'http'}],
              'outbounds': [{'tag': 'blocked', 'protocol': 'blackhole'}, relay],
              'routing': {'domainStrategy': 'AsIs', 'rules': [{'type': 'field', 'network': 'tcp',
                          'port': '443', 'domain': ['full:' + h for h in a.host], 'outboundTag': 'fixed-relay'}]}}
    fd = os.open(a.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(config, output)
    print(json.dumps({'prepared': True, 'fixedRelay': True, 'macFallback': False, 'allowedHosts': len(a.host)}))
except (ValueError, KeyError, OSError):
    print(json.dumps({'prepared': False, 'message': 'Refused unsupported/chained relay or invalid input/output'}))
    raise SystemExit(1)
