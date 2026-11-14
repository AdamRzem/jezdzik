# Rover AR view: implementation plan

Draft 1, 14 November 2026.

## 1. Goal

A model rover carries a Raspberry Pi 4 and a camera. People on the same network open a web page and see the rover's live video with virtual 3D objects drawn into it. The objects:

- sit on the floor and stay fixed in place while the rover drives,
- replace real items (a real 10 cm cube appears as a rock),
- are hidden by real things that pass in front of them (occlusion).

Out of scope for this plan: driving the rover (motor control, remote control UI), recording, and use over the internet.

## 2. Decisions already made

| Topic | Decision | Reason |
|---|---|---|
| Video transport | WebRTC, served by MediaMTX on the Pi | Lowest latency that plays natively in browsers |
| Camera owner | A Python script using picamera2, which publishes H.264 to MediaMTX | The script also needs raw frames for floor tracking and must stamp frame numbers |
| Rendering | Three.js on a transparent canvas over the `<video>` | Renderer only; every web tracker outputs to it |
| Rotation (heading, pitch, roll) | MPU-6050 gyro and accelerometer | No drift in pitch and roll; slow drift in heading |
| Position | Visual odometry on the near floor, run on the Pi on raw frames | No encoders or other hardware available; an IMU alone drifts by metres in seconds |
| Video-to-pose sync | Frame number stamped into the video pixels | Exact; 1° of error is 29 px with this lens, so timing by clock is not good enough |
| Item recognition | ArUco markers (`DICT_4X4_50`), 3D printed, on each side face | Gives identity and accurate pose from one camera |
| Marker detection | In the browser, in a Web Worker, with OpenCV.js | Full-resolution frames, plenty of compute, no load on the Pi |
| Occlusion | Depth Anything V2 Small in the browser, rescaled against the known floor | Objects are floor-only, so the floor gives metric scale every frame |
| Page hosting | The Pi serves everything over HTTPS through Caddy | Works with no internet; HTTPS is required for WebGPU |
| Viewers | Laptops and phones, with automatic quality tiers | Phones run the depth model slower or not at all |

## 3. Known parameters

### 3.1 Measured or chosen

| Parameter | Value | Status |
|---|---|---|
| Stream resolution | 1280 × 720, 30 fps | Chosen |
| Focal length fx, fy | 1653.8 px, 1662.4 px | Calibrated at 1280 × 720 |
| Optical centre cx, cy | 640, 360 | **Placeholder**, real values needed |
| Lens distortion | Unknown | **Needed** |
| Camera lens height above floor | 0.127 m | Chosen; measure to ±1 mm after mounting |
| Camera tilt below horizontal | 10° | Target; measure to ±0.2° after mounting |
| Real item size | 0.10 m cube | Assumed |
| Virtual object size | ≤ 0.12 m tall, ≥ 0.16 m across | Derived: must cover the cube and stay below camera height |

### 3.2 Derived from the above

| Quantity | Value |
|---|---|
| Horizontal field of view | 42.3° |
| Vertical field of view | 24.4° |
| Pixels per degree at image centre | 29.0 px |
| Horizon row in the image | 67 (from the top) |
| Nearest visible floor | 0.31 m ahead of the lens |
| Floor point at image centre | 0.72 m ahead |
| View width at 0.31 m / 1 m | 0.25 m / 0.78 m |
| Floor position error per 1° of pitch error | 0.14 m at 1 m, 0.55 m at 2 m |
| Marker detection range (8 cm marker, ≥ 30 px) | about 4.4 m |

Image row of a floor point at ground distance `d` (used for tests in Phase 2):

| Distance | 0.5 m | 1.0 m | 2.0 m | 3.0 m |
|---|---|---|---|---|
| Row at 1280 × 720 | 484 | 280 | 175 | 139 |

These rows assume cy = 360 and tilt = 10.0°. Recompute with the calibrated and measured values (formula in section 9.1).

### 3.3 Design limits

Full-quality tracking is designed for rover speeds up to 0.3 m/s and turn rates up to 60°/s. Above that, motion blur and rolling-shutter skew degrade floor tracking and marker detection; the system keeps running on the gyro and a constant-velocity prediction and reports reduced quality.

## 4. Architecture

