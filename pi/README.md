# Pi hardware stub

This is an interface scaffold, not the hardware implementation. It broadcasts
stationary poses at 30 Hz with `q: 0` (position lost), a random 31-bit epoch, and a
wrapping 16-bit frame counter. All viewers share the same epoch. `reset` changes
the epoch and clears pose history without restarting the frame counter. `obs`
messages are validated but never used to create anchors or apply corrections.

From the repository root:

```sh
python3 -m venv pi/.venv
pi/.venv/bin/pip install -r pi/requirements.txt
pi/.venv/bin/python pi/rover_ar.py
```

The socket listens on `127.0.0.1:8765`. `npm run dev` proxies `/ws` to it.
The frontend's **Demo** mode is self-contained and does not use this service.
**Connect rover** requires an actual stamped MediaMTX stream as well as poses;
the stub deliberately provides no video and never reports tracked-quality poses.

No picamera2, I2C, ffmpeg, IMU filter, visual odometry, gyro calibration, or landmark
correction is implemented. Their module boundaries are ready for later work.
`camera.py` implements the wire-format stamp lumas and timestamp convention, but
does not write camera pixels. Sensor mode, readout time and distortion are marked
unknown in `config.yaml`.

`mediamtx.yml`, `Caddyfile`, and `rover-ar.service` are deployment templates only.
Check MediaMTX keys against your installed release, set the real hostname/IP,
adjust the `pi` user and `/home/pi/rover-ar` paths, and install services yourself
when the hardware is ready. Build the frontend and copy `build/` to the configured
`web/` folder. Caddy keeps `/cam/whep` intact when proxying to MediaMTX; only port
443/TCP and 8189/UDP need LAN access. Trust Caddy's local root certificate on
viewer devices for WebGPU.

Protocol checks (no hardware or WebSocket dependency needed):

```sh
python3 -m unittest discover -s pi/tests -v
```
