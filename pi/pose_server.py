"""The real WebSocket wire protocol around synthetic, lost-quality poses."""

import json
import logging

from imu import StubIMU
from vo import StubVO


class PoseServer:
    def __init__(self, imu: StubIMU, vo: StubVO):
        self.imu = imu
        self.vo = vo
        self.clients = set()
        self.latest = None

    def command(self, payload) -> None:
        if not isinstance(payload, str):
            return
        try:
            command = json.loads(payload)
        except (ValueError, TypeError):
            return
        if not isinstance(command, dict):
            return
        if command.get("cmd") == "reset":
            self.imu.reset()
            self.vo.reset()
            self.latest = None
            logging.info("Stub reset: epoch=%s (hardware calibration is not implemented)", self.vo.epoch)
        elif command.get("cmd") == "obs":
            self.vo.observe(command)

    async def handle(self, websocket) -> None:
        from websockets.exceptions import ConnectionClosed

        self.clients.add(websocket)
        try:
            if self.latest is not None:
                await websocket.send(self.latest)
            async for payload in websocket:
                self.command(payload)
        except ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)

    def publish(self, pose: dict) -> None:
        from websockets.asyncio.server import broadcast

        self.latest = json.dumps(pose, separators=(",", ":"), allow_nan=False)
        broadcast(self.clients, self.latest)
