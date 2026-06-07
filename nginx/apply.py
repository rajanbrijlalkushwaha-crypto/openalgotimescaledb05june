#!/usr/bin/env python3
"""
Applies nginx/live.soc.ai.in.conf while preserving certbot SSL config.
Run: sudo python3 ~/soctickdata/nginx/apply.py
Then: sudo nginx -t && sudo systemctl reload nginx
"""
import os, re

DEST = '/etc/nginx/sites-available/live.soc.ai.in'
SRC  = os.path.join(os.path.dirname(__file__), 'live.soc.ai.in.conf')

new_conf = open(SRC).read().rstrip()
ssl_block = ''
http_block = ''

if os.path.exists(DEST):
    existing = open(DEST).read()

    # Extract certbot SSL lines (inside main server block)
    m = re.search(r'(listen 443 ssl;.*?ssl_dhparam[^\n]+)', existing, re.DOTALL)
    if m:
        ssl_block = '\n    ' + m.group(1).strip()

    # Extract the complete HTTP→HTTPS redirect server block certbot adds.
    # Use brace counting to get the full block (handles nested braces).
    idx = existing.find('if ($host = live.soc.ai.in)')
    if idx >= 0:
        # Walk backwards to find the opening 'server {'
        start = existing.rfind('server {', 0, idx)
        if start >= 0:
            depth = 0
            for i in range(start, len(existing)):
                if existing[i] == '{':
                    depth += 1
                elif existing[i] == '}':
                    depth -= 1
                    if depth == 0:
                        http_block = '\n\n\n' + existing[start:i+1]
                        break

# Inject SSL lines before the final closing } of the main server block
if ssl_block:
    new_conf = new_conf.rstrip()
    if new_conf.endswith('}'):
        new_conf = new_conf[:-1].rstrip() + '\n' + ssl_block + '\n}'

# Append HTTP redirect block
new_conf = new_conf + (http_block if http_block else '') + '\n'

open(DEST, 'w').write(new_conf)
print(f'Written to {DEST}')
print(f'SSL lines: {"preserved" if ssl_block else "none found"}')
print(f'HTTP redirect: {"preserved" if http_block else "none found"}')
