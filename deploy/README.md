# Deploy with Caddy

Run `tools/deploy.py` from your normal login account on the target machine. It
supports Linux with systemd (including Raspberry Pi OS), Python 3, Node.js/npm,
sudo, and the official Caddy package with its `caddy` user and `caddy.service`.
Install Caddy using its [official instructions](https://caddyserver.com/docs/install).
Use a Node version supported by the project's installed Vite/Svelte packages.

This app owns `/etc/caddy/Caddyfile`. Each deployment backs up the previous file.
The script installs dependencies with `npm ci`, runs checks, and uses sudo for
system files and service management. Do not run the whole script with sudo.

## Development

Replace the example IP with the target machine's LAN IP:

```sh
python3 tools/deploy.py dev --address 192.168.1.50
```

Open `https://192.168.1.50`. Caddy proxies the UI and hot-reload WebSocket to Vite
on loopback port 5173. The `jezdzik-dev` systemd service runs as your login user
and starts after reboot. Keep the checkout and Node executable at their current
paths; edits in the checkout are reflected through Vite. Re-run deployment after
moving the checkout or changing Node installations. `--dev-port 5174` changes the
loopback port. Only the specified hostname is added to Vite's allowed hosts.

## Production

```sh
python3 tools/deploy.py prod --address 192.168.1.50 --assets
```

This also runs unit tests and builds the static app, copies it into a new
`/srv/jezdzik/releases/<timestamp>-<pid>/` directory, validates the Caddy config,
and reloads Caddy to serve that release. It disables the dev service after Caddy
switches successfully. No Node process is needed to serve production. The build
and copy finish before Caddy switches, and a failed Caddy activation restores the
previous configuration. Prior releases and configuration backups are retained.

`--assets` downloads/checks OpenCV and the depth model and copies matching ONNX
Runtime files before the build. Use it for live marker/depth processing. Without
it, existing local assets are included and the browser demo still works. Repeat
it after ONNX Runtime dependency changes. `--skip-install` reuses node_modules
instead of running `npm ci`.

For a public DNS hostname pointing to the server, use automatic public HTTPS:

```sh
python3 tools/deploy.py prod --address rover.example.com --tls public --assets
```

Allow TCP 80/443 to reach Caddy. The script does not configure DNS, firewall rules,
or install system packages.

## HTTPS with an IP address

The default `--tls internal` uses Caddy's local CA and supports IPv4, IPv6 and LAN
hostnames. Use a stable IP (for example a DHCP reservation). Re-run deployment if
the address changes. A bare IP needs no DNS record.

Install **this server's root certificate** as a trusted CA on every viewing
device, including enabling full certificate trust on iOS. Merely bypassing a
certificate warning may not provide the secure context needed by browser APIs.
With the official Caddy service, export the public certificate with:

```sh
sudo cp /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt ./caddy-root.crt
sudo chmod 644 ./caddy-root.crt
```

Transfer that `.crt` to viewer devices using a trusted channel. Keep Caddy's data
directory across deployments so the CA stays the same. See Caddy's
[local HTTPS documentation](https://caddyserver.com/docs/running#local-https).

## Rover backends

Both modes forward `/ws` to `http://127.0.0.1:8765` and preserve `/cam/*` when
forwarding to MediaMTX at `http://127.0.0.1:8889`. Override them when the rover is
on another machine:

```sh
python3 tools/deploy.py dev --address 192.168.1.50 \
  --pose-upstream http://192.168.1.60:8765 \
  --media-upstream http://192.168.1.60:8889
```

These explicit options configure Caddy; the script does not load `.env` proxy
settings. HTTPS upstreams must have certificates trusted by the Caddy service.
Python and MediaMTX must be started separately as described in [pi/README.md](../pi/README.md).
Video media still travels directly to MediaMTX over UDP 8189; configure its
advertised addresses and network access for your viewers. Caddy proxies signaling,
not the UDP video transport.

## Preview, logs and rollback

Generate reviewable configs without installing, building or touching services:

```sh
python3 tools/deploy.py dev --address 192.168.1.50 --render-only /tmp/rover-dev
python3 tools/deploy.py prod --address 192.168.1.50 --render-only /tmp/rover-prod
```

The preview's production release path is illustrative; deploying creates a fresh
release. Inspect service logs with:

```sh
journalctl -u caddy -u jezdzik-dev -f
```

To return to a previous production release, restore its matching
`/etc/caddy/Caddyfile.backup-*`, validate it and reload Caddy:

```sh
sudo cp /etc/caddy/Caddyfile.backup-REPLACE_ME /etc/caddy/Caddyfile
sudo -H -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

To return to development, run the dev deployment command again. Old releases can
be removed once neither the active config nor any desired rollback references them.

Deployment regression checks (Caddy integration tests skip if it is not installed):

```sh
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

Set `CADDY_BIN=/path/to/caddy` to test with a standalone binary. These tests use
temporary directories and loopback ports; they do not install or modify services.