```
 Raspberry Pi 4                                   Viewer (browser)
 ┌──────────────────────────────────────────┐     ┌────────────────────────────────────┐
 │ rover_ar.py                              │     │ index.html                         │
 │  camera.py  picamera2                    │     │                                    │
 │    main 1280x720 ─ stamp frame no. ─┐    │     │  <video> ◄── WebRTC (UDP 8189) ◄───┼── MediaMTX
 │    lores 640x360 ─► vo.py           │    │     │     │                              │
 │  imu.py  MPU-6050 @200 Hz ─► vo.py  │    │     │     ├─► read frame number          │
 │  vo.py  floor tracking ─► pose      │    │     │     ├─► markers.worker (OpenCV.js) │
 │  pose_server.py  WebSocket :8765 ───┼────┼─────┼──►  ├─► depth.worker (ONNX/WebGPU)  │
 │                                     ▼    │     │     ▼                              │
 │  H.264 hw encoder ─► ffmpeg ─► RTSP :8554│     │  Three.js canvas (overlay)         │
 │ MediaMTX  RTSP in, WebRTC out :8889      │     │   camera pose ◄ pose[frame number] │
 │ Caddy  HTTPS :443                        │     │   items in world coordinates       │
 │   /        static files (web/)           │     │   occlusion depth pass             │
 │   /cam/*   ─► MediaMTX :8889 (WHEP)      │     └────────────────────────────────────┘
 │   /ws      ─► pose_server :8765          │
 └──────────────────────────────────────────┘
```

### 4.1 Ports

| Port | Service | Reachable from |
|---|---|---|
| 443/tcp | Caddy: page, WHEP signalling, pose WebSocket | LAN |
| 8189/udp | MediaMTX WebRTC media | LAN |
| 8554/tcp | MediaMTX RTSP ingest | localhost only |
| 8889/tcp | MediaMTX WebRTC HTTP | localhost only (behind Caddy) |
| 8765/tcp | Pose WebSocket | localhost only (behind Caddy) |

### 4.2 Why one HTTPS address

WebGPU, which the depth model needs to run at a useful rate, only works on pages loaded over HTTPS (or from `localhost`). Putting the page, the video signalling and the pose socket behind one Caddy HTTPS address also removes cross-origin and mixed-content problems. Caddy issues its own certificate (`tls internal`); each viewer accepts a browser warning once, or installs Caddy's root certificate.

## 5. Conventions

### 5.1 World frame (shared by the Pi and Three.js)

- Right-handed, units in metres, Y up, floor is the plane y = 0.
- Origin: the floor point directly below the camera lens when the pose is reset.
- The rover's forward direction at reset is −Z; its right is +X.
- The tracked point is the floor point below the lens, not the rover's turning centre. Visual odometry measures the camera's own motion, so the offset to the turning centre is not needed.

### 5.2 Angles (radians)

| Angle | Axis | Positive direction |
|---|---|---|
| `yaw` | world +Y | Counter-clockwise seen from above; 0 at reset |
| `pitch` | rover +X (right) | Nose up |
| `roll` | rover +Z (backward) | Right side up |

Applied in Three.js with Euler order `'YXZ'`. Forward direction in world for a given yaw: (−sin yaw, 0, −cos yaw).

### 5.3 Camera frames

- OpenCV camera frame: x right, y down, z forward (used on the Pi and for `solvePnP`).
- Three.js camera frame: x right, y up, z backward.
- Conversion: multiply by S = diag(1, −1, −1), that is, negate the y and z rows (section 9.4).

### 5.4 Time

All Pi timestamps use `CLOCK_BOOTTIME` in nanoseconds: `SensorTimestamp` from picamera2 for frames, `time.clock_gettime_ns(time.CLOCK_BOOTTIME)` for IMU samples. The browser never compares clocks with the Pi; it matches by frame number only.

## 6. Interfaces

### 6.1 Frame-number stamp (in the video pixels)

- Location: top-left of the 1280 × 720 frame, 18 blocks of 16 × 16 px in one row (288 × 16 px). This is above the horizon row and aligned to H.264 macroblocks.
- Blocks, left to right: white reference, black reference, then 16 data bits, most significant first.
- Luma: 235 for white or 1, 16 for black or 0.
- Value: frame counter modulo 65536 (wraps every 36 minutes at 30 fps).
- Written in a picamera2 `pre_callback` on the main stream before encoding.
- Decoded in the browser by copying the 288 × 16 px region to a small canvas, averaging the centre 4 × 4 px of each block, and thresholding at the midpoint of the two reference blocks.
- If a stamp is unreadable, use the previous number plus one.

