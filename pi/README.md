# Sensor transport and browser processing

Real mode has one camera owner: **MediaMTX**. Python opens only the MPU-6050
on I²C; it never opens Picamera2 or runs FFmpeg. The browser performs IMU
calibration, axis mapping, unit conversion, quaternion integration, gravity
correction, attitude interpolation, marker detection, depth and object tracking.
Real translation remains untracked (`x=z=0`, `q=0`).

Run from the repository root:

```sh
mediamtx pi/mediamtx.yml
pi/.venv/bin/python pi/rover_ar.py
npm run dev
```

Install Python dependencies from `pi/requirements.txt` and the OS `python3-smbus2`
package. Enable I²C and give the service user access to it. Wire SDA GPIO2,
SCL GPIO3, power 3.3 V and GND; the default MPU-6050 address is 0x68.
MediaMTX needs camera permissions. Configure camera resolution/FPS in
`mediamtx.yml`; browser calibration remains in `src/lib/ar/config.ts`.

Open `/play?mode=live`. Keep the rover still during browser calibration (default
three seconds) and after reset/reconnect. Every viewer computes its own attitude.
Reset is shared through `/ws`; it clears browser tracking and restarts calibration.
Missing/stale IMU data uses neutral rover attitude so marker detection and overlays
continue with the configured camera mounting. Sensor failures stop Python.

## Timing and protocol

`/ws` starts with `{type:"hello",v:2,mode,e,imu}` in real mode. Raw batches contain
`{type:"imu",e,samples}`; each sample is `[sequence,timeUs,ax,ay,az,gx,gy,gz]`.
Counts are signed MPU-6050 register values at ±2 g and ±500 degrees/s, sampled
at 200 Hz. Times are microseconds relative to Python process startup.
`{cmd:"ping",t}` returns `{type:"pong",t,us}` for browser clock-offset estimation.
`{cmd:"reset"}` broadcasts a new epoch/handshake. Transport queues are bounded;
sample gaps cause browser recalibration. Real mode no longer publishes poses.
Deploy browser and Python changes together.

Native camera video has no pixel stamp. Real alignment is explicitly
**approximate**, using video presentation time minus a configured delay and
lowest-round-trip clock offset. Set `localStorage['rover.videoDelayMs']` to a
measured nonnegative video delay in milliseconds (default 0). This is not exact
capture synchronization: measure latency on the actual network before judging
overlay alignment. Verify mounting axes and IMU delay in `config.yaml`.

## Simulation

For Python mock mode, set `mode: mock` and run MediaMTX with
`pi/mediamtx-mock.yml` instead. Install `requirements-mock.txt` and FFmpeg.
Only mock mode renders camera images and publishes H.264 from Python. Its visible
watermark and CRC frame stamp remain; synthetic poses are source data. Marker
observations and immutable anchors stay in the browser. The independent browser
Demo and pose-only Python stub remain available. All modes use `/ws` and
`/cam/whep`; mock/stub handshakes identify their mode before poses arrive.

## Validation

```sh
pi/.venv/bin/python -m unittest discover -s pi/tests -v
npm test
npm run check
npm run build
```

Use a current Node release supported by the installed Vite/Svelte versions.
Hardware acceptance requires starting both services concurrently, confirming
only MediaMTX owns the camera, measuring browser load/video delay, testing reset
in two viewers and disconnecting/reconnecting IMU/video. Neural depth requires
WebGPU and downloaded assets (`npm run assets`); no positional odometry is added.
