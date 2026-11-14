"""Versioned raw sensor transport; no calibration or tracking on the Pi."""
import asyncio
import json
import secrets
import math
from camera import boot_time_ns

class RawServer:
    def __init__(self, settings):
        self.settings = settings
        self.origin = boot_time_ns()
        self.epoch = secrets.randbelow(2**31)
        self.clients = set()

    def hello(self):
        return {"type": "hello", "v": 2, "mode": "real", "e": self.epoch,
                "imu": self.settings}

    def broadcast(self, message):
        for queue in tuple(self.clients):
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(json.dumps(message, allow_nan=False))

    def publish(self, samples):
        if samples:
            self.broadcast({"type": "imu", "e": self.epoch, "samples": [
                [seq, (timestamp-self.origin)//1000, *raw] for seq, timestamp, raw in samples]})

    async def handle(self, websocket):
        if websocket.request.path != "/ws":
            await websocket.close(1008, "Use /ws")
            return
        queue = asyncio.Queue(maxsize=25)
        self.clients.add(queue)
        async def writer():
            while True:
                await asyncio.wait_for(websocket.send(await queue.get()), 5)
        await websocket.send(json.dumps(self.hello()))
        task = asyncio.create_task(writer())
        def writer_done(done):
            if not done.cancelled() and done.exception() is not None:
                asyncio.create_task(websocket.close(1011, "Sensor stream stalled"))
        task.add_done_callback(writer_done)
        try:
            async for payload in websocket:
                try:
                    command = json.loads(payload)
                except (ValueError, TypeError):
                    continue
                if not isinstance(command, dict):
                    continue
                if command.get("cmd") == "ping" and type(command.get("t")) in (int, float) and math.isfinite(command["t"]):
                    await websocket.send(json.dumps({"type": "pong", "t": command["t"],
                        "us": (boot_time_ns()-self.origin)//1000}))
                elif command.get("cmd") == "reset":
                    self.epoch = (self.epoch+1) % 2**31
                    self.broadcast(self.hello())
        finally:
            self.clients.discard(queue)
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
