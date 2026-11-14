#!/usr/bin/env python3
"""Run the Pi stub: a local pose service, with no hardware access or video."""

import argparse
import asyncio
import logging
import signal
from pathlib import Path

import yaml

from camera import StubCamera
from imu import StubIMU
from pose_server import PoseServer
from vo import StubVO


def load_config(path: Path) -> dict:
    with path.open() as stream:
        config = yaml.safe_load(stream)
    if not isinstance(config, dict) or config.get("mode") != "stub":
        raise ValueError("Only mode: stub is implemented")
    camera, server = config["camera"], config["server"]
    if type(camera["fps"]) not in (int, float) or not 0 < camera["fps"] <= 120:
        raise ValueError("camera.fps must be between 0 and 120")
    if type(server["port"]) is not int or not 0 < server["port"] < 65536:
        raise ValueError("server.port must be between 1 and 65535")
    if not isinstance(server["host"], str) or not server["host"]:
        raise ValueError("server.host must be a hostname or IP address")
    return config


async def run(config: dict) -> None:
    from websockets.asyncio.server import serve

    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stopped.set)
    camera, imu = StubCamera(config["camera"]), StubIMU()
    vo = StubVO(round(config["tracking"]["history_seconds"] * camera.fps))
    poses = PoseServer(imu, vo)
    host, port = config["server"]["host"], config["server"]["port"]
    async with serve(poses.handle, host, port, max_size=4096, ping_interval=5, ping_timeout=5):
        logging.warning("STUB ONLY: ws://%s:%s/ws; no video, IMU, floor tracking or drift correction", host, port)
        async for frame in camera.frames(stopped):
            poses.publish(vo.update(frame, imu.orientation_at(frame.pose_time_ns)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.yaml"))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        asyncio.run(run(load_config(args.config)))
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f"Configuration/startup error: {error}\n")
    except ModuleNotFoundError as error:
        parser.exit(1, f"Missing dependency: {error.name}. Install pi/requirements.txt in a virtual environment.\n")


if __name__ == "__main__":
    main()
