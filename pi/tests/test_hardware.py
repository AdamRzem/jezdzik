"""Hardware adapter contracts exercised without Pi devices."""
import math
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from camera import PiCamera, stamp_levels
from imu import MPU6050, attitude


class IMUTests(unittest.TestCase):
    def test_quaternion_yxz_axes(self):
        for axis, field in ((1, 'pitch'), (2, 'yaw'), (3, 'roll')):
            q = [math.cos(.15), 0, 0, 0]
            q[axis] = math.sin(.15)
            self.assertAlmostEqual(getattr(attitude(q), field), .3)

    def test_capture_time_interpolation_reset_and_sensor_failure(self):
        imu = MPU6050({})
        imu.history.append((1, 100_000_000, (0, 16384, 0, 0, 0, 0)))
        self.assertEqual(len(imu.drain()), 1)
        self.assertEqual(imu.drain(), [])
        imu.error = OSError('disconnected')
        with self.assertRaisesRegex(OSError, 'sampling failed'):
            imu.drain()

    def test_i2c_configuration_and_cleanup(self):
        bus = MagicMock()
        bus.read_byte_data.return_value = 0x68
        with patch.dict(sys.modules, {'smbus2': types.SimpleNamespace(SMBus=MagicMock(return_value=bus))}), \
                patch('threading.Thread') as thread:
            with MPU6050({'bus': 1, 'address': 0x68}):
                self.assertEqual(bus.write_byte_data.call_count, 5)
                bus.write_byte_data.assert_any_call(0x68, 0x1b, 8)
            bus.close.assert_called_once()
            thread.return_value.join.assert_called_once()

    def test_wrong_chip_closes_bus(self):
        bus = MagicMock()
        bus.read_byte_data.return_value = 0
        with patch.dict(sys.modules, {'smbus2': types.SimpleNamespace(SMBus=MagicMock(return_value=bus))}):
            with self.assertRaisesRegex(OSError, 'No MPU-6050'):
                with MPU6050({'bus': 1, 'address': 0x68}):
                    pass
        bus.close.assert_called_once()


class CameraTests(unittest.TestCase):
    def test_capture_uses_one_request_and_releases_on_failure(self):
        camera = PiCamera({'readout_ns': 10_000_000})
        camera.camera = MagicMock()
        request = camera.camera.capture_request.return_value
        request.get_metadata.return_value = {'SensorTimestamp': 100_000_000, 'ExposureTime': 4000}
        image = request.make_array.return_value.copy.return_value
        image.tobytes.return_value = b'pixels'
        camera.counter = 65535
        frame, pixels = camera.capture()
        self.assertEqual(frame.number, 65535)
        self.assertEqual(frame.pose_time_ns, 103_000_000)
        self.assertEqual(pixels, b'pixels')
        self.assertEqual(camera.counter, 0)
        self.assertEqual(image.__setitem__.call_count, len(stamp_levels(65535)))
        request.release.assert_called_once()
        request.reset_mock()
        request.get_metadata.return_value = {}
        with self.assertRaises(KeyError):
            camera.capture()
        request.release.assert_called_once()
