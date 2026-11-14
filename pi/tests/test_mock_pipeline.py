import asyncio
import importlib.util
import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from camera import Frame, stamp_levels
from imu import Orientation, StubIMU
from mock_pipeline import ITEMS, MockPipeline, MockTracking
from pose_server import PoseServer
from video import VideoPublisher

SETTINGS = dict(width=1280, height=720, fx=1653.8, fy=1662.4, cx=640, cy=360,
                height_m=0.127, tilt_deg=10, fps=30, bitrate=3000000,
                rtsp_url='rtsp://127.0.0.1:8554/cam')
HAS_RENDERER = all(importlib.util.find_spec(m) for m in ('cv2', 'numpy'))


class TrackingTests(unittest.TestCase):
    def test_observation_roundtrip_dedup_history_and_reset(self):
        vo = MockTracking(2)
        pose = vo.update(Frame(65535, 1_000_000_000, 0), Orientation(yaw=.03))
        item = {'x': 0.23, 'z': -1.38, 'yaw': -0.3}
        dx, dz = item['x'] - pose['x'], item['z'] - pose['z']
        c, s = math.cos(pose['yaw']), math.sin(pose['yaw'])
        obs = dict(cmd='obs', e=pose['e'], f=65535, item=1,
                   right=dx*c-dz*s, forward=-dx*s-dz*c, yaw=item['yaw']-pose['yaw'])
        self.assertTrue(vo.observe(obs))
        self.assertFalse(vo.observe(obs))
        for key in item:
            self.assertAlmostEqual(vo.anchors[1][key], item[key])
        for invalid in ({'e': -1}, {'f': 123}, {'right': float('nan')}, {'right': 10**400}, {'item': True}):
            self.assertFalse(vo.observe({**obs, **invalid}))
        for number in (0, 1):
            vo.update(Frame(number, 0, 0), Orientation())
        self.assertFalse(vo.observe(obs))
        old = vo.epoch
        vo.reset()
        self.assertNotEqual(vo.epoch, old)
        self.assertFalse(vo.anchors)
        self.assertFalse(vo.observations)

    def test_publisher_uses_existing_rtsp_path_and_browser_compatible_h264(self):
        command = VideoPublisher(SETTINGS).command()
        self.assertEqual(command[-1], SETTINGS['rtsp_url'])
        self.assertEqual(command[command.index('-profile:v') + 1], 'baseline')
        self.assertEqual(command[command.index('-bf') + 1], '0')
        self.assertIn('rgb24', command)


