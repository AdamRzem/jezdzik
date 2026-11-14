"""Raw RGB -> H.264 -> normal MediaMTX RTSP/WHEP path, with bounded writes.

REAL DATA INPUT: a hardware encoder can replace this software publisher while
preserving the pre-encode pixel stamp and camera.rtsp_url destination.
"""

import asyncio


class VideoPublisher:
    def __init__(self, settings: dict):
        self.settings = settings
        self.process = None

    def command(self):
        s = self.settings
        return [
            s.get("ffmpeg", "ffmpeg"), "-hide_banner", "-loglevel", "warning",
            "-f", "rawvideo", "-pixel_format", "rgb24",
            "-video_size", f'{s["width"]}x{s["height"]}',
            "-framerate", str(s["fps"]), "-i", "pipe:0", "-an",
            "-c:v", "libx264", "-profile:v", "baseline",
            "-preset", "ultrafast", "-tune", "zerolatency",
            "-pix_fmt", "yuv420p", "-bf", "0", "-g", str(max(1, round(s["fps"]))),
            "-b:v", str(s["bitrate"]), "-threads", "2",
            "-f", "rtsp", "-rtsp_transport", "tcp", s["rtsp_url"],
        ]

    async def __aenter__(self):
        try:
            self.process = await asyncio.create_subprocess_exec(
                *self.command(), stdin=asyncio.subprocess.PIPE)
        except OSError as error:
            raise OSError("Cannot start video encoder; install FFmpeg with libx264 "
                          "or set camera.ffmpeg to its executable path") from error
        return self

    async def write(self, rgb: bytes):
        if len(rgb) != self.settings["width"] * self.settings["height"] * 3:
            raise ValueError("Video frame must be a full RGB24 camera capture")
        try:
            self.process.stdin.write(rgb)
            await asyncio.wait_for(self.process.stdin.drain(), timeout=5)
        except (BrokenPipeError, ConnectionResetError, TimeoutError) as error:
            raise OSError("Video publisher failed/stalled; check FFmpeg and MediaMTX at "
                          + self.settings["rtsp_url"]) from error

    async def __aexit__(self, *exc):
        if self.process is None:
            return
        self.process.stdin.close()
        try:
            await asyncio.wait_for(self.process.wait(), 3)
        except TimeoutError:
            if self.process.returncode is None:
                self.process.kill()
            await self.process.wait()