### 6.2 Pose message (Pi to browser, WebSocket text frames, one per camera frame)

```json
{"f": 12345, "x": 0.412, "z": -1.208, "yaw": 0.3142, "pitch": 0.0021, "roll": -0.0010, "q": 2}
```

| Field | Meaning |
|---|---|
| `f` | Frame number, same value as stamped into that frame |
| `x`, `z` | Position of the floor point below the lens, world frame, metres |
| `yaw`, `pitch`, `roll` | Rover orientation at mid-exposure of that frame, radians |
| `q` | Tracking quality: 2 tracked, 1 predicted (too few floor points), 0 lost for more than 0.3 s |

The pose reaches the browser before its video frame does, because video is delayed by encoding and buffering. The browser keeps the last 120 poses keyed by `f`.

### 6.3 Commands (browser to Pi, same WebSocket)

```json
{"cmd": "reset"}
{"cmd": "correct", "dx": 0.012, "dz": -0.004, "dyaw": 0.002}
```

`reset` zeroes the pose and re-runs gyro bias calibration (rover must be still). `correct` applies a drift correction computed from landmarks (Phase 7).

## 7. Repository layout

```
pi/
  rover_ar.py          entry point (asyncio); starts camera, IMU, VO, pose server
  camera.py            picamera2 setup, encoder, frame stamp, lores queue
  imu.py               MPU-6050 driver, bias calibration, orientation filter
  vo.py                floor visual odometry
  pose_server.py       WebSocket server
  config.yaml          every constant in section 3 plus tuning values
  mediamtx.yml
  Caddyfile
  rover-ar.service     systemd unit
tools/
  calibrate_camera.py  checkerboard calibration at the stream settings
  measure_tilt.py      tilt from a floor mark at a known distance
  record_clip.py       saves lores frames + IMU log for offline tests
  vo_replay.py         runs vo.py on a recorded clip and reports statistics
  make_marker_stl.py   marker IDs + size -> printable STL tiles
web/
  index.html
  config.js            intrinsics, mount geometry, marker and item tables
  main.js              per-frame loop
  whep.js              WebRTC receive client
  framestamp.js        frame-number decoder
  pose.js              WebSocket client and pose buffer
  scene.js             Three.js renderer, camera intrinsics, lights
  markers.worker.js    ArUco detection and solvePnP
  items.js             world-coordinate item store, smoothing, models
  depth.worker.js      depth model inference
  occlusion.js         floor fit, masks, depth texture, depth-write pass
  vendor/              three, opencv.js, onnxruntime-web, depth model (no CDN: must work offline)
  assets/              .glb models, shadow texture
```

## 8. Phases

Each phase ends with acceptance tests. Do not start a phase until the one it depends on passes. Sizes are relative effort: S, M, L.

### Phase 0: hardware checks and measurements (S)

Goal: remove the unknowns that every later number depends on, and decide early whether floor tracking is viable.

Tasks:

- [ ] Install Raspberry Pi OS 64-bit. Install `python3-picamera2 python3-opencv python3-smbus2 python3-websockets ffmpeg caddy` and the MediaMTX arm64 release.
- [ ] Run `rpicam-hello --list-cameras`. Record the sensor name and every sensor mode (resolution, crop, max fps).
- [ ] Try a 4:3 mode and compare the picture height with the 16:9 mode. If 4:3 shows more floor and sky, decide whether to switch the stream to it. This decision changes the resolution everywhere, so make it now.
- [ ] Fix the camera configuration in `camera.py` (sensor mode, resolution, frame rate). From here on it must not change.
- [ ] Recalibrate with `calibrate_camera.py` using frames captured through that exact configuration: at least 20 checkerboard views, board tilted and reaching the image corners. Record fx, fy, cx, cy, the distortion coefficients and the reprojection error.
- [ ] Mount the camera. Measure lens height. Set the tilt using a floor mark 0.72 m ahead, then measure the real tilt with `measure_tilt.py` (section 9.1) using marks at 0.5 m, 1 m and 2 m; the three results should agree within 0.2°.
- [ ] Wire the MPU-6050: VCC to 3.3 V (pin 1), GND (pin 6), SDA to GPIO 2 (pin 3), SCL to GPIO 3 (pin 5). Enable I2C at 400 kHz (`dtparam=i2c_arm=on,i2c_arm_baudrate=400000`). Confirm address `0x68` with `i2cdetect -y 1`. Mount it rigidly, axes square to the rover.
- [ ] Record test clips with `record_clip.py` in the real hall: push the rover 2.00 m along a court line, then a 90° turn, at exposure times of 2 ms, 4 ms and 10 ms.
- [ ] Run `vo_replay.py` on each clip (a first version of `vo.py` is needed for this; see Phase 4).