@unittest.skipUnless(HAS_RENDERER, 'Install requirements-mock.txt for camera tests')
class MockCameraTests(unittest.TestCase):
    def setUp(self):
        self.pipeline = MockPipeline(SETTINGS, 3)

    def test_pixel_stamp_and_pose_describe_same_capture(self):
        capture = self.pipeline.capture(Frame(65535, 1_000_000_000, 4000))
        self.assertEqual(len(capture.rgb), 1280 * 720 * 3)
        self.assertEqual(capture.frame.pose_time_ns, 998000000)
        self.assertEqual(capture.pose['f'], 65535)
        self.assertEqual(capture.pose['q'], 2)
        for block, level in enumerate(stamp_levels(65535)):
            for y in (0, 8, 15):
                pixel = y * 1280 * 3 + (block * 16 + 8) * 3
                self.assertEqual(capture.rgb[pixel:pixel + 3], bytes([level] * 3))
        next_capture = self.pipeline.capture(Frame(0, 2_000_000_000, 0))
        self.assertEqual(next_capture.pose['f'], 0)
        self.assertNotEqual(next_capture.pose['x'], capture.pose['x'])
        old = self.pipeline.vo.epoch
        self.pipeline.reset()
        restarted = self.pipeline.capture(Frame(1, 3_000_000_000, 0))
        self.assertNotEqual(restarted.pose['e'], old)
        self.assertEqual(restarted.pose['x'], 0)

    def test_real_aruco_detection_and_pnp_recover_fixture_positions(self):
        p = self.pipeline
        np, cv = p.np, p.cv
        capture = p.capture(Frame(7, 1_000_000_000, 0))
        image = np.frombuffer(capture.rgb, dtype=np.uint8).reshape(720, 1280, 3)
        dictionary = cv.aruco.getPredefinedDictionary(cv.aruco.DICT_4X4_50)
        corners, ids, _ = cv.aruco.ArucoDetector(dictionary).detectMarkers(image)
        self.assertIsNotNone(ids)
        self.assertGreaterEqual(len(ids), 2)
        camera = np.array([[SETTINGS['fx'], 0, 640], [0, SETTINGS['fy'], 360], [0, 0, 1.]])
        points = np.array([[-.04,.04,0], [.04,.04,0], [.04,-.04,0], [-.04,-.04,0]])
        tilt = math.radians(SETTINGS['tilt_deg'])
        rotation = np.array([[1,0,0], [0,math.cos(tilt),math.sin(tilt)],
                             [0,-math.sin(tilt),math.cos(tilt)]])
        for marker, pixels in zip(ids.flatten(), corners):
            ok, rvec, tvec = cv.solvePnP(points, pixels.astype(float), camera, np.zeros(5),
                                         flags=cv.SOLVEPNP_IPPE_SQUARE)
            self.assertTrue(ok)
            r, _ = cv.Rodrigues(rvec)
            optical_to_world = rotation @ np.diag([1.,-1.,-1.])
            normal = optical_to_world @ r[:,2]
            up = optical_to_world @ r[:,1]
            self.assertGreater(up[1], math.cos(math.pi/12))
            center = optical_to_world @ tvec.flatten() + [0, .127, 0] - .05*normal
            item = ITEMS[int(marker)//4]
            self.assertAlmostEqual(center[0], item['x'], delta=.025)
            self.assertAlmostEqual(center[2], item['z'], delta=.05)


@unittest.skipUnless(importlib.util.find_spec('websockets'), 'Install requirements.txt')
class MockSocketTests(unittest.IsolatedAsyncioTestCase):
    async def test_normal_pose_protocol_observations_shared_reset_and_no_mock_route(self):
        from websockets.asyncio.client import connect
        from websockets.asyncio.server import serve
        from websockets.exceptions import ConnectionClosedError

        vo = MockTracking(3)
        poses = PoseServer(StubIMU(), vo)
        async with serve(poses.handle, '127.0.0.1', 0) as server:
            url = f"ws://127.0.0.1:{server.sockets[0].getsockname()[1]}"
            poses.publish(vo.update(Frame(65535, 1_000_000_000, 0), Orientation()))
            async with connect(url + '/ws') as a, connect(url + '/ws') as b:
                first, second = json.loads(await a.recv()), json.loads(await b.recv())
                self.assertEqual(first, second)
                self.assertEqual(set(first), {'e','f','x','z','yaw','pitch','roll','q'})
                await a.send(json.dumps(dict(cmd='obs', e=first['e'], f=65535,
                                             item=0, right=0, forward=1, yaw=0)))
                for _ in range(100):
                    if vo.anchors:
                        break
                    await asyncio.sleep(.001)
                self.assertIn(0, vo.anchors)
                await a.send('{"cmd":"reset"}')
                for _ in range(100):
                    if vo.epoch != first['e']:
                        break
                    await asyncio.sleep(.001)
                poses.publish(vo.update(Frame(0, 2_000_000_000, 0), Orientation()))
                new_a, new_b = json.loads(await a.recv()), json.loads(await b.recv())
                self.assertEqual(new_a, new_b)
                self.assertNotEqual(new_a['e'], first['e'])
                self.assertEqual(new_a['f'], 0)
                self.assertFalse(vo.anchors)
            async with connect(url + '/ws/mock') as removed:
                with self.assertRaises(ConnectionClosedError):
                    await removed.recv()
