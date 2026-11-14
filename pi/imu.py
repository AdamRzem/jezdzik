"""IMU interface stub. Hardware bias calibration and fusion remain unimplemented."""

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