Acceptance:

- Reprojection error ≤ 0.5 px.
- Tilt known to ±0.2°, height to ±1 mm.
- **Tracking viability gate:** in the best clip, at least 60 floor points pass the forward-backward check in at least 90% of frames. If this fails, stop and choose a fallback from section 10 before building Phase 4.
- Exposure time chosen. If the hall lights flicker at twice mains frequency, short exposures show brightness banding; in that case compare 10 ms (no banding, more blur) against 4 ms with contrast normalisation and keep whichever tracks more points.

### Phase 1: video pipeline and hosting (M)

Depends on: Phase 0 camera configuration.

Tasks:

- [ ] `camera.py`: picamera2 video configuration with `main` 1280 × 720 YUV420 and `lores` 640 × 360 YUV420; fixed frame duration 33 333 µs; auto-exposure off; exposure and gain from `config.yaml`.
- [ ] Encoder: `H264Encoder(bitrate=3_000_000, repeat=True, iperiod=30)` (Pi 4 hardware encoder), output `FfmpegOutput("-f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam")`.
- [ ] `pre_callback`: increment the frame counter, write the stamp (section 6.1) into the main stream's luma plane, copy the lores luma plane and `SensorTimestamp` into a length-2 queue for `vo.py` (drop the oldest if full).
- [ ] `mediamtx.yml`: RTSP on `127.0.0.1:8554`; WebRTC HTTP on `127.0.0.1:8889`; WebRTC UDP on `:8189`; RTMP, HLS and SRT off; path `cam` with `source: publisher`. Check key names against the default file shipped with the release.
- [ ] `Caddyfile`: site address is the Pi's hostname and IP; `tls internal`; `/cam/*` to `127.0.0.1:8889`; `/ws` to `127.0.0.1:8765`; everything else from `web/`.
- [ ] `whep.js`: `RTCPeerConnection` with one receive-only video transceiver; POST the SDP offer to `/cam/whep` with `Content-Type: application/sdp`; apply the answer; set the receiver's `jitterBufferTarget` to 0.
- [ ] `framestamp.js` and a debug readout of the decoded frame number.
- [ ] systemd units so MediaMTX, `rover_ar.py` and Caddy start at boot, in that order.
- [ ] Decide the network setup: Pi joins an existing Wi-Fi network, or runs its own hotspot (fixed address, works anywhere).

Acceptance:

- Page loads at `https://<pi>/` on a laptop and a phone and shows live video.
- `window.isSecureContext` is true and `navigator.gpu` exists in a WebGPU-capable browser. If not after clicking through the certificate warning, install Caddy's root certificate on the device.
- Glass-to-glass latency ≤ 200 ms (point the camera at a running stopwatch next to the viewer screen, photograph both).
- 30 fps held for 10 minutes; frame numbers decode correctly on ≥ 99.9% of frames and never go backwards.
- If any browser shows black video, set the encoder profile to `baseline` and retest.

### Phase 2: static overlay (S)

Depends on: Phase 1, calibrated intrinsics, measured height and tilt.

Tasks:

- [ ] `scene.js`: transparent `WebGLRenderer` on the overlay canvas at 1280 × 720, pixel ratio 1; projection matrix from fx, fy, cx, cy (section 9.3), near 0.05 m, far 50 m.
- [ ] Scene graph: `rig` at (x, CAM_HEIGHT, z) with rotation (pitch, yaw, roll) in order `'YXZ'`; `camera` as its child with `rotation.x = -CAM_TILT`.
- [ ] Debug floor grid: lines every 0.25 m on y = 0, and cross-lines at 0.5, 1, 2 and 3 m.
- [ ] Render once per video frame from `requestVideoFrameCallback`.
- [ ] A black bar in the page layout covering the stamp area.
- [ ] If distortion moves any image corner by more than 2 px, undistort point coordinates (marker corners, tracked floor points) rather than whole frames, and note the residual overlay error near the edges.

