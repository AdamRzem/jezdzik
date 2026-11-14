"""Pose/epoch interface stub. It never claims to have tracked the floor."""

import math
import secrets
from collections import OrderedDict

from camera import Frame
from imu import Orientation


class StubVO:
    def __init__(self, history_frames: int = 90):
        self.history_frames = history_frames
        self.history: OrderedDict[int, dict] = OrderedDict()
        self.epoch = secrets.randbelow(2**31)

    def reset(self) -> None:
        previous = self.epoch
        self.epoch = (previous + 1 + secrets.randbelow(2**31 - 1)) % 2**31
        self.history.clear()
        # TODO: clear immutable landmark anchors and observation deduplication.

    def update(self, frame: Frame, orientation: Orientation) -> dict:
        # REAL DATA INPUT: replace stationary values with measured floor odometry.
        pose = {"e": self.epoch, "f": frame.number, "x": 0.0, "z": 0.0,
                "yaw": orientation.yaw, "pitch": orientation.pitch,
                "roll": orientation.roll, "q": 0}
        self.history[frame.number] = pose
        while len(self.history) > self.history_frames:
            self.history.popitem(last=False)
        return pose

    def valid_observation(self, command: dict) -> bool:
        """Only accept finite observations for a retained capture in this epoch."""
        if type(command.get("e")) is not int or command.get("e") != self.epoch or type(command.get("f")) is not int:
            return False
        if command["f"] not in self.history:
            return False
        if type(command.get("item")) is not int or not 0 <= command["item"] < 12:
            return False
        for key in ("right", "forward", "yaw"):
            value = command.get(key)
            try:
                if type(value) not in (int, float) or not math.isfinite(value):
                    return False
            except OverflowError:
                return False
        return True

    def observe(self, command: dict) -> bool:
        """REAL DATA INPUT: implement landmark correction using capture history."""
        return False
