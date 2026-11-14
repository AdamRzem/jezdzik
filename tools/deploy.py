#!/usr/bin/env python3
"""Deploy the web app on a Linux/systemd host with the packaged Caddy service."""

import argparse
import ipaddress
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def host(value):
    value = value.strip("[]")
    try:
        ipaddress.ip_address(value)
    except ValueError:
        if len(value) > 253 or not all(
            re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?", part)
            for part in value.split(".")
        ):
            raise argparse.ArgumentTypeError("Use an IP address or hostname without a scheme or port")
    return value


def upstream(value):
    parsed = urlsplit(value)
    try:
        valid = (
            parsed.scheme in ("http", "https") and parsed.hostname
            and not parsed.username and not parsed.password
            and not parsed.path and not parsed.query and not parsed.fragment
            and parsed.port is not None
        )
        if valid:
            host(parsed.hostname)
    except (ValueError, argparse.ArgumentTypeError):
        valid = False
    if not valid or re.search(r'[\s{}"\\]', value):
        raise argparse.ArgumentTypeError("Use http(s)://host:port with no path or credentials")
    return value


def quote(value):
    # Caddyfile quoted token. Paths come from the local filesystem.
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'


def unit_quote(value):
    return quote(str(value).replace('%', '%%').replace('$', '$$'))


def caddyfile(args, web_root):
    address = f"[{args.address}]" if ":" in args.address else args.address
    tls = "\ttls internal\n" if args.tls == "internal" else ""
    frontend = (
        f"\t\treverse_proxy 127.0.0.1:{args.dev_port}\n"
        if args.mode == "dev" else
        f"\t\troot * {quote(web_root)}\n"
        "\t\ttry_files {path} {path}/index.html /index.html\n"
        "\t\tfile_server\n"
    )
    return (
        f"https://{address} {{\n{tls}\tencode zstd gzip\n"
        f"\thandle /ws {{\n\t\treverse_proxy {args.pose_upstream}\n\t}}\n"
        f"\thandle /cam/* {{\n\t\treverse_proxy {args.media_upstream}\n\t}}\n"
        f"\thandle {{\n{frontend}\t}}\n}}\n"
    )


def dev_unit(args):
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Install Node.js first")
    user = pwd.getpwuid(os.getuid()).pw_name
    return f"""[Unit]
Description=Rover AR Vite development server
After=network.target

[Service]
Type=simple
User={user}
WorkingDirectory={unit_quote(ROOT)}
Environment={unit_quote('__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=' + args.address)}
ExecStart={unit_quote(node)} {unit_quote(ROOT / 'node_modules/vite/bin/vite.js')} --host 127.0.0.1 --port {args.dev_port} --strictPort
Restart=on-failure
RestartSec=3
KillMode=control-group
NoNewPrivileges=true
UMask=0022

[Install]
WantedBy=multi-user.target
"""


