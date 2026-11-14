"""Deployment checks; run with python3 -m unittest discover -s tools -p 'test_*.py'."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen

import deploy


class DeployTests(unittest.TestCase):
    def test_rejects_addresses_that_can_inject_config(self):
        for value in ('example.com {', 'https://example.com', 'example.com:443', '*', 'x\nlocalhost'):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                deploy.host(value)

    def test_accepts_ip_addresses_and_dns(self):
        for value in ('192.168.1.50', '::1', 'rover.local', 'rover.example.com'):
            self.assertEqual(deploy.host(value), value)
        self.assertEqual(deploy.host('[::1]'), '::1')

    def test_rejects_upstream_paths_credentials_and_injection(self):
        for value in ('http://x:80/cam', 'http://u:p@x:80', 'http://x:80\n}', 'ftp://x:80', 'http://x:99999'):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                deploy.upstream(value)
        self.assertEqual(deploy.upstream('https://[::1]:8889'), 'https://[::1]:8889')

    def test_render_does_not_require_caddy_or_root(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run([
                shutil.which('python3'), str(deploy.ROOT / 'tools/deploy.py'), 'dev',
                '--address', '192.168.1.50', '--render-only', directory,
            ], check=True, capture_output=True)
            self.assertTrue((Path(directory) / 'Caddyfile').is_file())
            self.assertTrue((Path(directory) / 'jezdzik-dev.service').is_file())

    @unittest.skipUnless(os.environ.get('CADDY_BIN') or shutil.which('caddy'), 'Caddy not installed')
    def test_caddy_accepts_all_modes_and_keeps_backend_routes_first(self):
        binary = os.environ.get('CADDY_BIN') or shutil.which('caddy')
        for mode, address, tls in (
            ('dev', '192.168.1.50', 'internal'),
            ('prod', '::1', 'internal'),
            ('prod', 'rover.example.com', 'public'),
        ):
            with self.subTest(mode=mode, address=address), tempfile.TemporaryDirectory() as directory:
                args = argparse.Namespace(
                    mode=mode, address=address, tls=tls, dev_port=5173,
                    pose_upstream='http://127.0.0.1:8765',
                    media_upstream='http://127.0.0.1:8889',
                )
                config = Path(directory) / 'Caddyfile'
                config.write_text(deploy.caddyfile(args, '/srv/jezdzik/releases/example'))
                result = subprocess.run([
                    binary, 'adapt', '--config', str(config), '--adapter', 'caddyfile',
                ], check=True, capture_output=True, text=True)
                adapted = json.loads(result.stdout)
                routes = adapted['apps']['http']['servers']['srv0']['routes'][0]['handle'][0]['routes']
                routes = [route for route in routes if 'group' in route]
                self.assertEqual(routes[0]['match'][0]['path'], ['/cam/*'])
                self.assertEqual(routes[1]['match'][0]['path'], ['/ws'])
                self.assertNotIn('match', routes[2])

    @unittest.skipUnless(os.environ.get('CADDY_BIN') or shutil.which('caddy'), 'Caddy not installed')
    def test_live_routes_and_static_fallback(self):
        class Echo(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(('backend:' + self.path).encode())

            def log_message(self, *args):
                pass

        backend = ThreadingHTTPServer(('127.0.0.1', 0), Echo)
        threading.Thread(target=backend.serve_forever, daemon=True).start()
        self.addCleanup(backend.server_close)
        self.addCleanup(backend.shutdown)
        # Reserve an ephemeral port briefly; Caddy binds it below.
        reservation = ThreadingHTTPServer(('127.0.0.1', 0), Echo)
        port = reservation.server_port
        reservation.server_close()
        binary = os.environ.get('CADDY_BIN') or shutil.which('caddy')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_text('frontend')
            (root / 'asset.txt').write_text('asset')
            for mode in ('dev', 'prod'):
                args = argparse.Namespace(
                    mode=mode, address='127.0.0.1', tls='public', dev_port=backend.server_port,
                    pose_upstream=f'http://127.0.0.1:{backend.server_port}',
                    media_upstream=f'http://127.0.0.1:{backend.server_port}',
                )
                # HTTP on an ephemeral port isolates routing tests from host TLS/services.
                config = root / 'Caddyfile'
                config.write_text('{\n admin off\n auto_https off\n}\n' + deploy.caddyfile(args, root).replace(
                    'https://127.0.0.1 {', f'http://127.0.0.1:{port} {{', 1))
                environment = {**os.environ, 'XDG_DATA_HOME': directory, 'XDG_CONFIG_HOME': directory}
                with (root / 'caddy.log').open('w') as log:
                    process = subprocess.Popen([binary, 'run', '--config', str(config), '--adapter', 'caddyfile'],
                                               env=environment, stdout=log, stderr=log)
                    try:
                        for attempt in range(50):
                            try:
                                with urlopen(f'http://127.0.0.1:{port}/', timeout=1):
                                    break
                            except OSError:
                                if process.poll() is not None:
                                    self.fail((root / 'caddy.log').read_text())
                                time.sleep(0.1)
                        for path in ('/ws?test=1', '/cam/whep', '/cam/whep/session'):
                            with urlopen(f'http://127.0.0.1:{port}{path}') as response:
                                self.assertEqual(response.read().decode(), 'backend:' + path)
                        for path in ('/', '/play', '/story', '/asset.txt'):
                            expected = ('backend:' + path) if mode == 'dev' else ('asset' if path == '/asset.txt' else 'frontend')
                            with urlopen(f'http://127.0.0.1:{port}{path}') as response:
                                self.assertEqual(response.read().decode(), expected)
                    finally:
                        process.terminate()
                        process.wait(timeout=10)


if __name__ == '__main__':
    unittest.main()
