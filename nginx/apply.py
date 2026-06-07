#!/usr/bin/env python3
"""
Applies nginx/live.soc.ai.in.conf to /etc/nginx/sites-available/
while preserving any SSL lines added by certbot.

Run:  sudo python3 ~/soctickdata/nginx/apply.py
Then: sudo nginx -t && sudo systemctl reload nginx
"""
import re, os, sys

DEST = '/etc/nginx/sites-available/live.soc.ai.in'
SRC  = os.path.join(os.path.dirname(__file__), 'live.soc.ai.in.conf')

new_conf = open(SRC).read()

# If a certbot-managed config already exists, extract its SSL lines and
# HTTP→HTTPS redirect block so we don't lose them.
ssl_lines   = ''
http_block  = ''

if os.path.exists(DEST):
    existing = open(DEST).read()

    # Extract certbot SSL directives (listen 443, ssl_certificate, etc.)
    ssl_match = re.search(
        r'(listen 443 ssl;.*?ssl_dhparam[^\n]+)',
        existing, re.DOTALL
    )
    if ssl_match:
        ssl_lines = '\n    ' + ssl_match.group(1).strip()

    # Extract the HTTP→HTTPS redirect server block certbot adds
    http_match = re.search(
        r'(server \{[^}]*if \(\$host = live\.soc\.ai\.in\).*?\})',
        existing, re.DOTALL
    )
    if http_match:
        http_block = '\n\n\n' + http_match.group(1)

# Inject SSL lines before closing } of the main server block
if ssl_lines:
    new_conf = re.sub(r'\n\}(\s*)$', f'\n{ssl_lines}\n}}\\1', new_conf)

# Append HTTP redirect block
if http_block:
    new_conf = new_conf.rstrip() + http_block + '\n'
elif ssl_lines:
    # certbot hasn't added redirect yet — add a basic one
    new_conf = new_conf.rstrip() + '''


server {
    listen 80;
    server_name live.soc.ai.in;
    return 301 https://$host$request_uri;
}
'''

open(DEST, 'w').write(new_conf)
print(f'Written to {DEST}')
if ssl_lines:
    print('SSL lines preserved.')
if http_block:
    print('HTTP→HTTPS redirect preserved.')
