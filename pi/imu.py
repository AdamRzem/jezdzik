"""MPU-6050 attitude sampling plus the lightweight simulation IMU interface."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Orientation:
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0


class StubIMU:
    def orientation_at(self, timestamp_ns: int) -> Orientation:
        # REAL DATA INPUT: interpolate the MPU-6050 quaternion history at this capture time.
        return Orientation()

    def reset(self) -> None:
        # REAL DATA INPUT: refuse calibration while moving, then average 600 gyro samples.
        pass


# Quaternion convention: body -> world, components w,x,y,z; world Y is up.
def multiply(a, b):
    w, x, y, z = a
    v, i, j, k = b
    return (w*v-x*i-y*j-z*k, w*i+x*v+y*k-z*j,
            w*j-x*k+y*v+z*i, w*k+x*j-y*i+z*v)


def attitude(q):
    import math
    w, x, y, z = q
    return Orientation(math.atan2(2*(x*z+w*y), 1-2*(x*x+y*y)),
                       math.asin(max(-1, min(1, 2*(w*x-y*z)))),
                       math.atan2(2*(x*y+w*z), 1-2*(x*x+z*z)))


class MPU6050:
    """Timestamped I2C sampling, stationary bias calibration and attitude history."""

    def __init__(self, settings):
        import threading
        from collections import deque
        self.settings = settings
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.recalibrate = threading.Event()
        self.recalibrate.set()
        self.history = deque(maxlen=2400)
        self.error = None
        self.bus = None
        self.thread = None

    def __enter__(self):
        import threading
        from smbus2 import SMBus
        s = self.settings
        self.bus = SMBus(s["bus"])
        try:
            if self.bus.read_byte_data(s["address"], 0x75) & 0x7e != 0x68:
                raise OSError("No MPU-6050 at configured I2C address")
            for register, value in ((0x6b, 1), (0x19, 4), (0x1a, 3), (0x1b, 8), (0x1c, 0)):
                self.bus.write_byte_data(s["address"], register, value)
            self.thread = threading.Thread(target=self._sample, daemon=True, name="mpu6050")
            self.thread.start()
        except BaseException:
            self.bus.close()
            raise
        return self

    def drain(self):
        with self.lock:
            if self.error:
                raise OSError("MPU-6050 sampling failed") from self.error
            samples = list(self.history)
            self.history.clear()
            return samples

    def _sample(self):
        import struct
        import time
        from camera import boot_time_ns
        deadline = time.monotonic()
        sequence = 0
        try:
            while not self.stop.is_set():
                raw = struct.unpack(">7h", bytes(self.bus.read_i2c_block_data(
                    self.settings["address"], 0x3b, 14)))
                with self.lock:
                    self.history.append((sequence, boot_time_ns(), raw[:3] + raw[4:]))
                sequence += 1
                deadline += 1/200
                self.stop.wait(max(0, deadline-time.monotonic()))
                deadline = max(deadline, time.monotonic()-1/200)
        except Exception as error:
            with self.lock:
                self.error = error

    def __exit__(self, *exc):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=2)
        if self.bus:
            self.bus.close()