Acceptance (rover stationary on the hall floor, tape marks at 0.5, 1, 2 and 3 m):

- Each virtual cross-line lies within 5 px of its tape mark.
- A virtual line drawn along a court line stays on it across the whole image width within 5 px.

### Phase 3: IMU orientation, pose channel, frame-exact sync (M)

Depends on: Phase 2.

Tasks:

- [ ] `imu.py` driver. Registers: `PWR_MGMT_1 (0x6B) = 0x01`, `SMPLRT_DIV (0x19) = 4` (200 Hz), `CONFIG (0x1A) = 0x03` (≈ 44 Hz low-pass), `GYRO_CONFIG (0x1B) = 0x08` (±500 °/s, 65.5 LSB per °/s), `ACCEL_CONFIG (0x1C) = 0x00` (±2 g, 16 384 LSB per g). Burst-read 14 bytes from `0x3B` in a dedicated thread; timestamp each sample.
- [ ] Axis mapping matrix from IMU axes to rover axes (x right, y up, z backward), in `config.yaml`.
- [ ] Gyro bias: average 3 s at startup with the rover still (600 samples); refuse and retry if the standard deviation exceeds 0.2 °/s. While running, when floor tracking reports speed < 5 mm/s and the gyro reads < 0.5 °/s for 1 s, blend the bias toward the current mean (2% per update).
- [ ] Orientation: quaternion Mahony filter, Kp = 1.0, Ki = 0. Apply the accelerometer correction only when the measured acceleration magnitude is within 0.05 g of 1 g, so driving acceleration is not mistaken for tilt. Heading comes from the gyro only.
- [ ] Orientation at frame time: interpolate to `SensorTimestamp + exposure/2 + IMU_CAM_OFFSET`, with `IMU_CAM_OFFSET` in `config.yaml` (start at 12 ms to approximate half the sensor readout; tune in the test below).
- [ ] `pose_server.py`: broadcast one message per frame (section 6.2), x and z fixed at 0 for now; handle `reset`.
- [ ] `pose.js`: buffer by frame number; in the frame loop read the stamp, look up the pose, set the rig, render. If the pose for that frame is missing, reuse the latest one and count it.

Acceptance:

- Rover still for 5 minutes: heading drift ≤ 2° per minute; pitch and roll stay within ±0.2°.
- Rotate the rover one full turn on the spot back to a floor reference: reported yaw is 360° ± 3°.
- Lift the front by about 1 cm and hold: the floor grid stays on the tape marks within 10 px.
- Rotate on the spot at about 60°/s: the floor grid stays within 30 px of the real floor marks throughout (the remaining error is rolling-shutter skew). Tune `IMU_CAM_OFFSET` to minimise it.
- Missing-pose count is zero over 5 minutes.

### Phase 4: floor visual odometry (L)

Depends on: Phase 3; Phase 0 viability gate passed. A first offline version is written during Phase 0 for the gate.

Method, per lores frame (640 × 360; intrinsics are the calibrated values divided by 2):

1. Region of interest: rows 190 to 359, which is floor from 0.31 m to about 0.67 m ahead.
2. Preprocess: contrast-limited histogram equalisation (clip 2.0, 8 × 8 tiles); mask saturated pixels (luma > 240, dilated by 5 px) to drop reflections.
3. Detect: `goodFeaturesToTrack`, up to 200 corners, quality 0.01, minimum distance 7 px. Re-detect when fewer than 80 tracks remain.
4. Track: pyramidal Lucas-Kanade, window 21 × 21, 3 pyramid levels, with the initial guess predicted from the gyro rotation and the last velocity. Keep a track only if tracking it backwards returns within 1 px.
5. Project both ends of every track onto the floor (section 9.2), each with its own frame's pitch and roll.
6. Solve translation with rotation fixed by the gyro: for each track, t = p_prev − R(Δyaw) · p_cur. Take the per-axis median, discard tracks further than 3 median absolute deviations from it, and take the median again.
7. Update the world position: Δx = t_right · cos yaw − t_forward · sin yaw, Δz = −t_right · sin yaw − t_forward · cos yaw.
8. Quality: `q = 2` with ≥ 15 surviving tracks; otherwise predict with the last velocity and send `q = 1`; after 0.3 s without tracking send `q = 0` and hold position.

