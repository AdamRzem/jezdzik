"""Failure cases that must stop cleanly before reaching the camera consumer."""

import copy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import yaml
from rover_ar import load_config
from video import VideoPublisher

PI = Path(__file__).resolve().parents[1]


class ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.config = yaml.safe_load((PI / 'config.yaml').read_text())
        self.config['mode'] = 'mock'
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'config.yaml'

    def load(self, config):
        self.path.write_text(yaml.safe_dump(config))
        return load_config(self.path)

    def test_default_mock_and_lightweight_stub_configs(self):
        self.assertEqual(self.load(self.config)['mode'], 'mock')
        self.config['mode'] = 'stub'
        for key in ('fx', 'fy', 'cx', 'cy', 'tilt_deg', 'rtsp_url', 'ffmpeg', 'bitrate'):
            del self.config['camera'][key]
        self.assertEqual(self.load(self.config)['mode'], 'stub')

    def test_real_configuration_and_axis_validation(self):
        self.config['mode'] = 'real'
        self.assertEqual(self.load(self.config)['mode'], 'real')
        self.config['imu']['axis_mapping'] = [[1, 0, 0], [0, 1, 0], [0, 0, -1]]
        with self.assertRaisesRegex(ValueError, 'handedness'):
            self.load(self.config)
        self.config['imu']['axis_mapping'] = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]
        self.load(self.config)
        self.config['imu']['address'] = 0x70
        with self.assertRaisesRegex(ValueError, 'imu.address'):
            self.load(self.config)

    def test_bad_sensor_and_transport_settings_fail_before_startup(self):
        cases = [
            ('server', 'port', True), ('server', 'host', '  '),
            ('camera', 'width', 1280.0), ('camera', 'exposure_us', -1),
            ('camera', 'readout_ns', -1), ('camera', 'fps', float('nan')),
            ('camera', 'fx', 10**400), ('camera', 'cx', float('nan')),
            ('camera', 'cy', float('inf')), ('camera', 'tilt_deg', '10'),
            ('camera', 'ffmpeg', None), ('camera', 'rtsp_url', 'http://localhost'),
            ('tracking', 'history_seconds', None),
        ]
        for section, key, value in cases:
            with self.subTest(setting=f'{section}.{key}', value=value):
                config = copy.deepcopy(self.config)
                config[section][key] = value
                with self.assertRaisesRegex(ValueError, f'{section}.{key}'):
                    self.load(config)
        for section in ('camera', 'server', 'tracking'):
            with self.subTest(section=section):
                config = copy.deepcopy(self.config)
                config[section] = None
                with self.assertRaisesRegex(ValueError, section):
                    self.load(config)

    def test_malformed_yaml_exits_with_an_actionable_error(self):
        self.path.write_text('camera: [invalid')
        result = subprocess.run([sys.executable, str(PI / 'rover_ar.py'), '--config', str(self.path)],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Configuration/startup error:', result.stderr)
        self.assertNotIn('Traceback', result.stderr)


class PublisherFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_ffmpeg_reports_how_to_fix_the_configuration(self):
        publisher = VideoPublisher({'ffmpeg': '/nonexistent/rover-test-ffmpeg',
                                    'width': 2, 'height': 2, 'fps': 30,
                                    'bitrate': 1000, 'rtsp_url': 'rtsp://localhost/cam'})
        with self.assertRaisesRegex(OSError, 'install FFmpeg'):
            async with publisher:
                self.fail('A missing encoder must not start')

    async def test_dead_encoder_fails_cleanly_and_is_reaped(self):
        class ExitingPublisher(VideoPublisher):
            def command(self):
                return [sys.executable, '-c', 'raise SystemExit(7)']

        publisher = ExitingPublisher({'width': 2, 'height': 2, 'rtsp_url': 'rtsp://localhost/cam'})
        async with publisher:
            await publisher.process.wait()
            with self.assertRaisesRegex(OSError, 'check FFmpeg and MediaMTX'):
                await publisher.write(bytes(12))
        self.assertEqual(publisher.process.returncode, 7)

    async def test_partial_rgb_frame_is_rejected_and_child_is_closed(self):
        class ReadingPublisher(VideoPublisher):
            def command(self):
                return [sys.executable, '-c', 'import sys; sys.stdin.buffer.read()']

        publisher = ReadingPublisher({'width': 2, 'height': 2})
        async with publisher:
            with self.assertRaisesRegex(ValueError, 'full RGB24'):
                await publisher.write(bytes(11))
        self.assertEqual(publisher.process.returncode, 0)
