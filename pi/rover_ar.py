#!/usr/bin/env python3
"""Run real Picamera2/MPU-6050 sensors or the optional mock pipeline."""

import argparse
import asyncio
import logging
import math
import signal
from pathlib import Path

import yaml

from camera import StubCamera
from imu import MPU6050, StubIMU
from mock_pipeline import MockPipeline
from pose_server import PoseServer
from vo import StubVO
from video import VideoPublisher


def load_config(path: Path) -> dict:
    with path.open() as stream:
        config = yaml.safe_load(stream)
    if not isinstance(config, dict) or config.get("mode") not in ("stub", "mock", "real"):
        raise ValueError("Supported modes: real, mock, stub")
    for name in ("camera", "server", "tracking"):
        if not isinstance(config.get(name), dict):
            raise ValueError(f"{name} must be a configuration mapping")
    camera, server = config["camera"], config["server"]

    def number(section, key, low, high, *, integer=False, optional=False):
        value = config[section].get(key)
        if optional and value is None:
            return
        types = (int,) if integer else (int, float)
        try:
            valid = type(value) in types and math.isfinite(value) and low <= value <= high
        except OverflowError:
            valid = False
        if not valid:
            kind = "integer" if integer else "finite number"
            raise ValueError(f"{section}.{key} must be a {kind} between {low} and {high}")

    number("camera", "fps", 1, 120)
    number("server", "port", 1, 65535, integer=True)
    if not isinstance(server.get("host"), str) or not server["host"].strip():
        raise ValueError("server.host must be a hostname or IP address")
    number("camera", "width", 1280, 1280, integer=True)
    number("camera", "height", 720, 720, integer=True)
    number("camera", "exposure_us", 0, 1_000_000, integer=True)
    number("camera", "readout_ns", 0, 1_000_000_000, integer=True, optional=True)
    number("tracking", "history_seconds", .001, 60)
    if config["mode"] in ("mock", "real"):
        for key in ("fx", "fy"):
            number("camera", key, .001, 100000)
        number("camera", "height_m", .001, 100)
        number("camera", "cx", 0, camera["width"])
        number("camera", "cy", 0, camera["height"])
        number("camera", "tilt_deg", -89, 89)
        number("camera", "bitrate", 1, 100_000_000, integer=True)
        if not isinstance(camera.get("ffmpeg", "ffmpeg"), str) or not camera.get("ffmpeg", "ffmpeg").strip():
            raise ValueError("camera.ffmpeg must be an executable name or path")
        if not isinstance(camera.get("rtsp_url"), str) or not camera["rtsp_url"].startswith("rtsp://"):
            raise ValueError("camera.rtsp_url must be an rtsp:// publisher URL")
    if config["mode"] == "real":
        if not isinstance(config.get("imu"), dict):
            raise ValueError("imu must be a configuration mapping")
        number("camera", "gain", 1, 32)
        number("imu", "bus", 0, 255, integer=True)
        number("imu", "address", 0x68, 0x69, integer=True)
        number("imu", "delay_ns", 0, 1_000_000_000, integer=True)
        number("imu", "bias_seconds", .5, 30)
        mapping = config["imu"].get("axis_mapping")
        if (not isinstance(mapping, list) or len(mapping) != 3
                or any(not isinstance(row, list) or len(row) != 3 for row in mapping)
                or any(type(v) not in (int, float) or not math.isfinite(v)
                       for row in mapping for v in row)):
            raise ValueError("imu.axis_mapping must be a finite 3x3 rotation matrix")
        for i in range(3):
            for j in range(3):
                if abs(sum(mapping[i][k]*mapping[j][k] for k in range(3)) - (i == j)) > 1e-6:
                    raise ValueError("imu.axis_mapping must be an orthonormal rotation matrix")
        a, b, c = mapping
        determinant = (a[0]*(b[1]*c[2]-b[2]*c[1]) - a[1]*(b[0]*c[2]-b[2]*c[0])
                       + a[2]*(b[0]*c[1]-b[1]*c[0]))
        if abs(determinant-1) > 1e-6:
            raise ValueError("imu.axis_mapping must preserve handedness")
    return config


async def run(config: dict) -> None:
    from websockets.asyncio.server import serve

    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stopped.set)
    if config["mode"] == "real":
        await run_real(config, stopped)
        return
    camera, imu = StubCamera(config["camera"]), StubIMU()
    vo = StubVO(max(1, round(config["tracking"]["history_seconds"] * camera.fps)))
    # Simulation sources; real camera/IMU construction is in run_real below.
    pipeline = MockPipeline(config["camera"], vo.history_frames) if config["mode"] == "mock" else None
    poses = PoseServer(imu, pipeline.vo if pipeline else vo, pipeline)
    host, port = config["server"]["host"], config["server"]["port"]
    async with serve(poses.handle, host, port, max_size=4096, ping_interval=5, ping_timeout=5):
        if pipeline:
            logging.warning("MOCK SENSOR DATA: /ws poses + stamped video -> %s; NO HARDWARE",
                            config["camera"]["rtsp_url"])
            async with VideoPublisher(config["camera"]) as video:
                async for frame in camera.frames(stopped):
                    capture = pipeline.capture(frame)
                    # Publish pose first so it is buffered before encoded video arrives.
                    poses.publish(capture.pose)
                    await video.write(capture.rgb)
        else:
            logging.warning("STUB: /ws stationary poses only; no video or hardware")
            async for frame in camera.frames(stopped):
                poses.publish(vo.update(frame, imu.orientation_at(frame.pose_time_ns)))


async def run_real(config, stopped):
    from websockets.asyncio.server import serve

    from raw_server import RawServer
    logging.warning("MediaMTX owns camera; streaming raw IMU for browser processing")
    with MPU6050(config["imu"]) as imu:
        server = RawServer(config["imu"])
        async with serve(server.handle, config["server"]["host"], config["server"]["port"],
                         max_size=4096, ping_interval=5, ping_timeout=5):
            while not stopped.is_set():
                server.publish(imu.drain())
                await asyncio.sleep(.02)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.yaml"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        asyncio.run(run(load_config(args.config)))
    except (ValueError, KeyError, OSError, yaml.YAMLError) as error:
        parser.exit(1, f"Configuration/startup error: {error}\n")
    except ModuleNotFoundError as error:
        parser.exit(1, f"Missing dependency: {error.name}. See pi/README.md for real hardware packages; install requirements-mock.txt for mock mode.\n")


if __name__ == "__main__":
    main()
