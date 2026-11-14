# Rover AR

A local rover camera viewer built with SvelteKit, Three.js and browser workers.
Implements the browser side of [the implementation plan](implementation.md),
with a deliberately stubbed Raspberry Pi service in [`pi/`](pi/README.md).

## Run locally

```sh
npm install
npm run dev
```

Open the printed local URL. **Demo** starts automatically and needs no camera,
Pi service, downloaded model, internet connection or WebGPU. Its synthetic room,
moving foreground box, stamped video frames and poses run through the same
frame matcher, renderer and occlusion processor used by live mode. The demo is
always labelled as simulated. `/?mode=live` opens the hardware connection instead.

The **Objects**, **Floor grid** and **Depth** views, object list, local map, pose
reset, fullscreen control and quality settings work on phones and laptops.
The displayed frame rate is measured; end-to-end hardware latency is not inferred
from the browser clock.

## Connect a rover

The browser expects the exact interfaces in sections 5–6 of the plan:

- A 1280 × 720 H.264 stream at `/cam/whep`, published through MediaMTX, carrying
  the 26-block frame stamp with CRC-8.
- Pose messages at `/ws`, keyed by world epoch and frame number. The buffer holds
  120 poses. A new epoch clears objects, poses, floor fits and stamp state; worker
  results from older epochs are discarded.
- A camera mounted 0.127 m above the floor with a 10° downward tilt. Intrinsics,
  geometry, marker tables and distortion are in `src/lib/ar/config.ts`. Optical
  centre and distortion are still **provisional** and require real calibration.

For laptop development, copy `.env.example` to `.env` and set `PI_ORIGIN` to the
Pi's Caddy HTTPS origin, or set separate pose and MediaMTX origins with
`PI_ORIGIN` / `MEDIA_ORIGIN`. These are Vite proxy targets, not browser endpoints.
The browser always uses its own origin, so HTTPS and WebSocket proxying stay
consistent. Video media travels directly from MediaMTX over UDP 8189.

The Pi stub emits stationary `q: 0` poses and shared reset epochs. It does **not**
publish video or access hardware. See [`pi/README.md`](pi/README.md) to run it.
No hardware is needed to explore the frontend demo.

## Install browser assets

```sh
npm run assets
npm run build
```

Fetch assets **before** the production build, while online. The setup script uses
only Python's standard library. It downloads a versioned, SHA256-checked OpenCV.js
4.12 build with ArUco and the pinned fp16 Depth Anything V2 Small ONNX model. It
copies the matching WASM modules from the installed `onnxruntime-web` package.
Everything is then served locally; there are no runtime CDN requests.

Downloads are ignored by git: `static/vendor/`, `static/models/`, `static/ort/`.
Run setup after updating ONNX Runtime so its JavaScript and WASM versions match.
Procedural low-poly rocks and soft shadows are bundled. Set an item's `model` URL
in `src/lib/ar/config.ts` to use your own local GLB with the plan's size/origin
convention; a missing GLB keeps the bundled rock.

The marker worker uses full-resolution raw frames and `DICT_4X4_50` with 80 mm
markers. Poses are solved with distortion-aware IPPE square PnP and converted
using the capture frame's pose. Display smoothing never feeds observations sent
back to the Pi. Occlusion rescales relative inverse depth against the known floor;
its cube mask preserves real foreground nearer than the replacement item.

If assets or WebGPU are unavailable, marker/depth status explains the unavailable
feature. Video and matched overlays continue. Automatic depth quality measures ten
**full cycles** (resize, inference, readback, floor fit): tier A at ≤100 ms, tier B
at ≤330 ms, otherwise C/off. It steps down after five seconds below target and
never steps up automatically. `/bench` measures both input sizes, using either a
simulated still or a 1280 × 720 camera still.

The depth map intentionally trails the displayed frame, as described in the plan.
This can cause occlusion edges to lag during movement. Unknown video frames are
held twice, then shown with all virtual objects hidden; no frame number or pose
is guessed. Lost position (`q: 0`) dims objects independently of sync loss.

## Validate

```sh
npm run check
npm test
python3 -m unittest discover -s pi/tests -v
```

With the Pi virtual environment installed, use its Python for the two-viewer
WebSocket integration test. System Python skips that test if `websockets` is absent.

Browser checks use the existing Playwright dependency and a local server:

```sh
# Uses Playwright's installed Chromium; optionally set AR_BROWSER_PATH to a browser.
node tools/smoke_browser.mjs
# Vite development server required; checks real ArUco detection and depth inference.
node tools/check_workers.mjs
# Uses a synthetic publisher to test live WHEP, stamped video, sync loss and reset.
node tools/check_live.mjs
```

Set `AR_BASE_URL` for a different server address. The smoke check also works
against the production preview and writes screenshots under `/tmp`. The worker
check reports when no usable fp16 WebGPU adapter is available. The fp16 model
requires the adapter's `shader-f16` feature; unsupported GPUs select tier C.
Storybook is retained;
its separate test command is `npm run test:storybook`.

## Host on the Pi

`npm run build` produces a client-only static site in `build/`. Copy it to
`/home/pi/rover-ar/web/` and use the templates in `pi/` for Caddy, MediaMTX and
systemd. Set the actual user, paths, hostname and IP first. Caddy's local CA must
be trusted on viewer devices for a secure WebGPU context. No service installation
or deployment is performed by this implementation.

Hardware camera capture/encoding, IMU fusion, floor visual odometry, immutable
landmarks and drift correction remain deferred inside the Pi stub. Sensor
calibration, hall tracking/depth feasibility gates, real transport latency and
on-device performance still require the physical rover. The software tests and
demo do not mark those hardware acceptance criteria as passed.

Asset sources: [OpenCV.js build](https://github.com/TechStark/opencv-js/releases/tag/v4.12.0-release.1),
[pinned ONNX model](https://huggingface.co/onnx-community/depth-anything-v2-small/blob/709283e53fbd1183571e606f5cb37beae681336d/onnx/model_fp16.onnx),
[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/).
