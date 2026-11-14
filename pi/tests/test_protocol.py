import importlib.util
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from camera import Frame, crc8, stamp_levels
from imu import Orientation, StubIMU
from pose_server import PoseServer
from vo import StubVO


class ProtocolTests(unittest.TestCase):
    def test_crc_and_stamp_layout(self):
        self.assertEqual(crc8(0x1234), 0xF1)
        levels = stamp_levels(0x1234)
        self.assertEqual(len(levels), 26)
        self.assertEqual(levels[:2], (235, 16))
        bits = "".join("1" if value == 235 else "0" for value in levels[2:])
        self.assertEqual(int(bits[:16], 2), 0x1234)
        self.assertEqual(int(bits[16:], 2), 0xF1)

    def test_exposure_and_readout_are_separate(self):
        self.assertEqual(Frame(1, 100_000_000, 4000, 10_000_000).pose_time_ns, 103_000_000)
        self.assertEqual(Frame(1, 100_000_000, 10000, 10_000_000).pose_time_ns, 100_000_000)

    def test_stub_reports_lost_and_history_is_bounded(self):
        vo = StubVO(2)
        for number in range(3):
            pose = vo.update(Frame(number, 0, 0), Orientation())
        self.assertEqual(pose["q"], 0)
        self.assertEqual((pose["x"], pose["z"]), (0.0, 0.0))
        self.assertEqual(list(vo.history), [1, 2])

    def test_reset_is_shared_and_malformed_commands_are_ignored(self):
        vo = StubVO()
        server = PoseServer(StubIMU(), vo)
        for bad in ("no", "null", "[]", "12", '{"cmd":"unknown"}', b"binary"):
            server.command(bad)
        before = vo.epoch
        vo.update(Frame(7, 0, 0), Orientation())
        server.command('{"cmd":"reset"}')
        self.assertNotEqual(vo.epoch, before)
        self.assertEqual(len(vo.history), 0)
        self.assertLess(vo.epoch, 2**31)
        self.assertFalse(vo.observe({"e": before, "f": 7, "item": 0, "right": 0, "forward": 1, "yaw": 0}))


@unittest.skipUnless(importlib.util.find_spec("websockets"), "Install requirements.txt for WebSocket integration checks")
class WebSocketTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_viewers_receive_one_epoch_and_reset_together(self):
        from websockets.asyncio.client import connect
        from websockets.asyncio.server import serve

        vo = StubVO()
        poses = PoseServer(StubIMU(), vo)
        async with serve(poses.handle, "127.0.0.1", 0) as server:
            port = server.sockets[0].getsockname()[1]
            async with connect(f"ws://127.0.0.1:{port}/ws") as first, connect(f"ws://127.0.0.1:{port}/ws") as second:
                await first.recv()
                await second.recv()
                poses.publish(vo.update(Frame(65535, 0, 0), Orientation()))
                a, b = json.loads(await first.recv()), json.loads(await second.recv())
                self.assertEqual(a, b)
                old_epoch = a["e"]
                await first.send('{"cmd":"reset"}')
                import asyncio
                for _ in range(100):
                    if vo.epoch != old_epoch:
                        break
                    await asyncio.sleep(0.001)
                poses.publish(vo.update(Frame(0, 0, 0), Orientation()))
                a, b = json.loads(await first.recv()), json.loads(await second.recv())
                self.assertEqual(a, b)
                self.assertNotEqual(a["e"], old_epoch)
                self.assertEqual(a["f"], 0)
                self.assertEqual(a["q"], 0)
