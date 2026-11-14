# Pi mock sensor pipeline

The Python service supplies mock sensor data through the **existing rover
interfaces**. Open `/play` and select **Connect rover**, or open `/play?mode=live`.
The website, its routes and its data-processing code are unchanged. Mocking is
selected only by `mode: mock` in `config.yaml`. The camera pixels carry a visible
**SIMULATED CAMERA / NO HARDWARE** watermark.

## Run

Install FFmpeg with the `libx264` encoder and [MediaMTX](https://mediamtx.org/docs/kickoff/install)
on the machine running Python. Then, from the repository root:

```sh
python3 -m venv pi/.venv
pi/.venv/bin/pip install -r pi/requirements-mock.txt
```

Run these in separate terminals:

```sh
mediamtx pi/mediamtx.yml
pi/.venv/bin/python pi/rover_ar.py
npm run dev
```

Open the Vite URL and select **Connect rover**. MediaMTX receives the mock camera
at `rtsp://127.0.0.1:8554/cam` and exposes `/cam/whep` on port 8889. Python serves
poses at `/ws` on port 8765. Existing Vite defaults proxy both endpoints. This uses
MediaMTX's [FFmpeg publishing path](https://github.com/bluenviron/mediamtx/blob/main/docs/3-publish/08-ffmpeg.md).
Set `camera.ffmpeg` if the executable is not on PATH. Startup/encoding failures
are reported in the Python/FFmpeg logs; stalled video writes time out.

The normal browser marker and depth workers remain responsible for processing
video. Run `npm run assets` before using them if their assets are absent. Marker
detection requires the downloaded OpenCV.js build. Neural depth also requires a
supported WebGPU adapter; it falls back to tier C according to existing viewer
behavior. The mock does not inject object positions or depth results into the UI.
The original **Demo** remains the independent browser-only simulation.

For a remote backend, use `.env.example` to configure `PI_ORIGIN` and
`MEDIA_ORIGIN`. With separate local Python/MediaMTX services, these are
`http://127.0.0.1:8765` and `http://127.0.0.1:8889`. With Pi Caddy, set both to the
Pi HTTPS origin. MediaMTX media uses UDP 8189 directly; set its advertised host
configuration appropriately for remote viewers.

## Data flow

```text
StubCamera.frames(): capture timestamp + wrapping frame ID
  -> MockPipeline.capture(): capture-time attitude + moving position
       -> PoseServer.publish(): normal /ws Pose JSON
       -> RGB image: projected room/cubes, ArUco markers, CRC pixel stamp
            -> VideoPublisher: FFmpeg H.264 baseline, no B-frames
                 -> MediaMTX: RTSP /cam -> existing /cam/whep
                      -> browser capture + CRC decoder + exact pose matching
                      -> existing ArUco/PnP + depth workers
                      -> existing renderer, object store and local map
  <- normal /ws obs commands: validation, deduplication, immutable mock anchors
  <- normal /ws reset command: shared new epoch and cleared tracking state
```

`Capture` binds the source `Frame`, `pose` and RGB24 pixels together. The pose is
published before the corresponding video frame enters the encoder. Both carry
the same wrapping 16-bit frame number. Poses retain the original fields
`e,f,x,z,yaw,pitch,roll,q`; there is no mock envelope or alternate socket endpoint.
Distances are metres, angles radians; coordinates are right-handed, Y up and -Z
forward. All viewers share one epoch.

Synthetic geometry is private to the camera renderer: 100 mm cubes have 80 mm
`DICT_4X4_50` markers, with four face IDs per item, matching the browser convention.
Only visible markers become detected objects. Occlusion or perspective can hide
some cubes. Marker pixels and stamp pixels are rendered at full resolution;
the checkerboard floor is sampled at lower resolution. Mock confidence `q: 2`
means known synthetic motion, not measured hardware accuracy. Neural depth works
on these ordinary video pixels and can have the same limitations as other scenes.

Frame production targets `camera.fps`; processing and encoding can lower actual
throughput. FFmpeg stdin uses awaited flow control and a timeout so frames do not
build up in an unbounded producer queue. The pose buffer/history still bounds how
old observations can be. `reset` changes the shared epoch, restarts mock motion,
and clears pose history, anchors and observation deduplication. Frame IDs keep
advancing; old encoded frames may arrive briefly while the browser resynchronizes.

Returned observations must refer to a retained capture in the current epoch.
They are deduplicated by `(e,f,item)`, transformed from capture-relative coordinates
into world coordinates and used to establish immutable mock anchors. Synthetic
ground truth has no drift; actual VO drift estimation/correction remains a clearly
marked hardware integration point.

Set `mode: stub` for the original stationary `q: 0` pose-only service without video.
That mode only needs `requirements.txt`. Unimplemented hardware modes are rejected.

## Real data inputs

Search for **`REAL DATA INPUT`** in `pi/`:

| Input                  | Location                                              | Replacement                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime construction   | `rover_ar.py:run`                                     | Construct real camera, IMU and VO adapters instead of mock sources. Keep the normal pose/video publication paths.                                                 |
| Camera capture         | `camera.py:StubCamera.frames`, `MockPipeline.capture` | Return real pixels, sensor timestamp, exposure and readout for one capture. Assign the same frame ID to pixels and tracking.                                      |
| Stamping/encoding      | `MockPipeline.image`, `video.py:VideoPublisher`       | Stamp 26 adjacent 16x16 blocks before encoding real pixels. Reuse the FFmpeg publisher or replace it with a hardware encoder publishing to the same RTSP URL.     |
| IMU                    | `imu.py:StubIMU`, `MockPipeline.capture`              | Read timestamped MPU-6050 samples, calibrate gyro bias while stationary, fuse attitude and interpolate at `Frame.pose_time_ns`.                                   |
| Position/quality       | `vo.py:StubVO.update`, `MockPipeline.capture`         | Supply calibrated floor odometry and measured tracking confidence.                                                                                                |
| Landmarks/drift        | `vo.py:StubVO.observe`, `MockTracking.observe`        | Preserve capture-history validation, deduplication and immutable anchors; apply bounded residual corrections to measured VO.                                      |
| Camera/IMU calibration | `config.yaml`                                         | Measure sensor mode/readout, intrinsics, distortion, mounting geometry, IMU delay and axes. Keep these consistent with the existing browser camera configuration. |

Object detections and depth need no mock/real switch on the site: its existing
workers process whichever camera publishes the video. Replace the Python sources
with hardware measurements and the consumer stays the same.

`Frame.pose_time_ns` uses sensor timestamp minus half exposure plus half readout.
Confirm the physical camera driver's timestamp semantics before connecting it.
Unknown sensor mode/readout/distortion values remain explicitly marked in the
configuration. Mock values and tests do not establish hardware calibration.

## Validate

```sh
pi/.venv/bin/python -m unittest discover -s pi/tests -v
# With MediaMTX, Python, Vite and downloaded OpenCV.js running:
node pi/tests/check_browser.mjs
```

The tests cover invalid configuration, encoder startup/failure/cleanup,
stamp pixels, pose/frame identity, motion and wrap, actual ArUco
and PnP geometry, observation validation/anchors, shared reset, original wire fields
and rejection of the removed mock endpoint. Camera tests skip if mock rendering
dependencies are absent. WebSocket tests require `requirements.txt`.

The browser check uses actual H.264/WHEP and Python poses, without intercepting
network traffic. It verifies two existing live viewers, real marker detection,
matching frame stamps, a shared epoch and recovery in both viewers after reset. It needs Playwright Chromium; set
`AR_BROWSER_PATH` for another executable and `AR_BASE_URL` for another Vite URL.
It writes `/tmp/rover-pipeline.png`.

`mediamtx.yml`, `Caddyfile` and `rover-ar.service` are deployment templates. Set the
real hostname/IP, user and paths before installing services. Hardware capture,
IMU fusion, measured odometry, drift correction, calibration and real performance
acceptance still require implementation and measurement on the rover.