Tasks:

- [ ] `vo.py` implementing the steps above, running in its own thread fed by the lores queue.
- [ ] `vo_replay.py` reporting per clip: surviving tracks per frame, processing time per frame, total distance and end position.
- [ ] Debug view in the browser: the rover's path drawn on the floor.
- [ ] As a cross-check only, estimate rotation from the tracks (`estimateAffinePartial2D`) and log its difference from the gyro.

Acceptance (in the hall):

- 2.00 m straight push along a court line: distance within 3% (6 cm), sideways error ≤ 5 cm.
- 1 m square driven back to the start: closing error ≤ 10 cm and ≤ 5°.
- Median surviving tracks ≥ 40 per frame; `q = 2` on ≥ 95% of frames at up to 0.3 m/s.
- Processing ≤ 20 ms per frame on the Pi 4 with video encoding running, so 30 fps holds.
- A virtual object placed on a tape cross stays within 3 cm of it while the rover drives a 1 m arc around it.

### Phase 5: markers and item replacement (M)

Depends on: Phase 3 for rotation; Phase 4 for objects that stay fixed while driving.

Marker specification:

- Dictionary `DICT_4X4_50`. Marker side 80 mm including the black border, so each cell is 13.33 mm. Light margin 10 mm on every side, giving a 100 × 100 mm tile.
- Tile: 1.6 mm base in light filament, black cells raised 0.6 mm, tops coloured with a permanent marker, printed face up. Matte surface.
- One marker centred on each of the four side faces. Item `i` (0 to 11) uses IDs `4i`, `4i+1`, `4i+2`, `4i+3` for faces at 0°, 90°, 180° and 270° going counter-clockwise seen from above.

Tasks:

- [ ] `make_marker_stl.py` (run on a PC with OpenCV ≥ 4.7): for each ID, take the 6 × 6 cell pattern from `cv2.aruco.generateImageMarker` and write the tile STL.
- [ ] Print, colour and mount the markers; check each with a detection script before going further.
- [ ] `markers.worker.js`: receive an `ImageBitmap` of the frame and its frame number; grey-scale; detect markers; for each, `solvePnP` with `SOLVEPNP_IPPE_SQUARE` and object points (−L/2, L/2, 0), (L/2, L/2, 0), (L/2, −L/2, 0), (−L/2, −L/2, 0), L = 0.080 m; return ID, rotation and translation with the frame number. Confirm the OpenCV.js build exposes the ArUco detector; if not, use js-aruco2 with the `DICT_4X4_50` codes added.
- [ ] `items.js`: convert each detection to world coordinates using the pose of the frame it came from, not the current frame (section 9.4). Reject it if the marker's up axis is more than 15° from world up (wrong solution of the planar ambiguity). Item centre is 0.05 m behind the marker face; set the item's y to 0; yaw from the marker normal plus the face offset.
- [ ] Smoothing: move the stored position 30% toward each new measurement within 2 m, 10% beyond. Ignore a jump of more than 0.3 m unless it persists for 5 detections (the item was moved).
- [ ] Models: one `.glb` per item type in `config.js`, origin at the centre of the base, ≤ 0.12 m tall, ≥ 0.16 m across at every height up to 0.105 m, ≤ 5 000 triangles. Hemisphere light plus one directional light from above. Soft round shadow texture of radius 0.11 m at y = 0.001.
- [ ] Phone tier: detect on every second frame.

Acceptance:

- Markers detected out to ≥ 3 m.
- Rover and item still, item at 1 m: position spread ≤ 1 cm (standard deviation over 100 frames).
- The virtual object hides the real cube completely from 0.4 m to 3 m and from every side.
- With the marker briefly covered, the virtual object stays in place.

### Phase 6: occlusion (L)

Depends on: Phase 2; best evaluated after Phase 5.

Tasks:

- [ ] `depth.worker.js`: onnxruntime-web with the WebGPU provider and Depth Anything V2 Small (fp16 ONNX, vendored). Input is the video frame resized to a multiple of 14 px per side and normalised with ImageNet mean and standard deviation; output is relative inverse depth (larger means closer). Confirm input and output names from the loaded session.
- [ ] Quality tiers, chosen automatically from the mean time of the first 10 runs:

  | Tier | Input size | Target rate | Selected when |
  |---|---|---|---|
  | A | 518 × 294 | ≥ 10 Hz | ≤ 150 ms per run at this size |
  | B | 322 × 182 | ≥ 3 Hz | Tier A too slow |
  | C | Off | – | No WebGPU, or > 400 ms per run at tier B |

  Show the active tier in the debug readout.
- [ ] Floor fit (`occlusion.js`): sample about 600 pixels below the horizon. For each, the true depth along the optical axis is known from the pose (section 9.5). Fit `1/z = a · d + b` to model output `d` by RANSAC (200 iterations, 5% relative inlier tolerance). Require ≥ 40% inliers, otherwise keep the previous `a`, `b`. Blend new values 50/50 with the previous ones.
- [ ] Metric depth for every pixel: `z = 1 / max(a · d + b, 0.02)`.
- [ ] Floor mask: where `z > 0.92 · z_floor`, write the far distance, so the floor never occludes objects standing on it.
- [ ] Item mask: for each tracked item, write the far distance inside its projected bounding box enlarged by 10%, so the real cube cannot punch through its replacement.
- [ ] Upload as a single-channel float `DataTexture` (nearest filtering).
- [ ] Depth-write pass: a full-screen quad with `colorWrite: false`, `renderOrder: -1`, whose fragment shader sets `gl_FragDepth = ((far + near − 2·near·far / z) / (far − near)) · 0.5 + 0.5`.
- [ ] Debug view: depth map as a false-colour overlay, with floor-fit inliers marked.

Acceptance:

- A leg or a box placed in front of a virtual object hides the correct part of it.
- Bare floor does not clip the base of any object in ≥ 95% of frames.
- Tier A reached on the target laptop, tier B or C selected cleanly on the target phone, with no stalls in video or overlay.
- Known limitation to record, not fix, in this phase: the depth map is from an earlier frame than the one displayed, so occlusion edges lag while the rover moves.

### Phase 7: drift correction (M, optional)

Depends on: Phases 4 and 5. Only useful if the real items stay in place during a run.

Tasks:

- [ ] Mark each item as a landmark once its stored position has been stable for 2 s.
- [ ] When a landmark is re-observed, the difference between its measured and stored position is the rover's accumulated error. Estimate a position and yaw correction from all landmarks in view and send `{"cmd": "correct", ...}` with 5% of it per frame, so the picture never jumps.
- [ ] Optional second source: detect court lines in the floor projection and correct yaw toward the nearest multiple of 90° relative to the lines.

Acceptance:

- After 5 minutes of driving, a re-observed item is within 5 cm of its virtual replacement before correction converges, and within 2 cm after.

### Phase 8: polish (S)

- [ ] Viewer controls: reset pose, toggle debug views, quality tier override.
- [ ] Status readout: frame rate, latency estimate, tracking quality `q`, depth tier.
- [ ] Reconnect logic for WebRTC and WebSocket after a Wi-Fi drop.
- [ ] Soft edges on occlusion boundaries if the hard edge is distracting.

## 9. Reference formulas

Symbols: h = camera height, θ = tilt below horizontal (mount tilt minus rover pitch), (u, v) = pixel, d = ground distance from the point below the lens.

### 9.1 Floor distance and image row

- Row of a floor point straight ahead: `v = cy + fy · tan(atan(h / d) − θ)`
- Tilt from a floor mark at known distance: `θ = atan(h / d) − atan((v − cy) / fy)`
- Horizon row: `v = cy − fy · tan θ`
- Nearest visible floor: `d = h / tan(θ + 12.2°)`

### 9.2 Pixel to floor point