def run(*command):
    print("+", " ".join(map(str, command)), flush=True)
    subprocess.run([str(part) for part in command], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("dev", "prod"))
    parser.add_argument("--address", required=True, type=host, help="Server IP or hostname")
    parser.add_argument("--tls", choices=("internal", "public"), default="internal")
    parser.add_argument("--pose-upstream", type=upstream, default="http://127.0.0.1:8765")
    parser.add_argument("--media-upstream", type=upstream, default="http://127.0.0.1:8889")
    parser.add_argument("--dev-port", type=int, default=5173)
    parser.add_argument("--skip-install", action="store_true", help="Reuse installed npm dependencies")
    parser.add_argument("--assets", action="store_true", help="Fetch browser AR assets before building")
    parser.add_argument("--render-only", type=Path, metavar="DIR", help="Write config previews without building or deploying")
    args = parser.parse_args()
    if not 1024 <= args.dev_port <= 65535:
        parser.error("--dev-port must be between 1024 and 65535")
    if args.tls == "public":
        try:
            ipaddress.ip_address(args.address)
        except ValueError:
            pass
        else:
            parser.error("Use --tls internal for IP addresses; public mode expects a DNS hostname")
    release = Path("/srv/jezdzik/releases") / (time.strftime("%Y%m%d-%H%M%S") + f"-{os.getpid()}")
    config = caddyfile(args, release)
    if args.render_only:
        args.render_only.mkdir(parents=True, exist_ok=True)
        (args.render_only / "Caddyfile").write_text(config)
        if args.mode == "dev":
            (args.render_only / "jezdzik-dev.service").write_text(dev_unit(args))
        print(f"Configuration preview: {args.render_only.resolve()}")
        return
    if os.geteuid() == 0:
        parser.error("Run as your normal login user; the script uses sudo only for system changes")
    for tool in ("node", "npm", "sudo", "systemctl", "caddy"):
        if not shutil.which(tool):
            parser.error(f"Missing {tool}; install prerequisites described in deploy/README.md")
    if not Path("/run/systemd/system").is_dir():
        parser.error("Deployment requires a Linux host running systemd")
    run("systemctl", "cat", "caddy.service")
    if not args.skip_install:
        run("npm", "ci")
    if args.assets:
        run("python3", "tools/fetch_assets.py")
    run("npm", "run", "check")
    if args.mode == "prod":
        run("npm", "test")
        run("npm", "run", "build")
        if not (ROOT / "build/index.html").is_file():
            raise RuntimeError("Build did not produce build/index.html")
    with tempfile.TemporaryDirectory(prefix="jezdzik-deploy-") as temporary:
        staged = Path(temporary) / "Caddyfile"
        staged.write_text(config)
        # Adapt first without provisioning certificates or modifying system state.
        run("caddy", "adapt", "--config", staged, "--adapter", "caddyfile", "--pretty")
        run("sudo", "-v")
        if args.mode == "prod":
            run("sudo", "install", "-d", "-m", "755", release)
            run("sudo", "cp", "-R", str(ROOT / "build") + "/.", release)
            run("sudo", "chmod", "-R", "a+rX", release)
        else:
            service = Path(temporary) / "jezdzik-dev.service"
            service.write_text(dev_unit(args))
            run("sudo", "install", "-m", "644", service, "/etc/systemd/system/jezdzik-dev.service")
            run("sudo", "systemctl", "daemon-reload")
            run("sudo", "systemctl", "enable", "jezdzik-dev.service")
            run("sudo", "systemctl", "restart", "jezdzik-dev.service")
            for attempt in range(30):
                try:
                    with urlopen(f"http://127.0.0.1:{args.dev_port}/", timeout=2) as response:
                        if response.status == 200:
                            break
                except OSError:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError("Vite did not become ready; inspect journalctl -u jezdzik-dev")
            # Catch a failed Vite startup even if an unrelated process answered the port.
            time.sleep(1)
            run("sudo", "systemctl", "is-active", "--quiet", "jezdzik-dev.service")
        run("sudo", "install", "-d", "-m", "755", "/etc/caddy")
        pending = "/etc/caddy/Caddyfile.jezdzik-pending"
        run("sudo", "install", "-m", "644", staged, pending)
        # Validate as the actual service user, using its persistent CA storage.
        run("sudo", "-H", "-u", "caddy", "caddy", "validate", "--config", pending, "--adapter", "caddyfile")
        backup = f"/etc/caddy/Caddyfile.backup-{release.name}"
        had_config = Path("/etc/caddy/Caddyfile").exists()
        if had_config:
            run("sudo", "cp", "-p", "/etc/caddy/Caddyfile", backup)
        run("sudo", "mv", pending, "/etc/caddy/Caddyfile")
        try:
            run("sudo", "systemctl", "enable", "caddy.service")
            run("sudo", "systemctl", "reload-or-restart", "caddy.service")
        except subprocess.CalledProcessError:
            if had_config:
                run("sudo", "cp", "-p", backup, "/etc/caddy/Caddyfile")
                run("sudo", "systemctl", "reload-or-restart", "caddy.service")
            raise
        if args.mode == "prod" and Path("/etc/systemd/system/jezdzik-dev.service").exists():
            run("sudo", "systemctl", "disable", "--now", "jezdzik-dev.service")
    address = f"[{args.address}]" if ":" in args.address else args.address
    print(f"Deployed {args.mode}: https://{address}")
    if args.tls == "internal":
        print("Trust this server's Caddy root CA on each viewing device; see deploy/README.md.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error)) from error
