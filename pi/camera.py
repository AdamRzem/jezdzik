"""Capture clock, frame metadata and pixel stamp shared by sensor producers."""

import asyncio
import time
from dataclasses import dataclass


def boot_time_ns() -> int:
    return time.clock_gettime_ns(time.CLOCK_BOOTTIME)


def crc8(frame: int) -> int:
    crc = 0
    for byte in ((frame >> 8) & 255, frame & 255):
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ (7 if crc & 128 else 0)) & 255
    return crc


def stamp_levels(frame: int) -> tuple[int, ...]:
    """The 26 block lumas, ready for a future picamera2 pre_callback."""
    bits = [1, 0]
    bits.extend((frame >> bit) & 1 for bit in range(15, -1, -1))
    bits.extend((crc8(frame) >> bit) & 1 for bit in range(7, -1, -1))
    return tuple(235 if bit else 16 for bit in bits)


@dataclass(frozen=True)
class Frame:
    number: int
    sensor_timestamp_ns: int
    exposure_us: int
    readout_ns: int = 0

    @property
    def pose_time_ns(self) -> int:
        return self.sensor_timestamp_ns - self.exposure_us * 1000 // 2 + self.readout_ns // 2


class StubCamera:
    # REAL DATA INPUT: replace this generator with timestamped picamera2 captures.
    def __init__(self, settings: dict):
        self.fps = settings["fps"]
        self.exposure_us = settings["exposure_us"]
        self.readout_ns = settings["readout_ns"] or 0
        self.counter = 0

    async def frames(self, stopped: asyncio.Event):
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        while not stopped.is_set():
            yield Frame(self.counter, boot_time_ns(), self.exposure_us, self.readout_ns)
            self.counter = (self.counter + 1) & 0xFFFF
            deadline += 1 / self.fps
            try:
                await asyncio.wait_for(stopped.wait(), max(0.001, deadline - loop.time()))
            except TimeoutError:
                pass
            # Drop elapsed ticks after a stalled event loop instead of flooding clients.
            deadline = max(deadline, loop.time() - 1 / self.fps)