1. Ray in the OpenCV camera frame: `r = ((u − cx) / fx, (v − cy) / fy, 1)`.
2. Rotate into the rover's level frame (right, down, forward) with the full orientation: mount tilt, pitch and roll. With zero roll: `r' = (r.x, cos θ · r.y + sin θ · r.z, −sin θ · r.y + cos θ · r.z)`.
3. Scale `s = h / r'.down` (valid only when `r'.down > 0`, that is, below the horizon).
4. Floor point relative to the lens: right = `s · r'.x`, forward = `s · r'.forward`.

### 9.3 Three.js projection from intrinsics

```
2·fx/w    0         1 − 2·cx/w          0
0         2·fy/h    2·cy/h − 1          0
0         0         −(f + n)/(f − n)    −2·f·n/(f − n)
0         0         −1                  0
```

Here w, h are the image size and n, f the near and far distances. Set it with `camera.projectionMatrix.set(...)`, update `projectionMatrixInverse`, and never call `updateProjectionMatrix()` afterwards.

### 9.4 Marker pose to world

`solvePnP` gives rotation R and translation t of the marker in the OpenCV camera frame. In the Three.js camera frame the marker's matrix is:

```
 R00  R01  R02   tx
−R10 −R11 −R12  −ty
−R20 −R21 −R22  −tz
 0    0    0     1
```

World matrix of the marker = (camera world matrix for the frame the detection came from) × (the matrix above).

### 9.5 Expected floor depth at a pixel

Depth along the optical axis of the floor seen at row v, with zero roll: `z_floor = h / (cos θ · (v − cy) / fy + sin θ)`, valid when the denominator is positive. At the image centre this gives 0.73 m.

### 9.6 Rover motion from floor tracks

For a floor point seen at `p_prev` and `p_cur` (right, forward) in consecutive frames, with gyro rotation Δyaw between them: `t = p_prev − R(Δyaw) · p_cur`, where `R(a) = [[cos a, −sin a], [sin a, cos a]]`. `t` is the rover's movement in the previous frame's axes.

## 10. Risks and fallbacks

| Risk | Sign | Response |
|---|---|---|
| Glossy floor defeats tracking | Phase 0 gate fails; `q` often below 2 | Tilt the camera further down; lower the exposure; then, in order: use items and extra floor markers as landmarks (Phase 7 becomes mandatory), add a downward optical-flow sensor, add wheel encoders |
| Light flicker causes banding | Stripes moving through the lores frames | Exposure of 10 ms, or keep short exposure and rely on contrast normalisation |
| Rolling-shutter skew in turns | Overlay shears during rotation | Accepted up to 60°/s; later, time-stamp each tracked point by its row |
| Pitch wobble moves distant objects | Objects beyond 2 m bob when accelerating | Keep items within about 2 m; smooth acceleration; stiffer mount |
| Heading drift | Objects slide sideways over minutes | Runtime bias updates (Phase 3), then Phase 7 |
| ffmpeg hop adds latency | Phase 1 latency above 200 ms | Lower the browser jitter buffer first; then reduce ffmpeg buffering |
| Depth model too slow on phones | Tier C selected | Accepted: phones show everything except occlusion |
| OpenCV.js build lacks ArUco | Detector class missing at load | js-aruco2 with the dictionary codes added |
| Certificate warning blocks WebGPU | `navigator.gpu` missing over HTTPS | Install Caddy's root certificate on the viewer device |
| Pi CPU saturated | Frame drops, tracking time above 20 ms | Track at 15 Hz and predict the frames in between; reduce corners to 120 |

## 11. Order of work and dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 7
   │                       │           │           ▲
   │                       │           └──► Phase 5 ┘
   │                       └──────────────► Phase 6
   └── marker printing can start at any time (spec in Phase 5)
```

Phases 5 and 6 are independent of each other and can be built in parallel by different people once Phase 3 passes. The first complete demo (objects that stay put and replace real items) is the end of Phase 5.

## 12. Open questions

1. Camera sensor name and its sensor modes (Phase 0 answers this).
2. Calibrated cx, cy, distortion coefficients and reprojection error.
3. Network at the venue: existing Wi-Fi, or should the Pi run its own hotspot?
4. Do the real items stay in place during a run? Phase 7 depends on it.
5. The rover's top speed and turn rate, to compare with the limits in section 3.3.
6. Will the same page also drive the rover? If so, drive commands can share the WebSocket.
7. How many items, and which virtual model for each?
8. Filament colour available for the marker tiles (light is needed; dark requires a white paint pen instead).
