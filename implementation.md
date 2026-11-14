# Rover AR view: implementation plan

Draft 2, 14 November 2026.

## Changes in draft 2

This draft answers an external review of draft 1. Every finding was valid.

| Finding | Change | Where |
|---|---|---|
| Item mask removed occlusion in front of replaced items | Mask only depth that belongs to the cube; nearer surfaces still occlude | Phase 6 |
| Exposure-time correction had the wrong sign | Frame time is `SensorTimestamp − exposure/2 + readout/2`; IMU delay is a separate constant; tested at two exposures | 5.4, Phase 3 |
| Accelerometer gate let driving acceleration through | Gravity correction only when stationary; flat-floor prior while moving | Phase 3 |
| Undistorting points left the overlay misaligned with distorted video | One rectified convention: the video is drawn through a rectification shader into the same canvas as the overlay | 5.5, Phase 2 |
| Sync fallbacks guessed frame numbers and poses | Stamp carries a CRC; unknown frames are never guessed; bounded, visible degradation | 6.1, 6.4 |
| Reset left browser state in the old world frame | World epoch in every pose message; state from other epochs is discarded | 6.2, 6.3 |
| Several viewers could apply the same correction | Browsers send observations only; the Pi is the single authority and removes duplicates | 6.3, Phase 7 |
| Landmarks followed the drift they should measure | Immutable anchors on the Pi, separate from display smoothing, with explicit invalidation | Phase 7 |
| Depth tier timings could not reach their target rates | Thresholds are now full-cycle times of 100 ms and 330 ms | Phase 6 |
| Standalone `web/` folder ignored the SvelteKit scaffold | Frontend mapped into this repository's SvelteKit 3 project with a static build | 7 |
| No early check that occlusion is feasible | Occlusion feasibility gate added next to the tracking gate | Phase 0 |

One further change came from working through the distortion finding: the video frame and the overlay are now drawn in the same canvas from one captured frame, so they cannot be shown one display refresh apart.

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
| IMU processing | Entirely on the Pi; the browser only receives finished poses | The IMU must be fused with camera frames at capture time |
| Rotation (heading, pitch, roll) | MPU-6050 gyro and accelerometer | No drift in pitch and roll; slow drift in heading |
| Position | Visual odometry on the near floor, run on the Pi on raw frames | No encoders or other hardware available; an IMU alone drifts by metres in seconds |
| Video-to-pose sync | Frame number with a checksum, stamped into the video pixels | Exact; 1° of error is 29 px with this lens, so timing by clock is not good enough |
| Rendering | Three.js; the video frame and the overlay are drawn in one WebGL canvas | Guarantees both come from the same frame and share one lens model |
| Item recognition | ArUco markers (`DICT_4X4_100`), 3D printed, on each side face | Gives identity and accurate pose from one camera |
| Marker detection | In the browser, in a Web Worker, with OpenCV.js | Full-resolution frames, plenty of compute, no load on the Pi |
| Occlusion | Depth Anything V2 Small in the browser, rescaled against the known floor | Objects are floor-only, so the floor gives metric scale every frame |
| Landmark map and drift correction | On the Pi | One authority, so several viewers cannot disagree or double-correct |
| Frontend | SvelteKit, client-only, static build | Matches the existing repository scaffold |
| Page hosting | The Pi serves the static build over HTTPS through Caddy | Works with no internet; HTTPS is required for WebGPU |
| Viewers | Laptops and phones, with automatic quality tiers | Phones run the depth model slower or not at all |

## 3. Known parameters

### 3.1 Measured or chosen

| Parameter | Value | Status |
|---|---|---|
| Stream resolution | 1280 × 720, 30 fps | Chosen |
| Focal length fx, fy | 1653.8 px, 1662.4 px | Calibrated at 1280 × 720 |
| Optical centre cx, cy | 640, 360 | **Placeholder**, real values needed |
| Lens distortion | Unknown | **Needed** |
| Sensor readout time | Unknown | **Needed** (Phase 0) |
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
 Raspberry Pi 4                                    Viewer (browser, SvelteKit page)
 ┌───────────────────────────────────────────┐     ┌───────────────────────────────────────┐
 │ rover_ar.py                               │     │ <video> (under the canvas)            │
 │  camera.py  picamera2                     │     │    ▲ WebRTC media (UDP 8189) from     │
 │    main 1280x720 ─ stamp frame no. ──┐    │     │    │ MediaMTX                         │
 │    lores 640x360 ─► vo.py            │    │     │    │ one captured frame per callback  │
 │  imu.py  MPU-6050 @200 Hz ─► vo.py   │    │     │    ├─► stamp decode (frame no. + CRC) │
 │  vo.py   pose, landmark anchors      │    │     │    ├─► markers worker (OpenCV.js)     │
 │  pose_server.py  WebSocket :8765 ◄───┼────┼─────┼─►  ├─► depth worker (ONNX, WebGPU)     │
 │                                      ▼    │     │    ▼                                  │
 │  H.264 hw encoder ─► ffmpeg ─► RTSP :8554 │     │ one WebGL canvas (Three.js):          │
 │ MediaMTX  RTSP in, WebRTC out :8889       │     │    rectified video background         │
 │ Caddy  HTTPS :443                         │     │    occlusion depth pass               │
 │   /        static build of the web app    │     │    virtual objects                    │
 │   /cam/*   ─► MediaMTX :8889 (WHEP)       │     │ camera pose = pose[epoch, frame no.]  │
 │   /ws      ─► pose_server :8765           │     └───────────────────────────────────────┘
 └───────────────────────────────────────────┘
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
- A world frame is identified by its **epoch** (section 6.2). Coordinates from different epochs must never be mixed.

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

All Pi timestamps use `CLOCK_BOOTTIME` in nanoseconds: `SensorTimestamp` from picamera2 for frames, `time.clock_gettime_ns(time.CLOCK_BOOTTIME)` for IMU samples.

- `SensorTimestamp` marks the start of readout of the first row, which is the **end** of that row's exposure.
- Mid-exposure time of image row v: `SensorTimestamp − exposure/2 + (v / 720) · T_readout`.
- A frame's pose is computed for the centre row: `t_frame = SensorTimestamp − exposure/2 + T_readout/2`.
- IMU samples describe motion slightly before they are read: `t_sample = t_read − IMU_DELAY`, where `IMU_DELAY` covers the chip's low-pass filter delay (4.8 ms at the chosen setting) and bus latency. Start at 5.5 ms.
- `exposure`, `T_readout` and `IMU_DELAY` are three separate values in `config.yaml`. They must not be folded into one tuned offset, because that would only be right at one exposure setting.

The browser never compares clocks with the Pi; it matches by epoch and frame number only.

### 5.5 Image convention in the browser

Everything that is displayed or reasoned about in the browser uses the **rectified image**: the ideal pinhole image described by fx, fy, cx, cy with no lens distortion. The raw video frame is distorted; each consumer converts as follows.

| Consumer | Works on | Conversion |
|---|---|---|
| Displayed video | Rectified | Background shader samples the raw frame through the distortion model (section 9.7) |
| Virtual objects | Rectified | None; Three.js renders an ideal pinhole image |
| Marker detection | Raw frame | Distortion coefficients passed to `solvePnP`, so the pose is in the true camera frame |
| Depth model | Raw frame | The occlusion pass and the floor fit sample the depth map through the same distortion model |
| Frame stamp | Raw frame | None; read from the fixed block positions |
| Floor tracking (Pi) | Raw lores frame | `cv2.undistortPoints` on tracked points before floor projection |

If the calibrated distortion moves no pixel by more than 1 px anywhere in the image, set all coefficients to zero; the model then becomes the identity and nothing else changes.

## 6. Interfaces

### 6.1 Frame-number stamp (in the video pixels)

- Location: top-left of the 1280 × 720 frame, 26 blocks of 16 × 16 px in one row (416 × 16 px). This is above the horizon row and aligned to H.264 macroblocks.
- Blocks, left to right: white reference, black reference, 16 data bits (most significant first), 8 checksum bits.
- Checksum: CRC-8, polynomial `0x07`, initial value 0, over the two data bytes, high byte first.
- Luma: 235 for white or 1, 16 for black or 0.
- Value: frame counter modulo 65536 (wraps every 36 minutes at 30 fps).
- Written in a picamera2 `pre_callback` on the main stream before encoding.
- Decoded in the browser from the captured raw frame: average the centre 4 × 4 px of each block and threshold at the midpoint of the two reference blocks.

A stamp is **valid** only if all of these hold:

1. The two reference blocks differ by at least 100 luma levels.
2. The checksum matches.
3. The number advances by 1 to 90 from the last valid one (modulo 65536). A larger jump is accepted only once a second consecutive frame confirms it by advancing 1 to 3 from the first.

A frame with the same number as the last drawn frame is a repeat and is skipped. Anything else is an **unknown frame** (section 6.4). The frame number is never guessed.

### 6.2 Pose message (Pi to browser, WebSocket text frames, one per camera frame)

```json
{"e": 918273645, "f": 12345, "x": 0.412, "z": -1.208, "yaw": 0.3142, "pitch": 0.0021, "roll": -0.0010, "q": 2}
```

| Field | Meaning |
|---|---|
| `e` | World epoch: a random 31-bit integer chosen when `rover_ar.py` starts and again at every reset |
| `f` | Frame number, same value as stamped into that frame |
| `x`, `z` | Position of the floor point below the lens, world frame, metres |
| `yaw`, `pitch`, `roll` | Rover orientation at `t_frame` (section 5.4), radians |
| `q` | Tracking quality: 2 tracked, 1 predicted (too few floor points), 0 lost for more than 0.3 s |

The pose reaches the browser before its video frame does, because video is delayed by encoding and buffering. The browser keeps the last 120 poses keyed by `f`.

When `e` changes, every viewer:

- clears the pose buffer, the item store and the depth floor-fit state,
- discards any worker result that was requested under the old epoch (every worker request carries `e` and `f`),
- resets the stamp sequence check.

### 6.3 Commands (browser to Pi, same WebSocket)

```json
{"cmd": "reset"}
{"cmd": "obs", "e": 918273645, "f": 12345, "item": 3, "right": 0.12, "forward": 1.04, "yaw": 0.21}
```

- `reset`: the Pi zeroes the pose, clears its landmark anchors, re-runs gyro bias calibration (rover must be still) and picks a new epoch. All viewers learn of it through the new `e`. The page asks for confirmation, since it affects every viewer.
- `obs` (Phase 7 only): one marker observation. `right` and `forward` are the item's floor position relative to the point below the lens, in the rover's level frame at frame `f`; `yaw` is the item's heading relative to the rover's. Browsers report what they saw; they never send corrections.

### 6.4 Unknown-frame policy

A frame is unknown if its stamp is invalid or no pose with its `e` and `f` is in the buffer. For such a frame:

1. Do not draw it. The canvas keeps the last correctly matched picture.
2. After 3 unknown frames in a row (100 ms), draw video frames again but hide all virtual objects and show a "tracking lost" badge.
3. Resume normal drawing on the first frame with a valid stamp and a matching pose.
4. Count unknown frames and show the count in the status readout.

Separately, when `q` is 0 the pose is matched but the position is not trustworthy: keep drawing, dim the virtual objects and show a "position lost" badge.

No frame is ever drawn with a pose from a different frame.

## 7. Repository layout

The repository is a fresh SvelteKit 3 scaffold (Svelte 5 in runes mode, TypeScript, Tailwind 4, Vitest, Storybook), so the frontend lives inside it. Three things in this scaffold differ from older SvelteKit projects and affect the plan:

- There is no `svelte.config.js`. The adapter is set inside `sveltekit({...})` in `vite.config.ts`.
- Library code is imported through the `#lib/...` alias defined in `package.json`, not `$lib`.
- Vitest currently runs only Storybook stories; plain unit tests need their own project entry.

```
src/
  routes/
    +layout.svelte         exists; unchanged
    +layout.ts             new: export const ssr = false; export const prerender = true
    +page.svelte           exists as the welcome placeholder; becomes the AR view
                           (canvas, status readout, controls)
    bench/+page.svelte     new: depth model timing page (Phase 0 gate)
  lib/ar/                  new; imported as #lib/ar/...
    config.ts              intrinsics, distortion, mount geometry, marker and item tables
    main.ts                per-frame loop
    whep.ts                WebRTC receive client
    framestamp.ts          stamp decoder and validity checks
    framestamp.test.ts     unit tests for the decoder
    pose.ts                WebSocket client, pose buffer, epoch handling
    scene.ts               renderer, intrinsics, background pass, lights
    rectify.ts             distortion model shared by shaders and JS
    items.ts               world-coordinate item store, smoothing, models
    occlusion.ts           floor fit, masks, depth texture, depth-write pass
    workers/depth.worker.ts   module worker; imports onnxruntime-web
static/
  workers/markers.worker.js   classic worker; loads /vendor/opencv.js with importScripts
  vendor/opencv.js            not committed; fetched by tools/fetch_assets.py
  ort/                        onnxruntime-web .wasm files, copied from node_modules; not committed
  models/                     depth model (.onnx); not committed
  assets/                     .glb models, shadow texture
vite.config.ts             exists; change the adapter, add the dev proxy and a unit-test project
pi/
  rover_ar.py              entry point (asyncio); starts camera, IMU, VO, pose server
  camera.py                picamera2 setup, encoder, frame stamp, lores queue
  imu.py                   MPU-6050 driver, bias calibration, orientation filter
  vo.py                    floor visual odometry, landmark anchors, drift correction
  pose_server.py           WebSocket server
  config.yaml              every constant in section 3 plus tuning values
  mediamtx.yml
  Caddyfile
  rover-ar.service         systemd unit
tools/
  calibrate_camera.py      checkerboard calibration at the stream settings
  measure_tilt.py          tilt from a floor mark at a known distance
  record_clip.py           saves lores frames, main stills and an IMU log
  vo_replay.py             runs vo.py on a recorded clip and reports statistics
  depth_check.py           runs the depth model and floor fit on recorded stills
  make_marker_stl.py       marker IDs + size -> printable STL tiles
  fetch_assets.py          downloads opencv.js and the depth model into static/
```

Changes to existing files:

- **Adapter:** in `vite.config.ts`, replace `@sveltejs/adapter-auto` with `@sveltejs/adapter-static`, configured with `fallback: 'index.html'`.
- **Dev proxy:** in `vite.config.ts`, add `server.proxy` entries for `/cam` and `/ws` pointing at the Pi (`ws: true`, `secure: false`).
- **Unit tests:** add a second entry to `test.projects` in `vite.config.ts` that runs `src/**/*.test.ts` in Node. The existing entry only runs Storybook stories in a browser.
- **Packages:** add `three` and `onnxruntime-web` as dependencies, and `@sveltejs/adapter-static` and `@types/three` as dev dependencies. They are bundled, so the page works with no internet.
- **Large binaries:** OpenCV.js (about 10 MB) and the depth model (tens of MB) stay out of git. Add `/static/vendor/`, `/static/ort/` and `/static/models/` to `.gitignore` and fetch them with `tools/fetch_assets.py`. Prettier already skips `/static/`, and ESLint follows `.gitignore`.

Notes:

- The marker worker is a plain file in `static/` because OpenCV.js is loaded with `importScripts`, which module workers do not support.
- Production: `npm run build` writes `build/` (already in `.gitignore`); copy it to the Pi (`rsync -a build/ pi@<pi>:/home/pi/rover-ar/web/`); Caddy serves that folder.
- Development: `npm run dev` on a laptop. `localhost` counts as secure, so WebGPU works, and the proxy forwards signalling and pose data to the Pi. Video still flows directly from the Pi.
- Storybook is not used by this plan. Keep it for UI components such as the status readout, or remove it.

## 8. Phases

Each phase ends with acceptance tests. Do not start a phase until the one it depends on passes. Sizes are relative effort: S, M, L.

### Phase 0: hardware checks, measurements and feasibility gates (M)

Goal: remove the unknowns that every later number depends on, and decide early whether floor tracking and occlusion are viable in the real hall.

Tasks:

- [ ] Install Raspberry Pi OS 64-bit. Install `python3-picamera2 python3-opencv python3-smbus2 python3-websockets ffmpeg caddy` and the MediaMTX arm64 release.
- [ ] Run `rpicam-hello --list-cameras`. Record the sensor name and every sensor mode (resolution, crop, max fps).
- [ ] Try a 4:3 mode and compare the picture height with the 16:9 mode. If 4:3 shows more floor and sky, decide whether to switch the stream to it. This decision changes the resolution everywhere, so make it now.
- [ ] Fix the camera configuration in `camera.py` (sensor mode, resolution, frame rate). From here on it must not change.
- [ ] Record `T_readout` for the chosen mode. Estimate it as 0.95 divided by the mode's maximum frame rate; refine it in Phase 3.
- [ ] Recalibrate with `calibrate_camera.py` using frames captured through that exact configuration: at least 20 checkerboard views, board tilted and reaching the image corners. Record fx, fy, cx, cy, the distortion coefficients and the reprojection error. Compute the largest pixel displacement the distortion causes anywhere in the image.
- [ ] Mount the camera. Measure lens height. Set the tilt using a floor mark 0.72 m ahead, then measure the real tilt with `measure_tilt.py` (section 9.1) using marks at 0.5 m, 1 m and 2 m; the three results should agree within 0.2°.
- [ ] Wire the MPU-6050: VCC to 3.3 V (pin 1), GND (pin 6), SDA to GPIO 2 (pin 3), SCL to GPIO 3 (pin 5). Enable I2C at 400 kHz (`dtparam=i2c_arm=on,i2c_arm_baudrate=400000`). Confirm address `0x68` with `i2cdetect -y 1`. Mount it rigidly, axes square to the rover.
- [ ] Tracking clips: with `record_clip.py` in the real hall, push the rover 2.00 m along a court line, then a 90° turn, at exposure times of 2 ms, 4 ms and 10 ms. Run `vo_replay.py` on each (a first version of `vo.py` is needed; see Phase 4).
- [ ] Occlusion stills: from the mounted camera, capture 30 full-resolution stills in the hall: bare floor, and a leg, a bag and a box at tape-measured distances of 0.5, 1, 1.5 and 2 m.
- [ ] Run `depth_check.py` on the stills at both model input sizes (518 × 294 and 322 × 182): floor fit as in Phase 6, then report inlier share, obstacle depth error and the share of bare floor wrongly classed as obstacle.
- [ ] Open the `/bench` page on the target laptop and the target phone and record the full-cycle time at both input sizes.

Acceptance:

- Reprojection error ≤ 0.5 px.
- Tilt known to ±0.2°, height to ±1 mm.
- Exposure time chosen. If the hall lights flicker at twice mains frequency, short exposures show brightness banding; compare 10 ms (no banding, more blur) against 4 ms with contrast normalisation and keep whichever tracks more points.
- **Tracking gate:** in the best clip, at least 60 floor points pass the forward-backward check in at least 90% of frames. If this fails, stop and choose a fallback from section 10 before building Phase 4.
- **Occlusion gate**, all three:
  - floor-fit inliers ≥ 40% on at least 90% of stills,
  - obstacle depth within 15% of the tape measure on at least 80% of obstacle stills,
  - no more than 5% of bare-floor pixels classed as obstacle (reflections are the likely cause).

  If this fails, choose the occlusion fallback from section 10 before building Phase 6.
- Depth tier expected on each target device is known from the bench timings (thresholds in Phase 6).

### Phase 1: video pipeline and hosting (M)

Depends on: Phase 0 camera configuration.

Tasks:

- [ ] `camera.py`: picamera2 video configuration with `main` 1280 × 720 YUV420 and `lores` 640 × 360 YUV420; fixed frame duration 33 333 µs; auto-exposure off; exposure and gain from `config.yaml`.
- [ ] Encoder: `H264Encoder(bitrate=3_000_000, repeat=True, iperiod=30)` (Pi 4 hardware encoder), output `FfmpegOutput("-f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam")`.
- [ ] `pre_callback`: increment the frame counter, write the stamp (section 6.1) into the main stream's luma plane, copy the lores luma plane and `SensorTimestamp` into a length-2 queue for `vo.py` (drop the oldest if full).
- [ ] `mediamtx.yml`: RTSP on `127.0.0.1:8554`; WebRTC HTTP on `127.0.0.1:8889`; WebRTC UDP on `:8189`; RTMP, HLS and SRT off; path `cam` with `source: publisher`. Check key names against the default file shipped with the release.
- [ ] `Caddyfile`: site address is the Pi's hostname and IP; `tls internal`; `/cam/*` to `127.0.0.1:8889`; `/ws` to `127.0.0.1:8765`; everything else from the static build folder.
- [ ] SvelteKit: make the changes to existing files listed in section 7 (static adapter, `+layout.ts` with `ssr = false`, dev proxy, unit-test project, packages, `.gitignore`), and confirm the `npm run build` output loads from Caddy.
- [ ] `whep.ts`: `RTCPeerConnection` with one receive-only video transceiver; POST the SDP offer to `/cam/whep` with `Content-Type: application/sdp`; apply the answer; set the receiver's `jitterBufferTarget` to 0.
- [ ] `framestamp.ts` with the validity checks of section 6.1, `framestamp.test.ts` using synthetic stamps (correct, bit-flipped, low contrast, out of sequence), and a debug readout of the decoded number.
- [ ] systemd units so MediaMTX, `rover_ar.py` and Caddy start at boot, in that order.
- [ ] Decide the network setup: Pi joins an existing Wi-Fi network, or runs its own hotspot (fixed address, works anywhere).

Acceptance:

- The built page loads at `https://<pi>/` on a laptop and a phone and shows live video.
- `window.isSecureContext` is true and `navigator.gpu` exists in a WebGPU-capable browser. If not after clicking through the certificate warning, install Caddy's root certificate on the device.
- Glass-to-glass latency ≤ 200 ms (point the camera at a running stopwatch next to the viewer screen, photograph both).
- 30 fps held for 10 minutes; stamps valid on ≥ 99.9% of frames.
- Every corrupted synthetic stamp in the unit tests is rejected.
- If any browser shows black video, set the encoder profile to `baseline` and retest.

### Phase 2: single-canvas rendering and static overlay (M)

Depends on: Phase 1, calibrated intrinsics and distortion, measured height and tilt.

Tasks:

- [ ] Frame capture: in each `requestVideoFrameCallback`, capture the frame once with `new VideoFrame(video)` (fall back to `createImageBitmap(video)`). The stamp decoder, the background texture and both workers all use that one object; close it afterwards.
- [ ] Keep the `<video>` element in the page underneath the canvas. Do not use `display: none`, which can stop frame callbacks.
- [ ] `scene.ts`: opaque `WebGLRenderer` at 1280 × 720, pixel ratio 1; projection matrix from fx, fy, cx, cy (section 9.3), near 0.05 m, far 50 m.
- [ ] Background pass: a full-screen quad (`renderOrder: -2`, no depth test or write) textured with the captured frame, sampled through the distortion model in `rectify.ts` (section 9.7). The shader paints the stamp area black.
- [ ] Scene graph: `rig` at (x, CAM_HEIGHT, z) with rotation (pitch, yaw, roll) in order `'YXZ'`; `camera` as its child with `rotation.x = -CAM_TILT`.
- [ ] Background, depth pass and objects are rendered in one `renderer.render` call per frame, so they are always presented together.
- [ ] Debug floor grid: lines every 0.25 m on y = 0, and cross-lines at 0.5, 1, 2 and 3 m.

Acceptance (rover stationary on the hall floor, tape marks at 0.5, 1, 2 and 3 m):

- Each virtual cross-line lies within 5 px of its tape mark.
- A virtual line drawn along a court line stays on it within 5 px across the whole image width, including the outer 100 px on each side.
- Straight court lines look straight in the displayed video.

### Phase 3: IMU orientation, pose channel, frame-exact sync (M)

Depends on: Phase 2.

Tasks:

- [ ] `imu.py` driver. Registers: `PWR_MGMT_1 (0x6B) = 0x01`, `SMPLRT_DIV (0x19) = 4` (200 Hz), `CONFIG (0x1A) = 0x03` (≈ 44 Hz low-pass), `GYRO_CONFIG (0x1B) = 0x08` (±500 °/s, 65.5 LSB per °/s), `ACCEL_CONFIG (0x1C) = 0x00` (±2 g, 16 384 LSB per g). Burst-read 14 bytes from `0x3B` in a dedicated thread; timestamp each sample and subtract `IMU_DELAY`.
- [ ] Axis mapping matrix from IMU axes to rover axes (x right, y up, z backward), in `config.yaml`.
- [ ] Gyro bias: average 3 s at startup with the rover still (600 samples); refuse and retry if the standard deviation exceeds 0.2 °/s. While running and stationary, blend the bias toward the current mean (2% per update).
- [ ] Stationary detection: gyro magnitude below 0.5 °/s and accelerometer magnitude varying by less than 0.01 g (standard deviation) over 0.5 s. From Phase 4 on, also require floor-tracking speed below 5 mm/s.
- [ ] Orientation filter:
  - Integrate the gyro as a quaternion at every sample.
  - **Stationary:** correct pitch and roll toward the accelerometer's gravity direction (Mahony, Kp = 1.0, Ki = 0). Store the result as the rest attitude.
  - **Moving:** ignore the accelerometer. Pull pitch and roll toward the rest attitude with a 4 s time constant. On a flat floor the average attitude while driving equals the rest attitude, so only short wobbles are real; this bounds gyro drift without mistaking driving acceleration for tilt.
  - Heading comes from the gyro only.
- [ ] Orientation at frame time: interpolate to `t_frame` (section 5.4).
- [ ] `pose_server.py`: broadcast one message per frame (section 6.2) with a fresh epoch at start; x and z fixed at 0 for now; handle `reset`.
- [ ] `pose.ts`: buffer by frame number; handle epoch changes (section 6.2).
- [ ] `main.ts`: implement the unknown-frame policy (section 6.4) and the two badges.

Acceptance:

- Rover still for 5 minutes: heading drift ≤ 2° per minute; pitch and roll stay within ±0.2°.
- Rotate the rover one full turn on the spot back to a floor reference: reported yaw is 360° ± 3°.
- Lift the front by about 1 cm and hold: the floor grid stays on the tape marks within 10 px.
- Rotate on the spot at about 60°/s: the floor grid stays within 30 px of the real floor marks throughout (the remaining error is rolling-shutter skew).
- **Timing check:** repeat the rotation test at exposures of 2 ms and 10 ms, each time finding the `IMU_DELAY` that minimises the error. The two best values agree within 1 ms. If they differ by about 8 ms, the timestamp convention in section 5.4 is wrong for this sensor driver; correct it there, not in `IMU_DELAY`.
- **Acceleration check:** accelerate from rest to 0.3 m/s as hard as the rover can, then brake hard. The floor grid stays within 15 px of the tape mark at 1 m throughout. Log the tilt the raw accelerometer would imply, to confirm the filter did not follow it.
- After 5 minutes of mixed driving, stop: pitch and roll change by ≤ 0.3° when gravity correction resumes.
- **Sync failure check:** block the WebSocket for 2 s while video continues. Within 100 ms the objects disappear and the "tracking lost" badge shows; they return when poses resume; at no point is an object drawn in a wrong place.
- **Reset check:** with two viewers connected and objects placed, one viewer resets. Both clear their objects within one second and both show the same new epoch.
- Unknown-frame count ≤ 0.1% over 5 minutes on a healthy connection.

### Phase 4: floor visual odometry (L)

Depends on: Phase 3; Phase 0 tracking gate passed. A first offline version is written during Phase 0 for the gate.

Method, per lores frame (640 × 360; intrinsics are the calibrated values divided by 2):

1. Region of interest: rows 190 to 359, which is floor from 0.31 m to about 0.67 m ahead.
2. Preprocess: contrast-limited histogram equalisation (clip 2.0, 8 × 8 tiles); mask saturated pixels (luma > 240, dilated by 5 px) to drop reflections.
3. Detect: `goodFeaturesToTrack`, up to 200 corners, quality 0.01, minimum distance 7 px. Re-detect when fewer than 80 tracks remain.
4. Track: pyramidal Lucas-Kanade, window 21 × 21, 3 pyramid levels, with the initial guess predicted from the gyro rotation and the last velocity. Keep a track only if tracking it backwards returns within 1 px.
5. Undistort both ends of every track (`cv2.undistortPoints`), then project them onto the floor (section 9.2), each with its own frame's pitch and roll.
6. Solve translation with rotation fixed by the gyro: for each track, t = p_prev − R(Δyaw) · p_cur. Take the per-axis median, discard tracks further than 3 median absolute deviations from it, and take the median again.
7. Update the world position: Δx = t_right · cos yaw − t_forward · sin yaw, Δz = −t_right · sin yaw − t_forward · cos yaw.
8. Quality: `q = 2` with ≥ 15 surviving tracks; otherwise predict with the last velocity and send `q = 1`; after 0.3 s without tracking send `q = 0` and hold position.

Tasks:

- [ ] `vo.py` implementing the steps above, running in its own thread fed by the lores queue.
- [ ] Keep a 3 s history of poses keyed by frame number (used in Phase 7).
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

- Dictionary `DICT_4X4_100`. Marker side 80 mm including the black border, so each cell is 13.33 mm. Light margin 10 mm on every side, giving a 100 × 100 mm tile.
- Tile: 1.6 mm base in light filament, black cells raised 0.6 mm, tops coloured with a permanent marker, printed face up. Matte surface.
- One marker centred on each of the four side faces. Item `i` (0 to 11) uses IDs `4i`, `4i+1`, `4i+2`, `4i+3` for faces at 0°, 90°, 180° and 270° going counter-clockwise seen from above.

Tasks:

- [ ] `make_marker_stl.py` (run on a PC with OpenCV ≥ 4.7): for each ID, take the 6 × 6 cell pattern from `cv2.aruco.generateImageMarker` and write the tile STL.
- [ ] Print, colour and mount the markers; check each with a detection script before going further.
- [ ] `markers.worker.js`: receive the captured raw frame with its `e` and `f`; grey-scale; detect markers; for each, `solvePnP` with `SOLVEPNP_IPPE_SQUARE`, the calibrated distortion coefficients, and object points (−L/2, L/2, 0), (L/2, L/2, 0), (L/2, −L/2, 0), (−L/2, −L/2, 0), L = 0.080 m; return ID, rotation and translation tagged with `e` and `f`. Confirm the OpenCV.js build exposes the ArUco detector; if not, use js-aruco2 with the `DICT_4X4_100` codes added.
- [ ] `items.ts`: drop results whose `e` is not the current epoch. Convert each detection to world coordinates using the pose of frame `f`, not the current frame (section 9.4). Reject it if the marker's up axis is more than 15° from world up (wrong solution of the planar ambiguity). Item centre is 0.05 m behind the marker face; set the item's y to 0; yaw from the marker normal plus the face offset.
- [ ] Display smoothing: move the displayed position 30% toward each new measurement within 2 m, 10% beyond. Ignore a jump of more than 0.3 m unless it persists for 5 detections (the item was moved). This smoothed position is for display only and is never used as a drift reference (Phase 7).
- [ ] Models: one `.glb` per item type in `config.ts`, origin at the centre of the base, ≤ 0.12 m tall, ≥ 0.16 m across at every height up to 0.105 m, ≤ 5 000 triangles. Hemisphere light plus one directional light from above. Soft round shadow texture of radius 0.11 m at y = 0.001.
- [ ] Phone tier: detect on every second frame.

Acceptance:

- Markers detected out to ≥ 3 m.
- Rover and item still, item at 1 m: position spread ≤ 1 cm (standard deviation over 100 frames).
- The virtual object hides the real cube completely from 0.4 m to 3 m and from every side.
- With the marker briefly covered, the virtual object stays in place.
- After a reset, no object from before the reset reappears.

### Phase 6: occlusion (L)

Depends on: Phase 2; Phase 0 occlusion gate passed; best evaluated after Phase 5.

Tasks:

- [ ] `depth.worker.ts`: onnxruntime-web with the WebGPU provider and Depth Anything V2 Small (fp16 ONNX, in `static/models/`). Input is the raw captured frame resized to a multiple of 14 px per side and normalised with ImageNet mean and standard deviation; output is relative inverse depth (larger means closer). Confirm input and output names from the loaded session. Requests and results carry `e` and `f`.
- [ ] Quality tiers. The measure is the full cycle: resize, inference, readback and floor fit, with the worker running back to back.

  | Tier | Input size | Target rate | Selected when |
  |---|---|---|---|
  | A | 518 × 294 | ≥ 10 Hz | Full cycle ≤ 100 ms at this size |
  | B | 322 × 182 | ≥ 3 Hz | Tier A too slow, and full cycle ≤ 330 ms at this size |
  | C | Off | – | No WebGPU, or tier B too slow |

  Choose from the mean of the first 10 cycles. Afterwards step down if the rate stays below target for 5 s; never step up automatically. Show the active tier in the status readout.
- [ ] Floor fit (`occlusion.ts`): pick about 600 sample points below the horizon in the rectified image. For each, the true depth along the optical axis is known from that frame's pose (section 9.5); read the model output `d` at the matching raw-frame position (section 9.7). Fit `1/z = a · d + b` by RANSAC (200 iterations, 5% relative inlier tolerance). Require ≥ 40% inliers, otherwise keep the previous `a`, `b`. Blend new values 50/50 with the previous ones.
- [ ] Metric depth for every pixel: `z = 1 / max(a · d + b, 0.02)`.
- [ ] Floor mask: where `z > 0.92 · z_floor`, write the far distance, so the floor never occludes objects standing on it.
- [ ] Item mask. For each tracked item, inside its projected bounding box enlarged by 10%:
  - `z_near` = depth of the item's centre along the optical axis − 0.071 m (half the diagonal of the cube's footprint),
  - `margin` = the larger of 0.05 m and 10% of `z_near`,
  - where `z ≥ z_near − margin` the pixel belongs to the replaced cube: write the far distance,
  - where `z < z_near − margin` the pixel is real foreground: keep its depth, so it occludes the virtual object.
- [ ] Upload as a single-channel float `DataTexture` (nearest filtering).
- [ ] Depth-write pass: a full-screen quad with `colorWrite: false`, `renderOrder: -1`, which samples the depth texture through the distortion model and sets `gl_FragDepth = ((far + near − 2·near·far / z) / (far − near)) · 0.5 + 0.5`.
- [ ] Debug view: depth map as a false-colour overlay, with floor-fit inliers marked.

Acceptance:

- A leg or a box placed in front of a virtual object standing on bare floor hides the correct part of it.
- **Foreground across a replaced item:** move a leg or a box directly across the front of a replaced cube, 0.2 m or more in front of it. The foreground hides the virtual object, and the real cube never shows through.
- Bare floor does not clip the base of any object in ≥ 95% of frames.
- Each target device settles on the tier predicted in Phase 0, and its measured rate meets that tier's target, with no stalls in video or overlay.
- Known limitations to record, not fix, in this phase: the depth map is from an earlier frame than the one displayed, so occlusion edges lag while the rover moves; a foreground object closer to the cube than `margin` is not separated from it.

### Phase 7: drift correction (M, optional)

Depends on: Phases 4 and 5. Only useful if the real items stay in place during a run.

Principle: the Pi alone owns the landmark map and applies corrections. Browsers only report observations (section 6.3).

Tasks:

- [ ] Browser: for each accepted marker detection, send one `obs` message with the detection's `e` and `f`.
- [ ] Pi, intake: ignore an observation if its `e` is not current, if frame `f` is no longer in the 3 s pose history, or if an observation for the same (`e`, `f`, `item`) was already accepted. The last rule makes any number of viewers count as one.
- [ ] Pi, world position: convert each accepted observation to world coordinates with the pose stored for frame `f`.
- [ ] Pi, anchors: create an anchor for an item when at least 20 observations over 2 s, all with `q = 2`, have a position spread ≤ 1 cm. The anchor is their mean position and heading. An anchor never changes after creation.
- [ ] Pi, correction: for each observation of an anchored item, residual = anchor − observed world position. Average the residuals of all anchored items seen in the same frame and add 5% of that to the current x and z. Correct yaw at 2%, from the bearing between two anchors when two are in view, otherwise from the marker's heading and only within 2 m.
- [ ] Pi, invalidation: drop an anchor if its residual exceeds 0.15 m while the other anchors in view agree with each other within 0.05 m, or, with one anchor in view, if its residual jumps by more than 0.10 m between observations less than 1 s apart (drift is gradual; a jump means the item was moved). A dropped item may be anchored again once it meets the creation rule.
- [ ] Anchors are cleared on reset.
- [ ] Optional second source: detect court lines in the floor projection and correct yaw toward the nearest multiple of 90° relative to the lines.

Acceptance:

- After 5 minutes of driving, a re-observed item is within 5 cm of its virtual replacement before correction converges, and within 2 cm after.
- The total correction applied over one minute with two viewers connected is within 10% of that with one viewer.
- Moving an anchored item by 0.2 m by hand drops its anchor without shifting the rover's pose by more than 1 cm.

### Phase 8: polish (S)

- [ ] Viewer controls: reset pose (with confirmation), toggle debug views, quality tier override.
- [ ] Status readout: frame rate, latency estimate, tracking quality `q`, depth tier, unknown-frame count.
- [ ] Reconnect logic for WebRTC and WebSocket after a Wi-Fi drop.
- [ ] Soft edges on occlusion boundaries if the hard edge is distracting.

## 9. Reference formulas

Symbols: h = camera height, θ = tilt below horizontal (mount tilt minus rover pitch), (u, v) = pixel in the rectified image, d = ground distance from the point below the lens.

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

### 9.7 Rectified pixel to raw-frame pixel

With distortion coefficients k1, k2, p1, p2, k3 from the calibration, a rectified pixel (u, v) is found in the raw frame at (u_raw, v_raw):

```
x = (u − cx) / fx          y = (v − cy) / fy          r² = x² + y²
radial = 1 + k1·r² + k2·r⁴ + k3·r⁶
x_d = x·radial + 2·p1·x·y + p2·(r² + 2·x²)
y_d = y·radial + p1·(r² + 2·y²) + 2·p2·x·y
u_raw = fx·x_d + cx        v_raw = fy·y_d + cy
```

This direction needs no iteration, so it runs in a fragment shader. The background pass and the depth pass both use it; positions outside the raw frame are drawn black or treated as far.

## 10. Risks and fallbacks

| Risk | Sign | Response |
|---|---|---|
| Glossy floor defeats tracking | Phase 0 tracking gate fails; `q` often below 2 | Tilt the camera further down; lower the exposure; then, in order: use items and extra floor markers as landmarks (Phase 7 becomes mandatory), add a downward optical-flow sensor, add wheel encoders |
| Depth model unreliable in the hall | Phase 0 occlusion gate fails | First fallback: treat anything that is not floor as an occluder and take its distance from the floor row where it touches the ground (section 9.2) instead of from the model. Second: no occlusion |
| Light flicker causes banding | Stripes moving through the lores frames | Exposure of 10 ms, or keep short exposure and rely on contrast normalisation |
| Rolling-shutter skew in turns | Overlay shears during rotation | Accepted up to 60°/s; later, time each tracked point by its own row (section 5.4) |
| Pitch wobble moves distant objects | Objects beyond 2 m bob when accelerating | Keep items within about 2 m; smooth acceleration; stiffer mount |
| Sustained squat under long acceleration is partly removed by the flat-floor prior | Floor grid lifts slowly during a long acceleration | Lengthen the 4 s time constant; check gyro drift still stays bounded |
| Heading drift | Objects slide sideways over minutes | Runtime bias updates (Phase 3), then Phase 7 |
| ffmpeg hop adds latency | Phase 1 latency above 200 ms | Lower the browser jitter buffer first; then reduce ffmpeg buffering |
| Depth model too slow on phones | Tier C selected | Accepted: phones show everything except occlusion |
| OpenCV.js build lacks ArUco | Detector class missing at load | js-aruco2 with the dictionary codes added |
| Certificate warning blocks WebGPU | `navigator.gpu` missing over HTTPS | Install Caddy's root certificate on the viewer device |
| `VideoFrame` capture unsupported | Constructor throws | `createImageBitmap(video)` |
| Pi CPU saturated | Frame drops, tracking time above 20 ms | Track at 15 Hz and predict the frames in between; reduce corners to 120 |
| Viewers show items at slightly different places | Two screens disagree by a few centimetres | Accepted: each browser smooths its own detections. If it matters, have the Pi broadcast anchor positions for display |

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

1. Camera sensor name, its sensor modes and readout time (Phase 0 answers this).
2. Calibrated cx, cy, distortion coefficients and reprojection error.
3. Network at the venue: existing Wi-Fi, or should the Pi run its own hotspot?
4. Do the real items stay in place during a run? Phase 7 depends on it.
5. The rover's top speed and turn rate, to compare with the limits in section 3.3.
6. Will the same page also drive the rover? If so, drive commands can share the WebSocket.
7. How many items, and which virtual model for each?
8. Filament colour available for the marker tiles (light is needed; dark requires a white paint pen instead).