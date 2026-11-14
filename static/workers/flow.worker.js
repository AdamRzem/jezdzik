/* Classic worker: follows floor texture from frame to frame with OpenCV's
   pyramidal Lucas-Kanade tracker. It only reports where points moved;
   src/lib/ar/odometry.ts turns that into the rover's motion.

   Points are followed from a "keyframe". While the rover stands still the
   keyframe never changes, so the measured position cannot creep. */
let cvReady;
let config;
let canvas;
let context;
let previous = null; // grey image of the last frame
let keyPoints = new Float32Array(0); // x,y of every live track in its keyframe
let points = new Float32Array(0); // x,y of the same tracks in the last frame
let keyId = 0;
let keyCount = 0; // points the current keyframe started with

const COLUMNS = 8;
const ROWS = 4;

async function initialize(settings) {
	// perCell corners per grid cell, a window x window patch per point, pyramid levels + 1,
	// and an optional there-and-back check (twice the work).
	config = { perCell: 6, window: 15, levels: 3, backward: false, ...settings };
	importScripts('/vendor/opencv.js');
	// The pinned Emscripten module is a self-resolving thenable; do not await it.
	const cv = self.cv;
	if (!cv.Mat)
		await new Promise((resolve) => {
			cv.onRuntimeInitialized = resolve;
		});
	if (!cv.calcOpticalFlowPyrLK || !cv.goodFeaturesToTrack)
		throw new Error('OpenCV build is missing optical flow. Run npm run assets.');
	canvas = new OffscreenCanvas(config.width, config.height);
	context = canvas.getContext('2d', { willReadFrequently: true });
}

/** Strongest corners of every cell of the floor region, so one busy object cannot take them all. */
function detect(cv, gray) {
	const found = [];
	const cellWidth = Math.floor(config.width / COLUMNS),
		cellHeight = Math.floor((config.height - config.top) / ROWS);
	const none = new cv.Mat();
	for (let row = 0; row < ROWS; row++)
		for (let column = 0; column < COLUMNS; column++) {
			const x = column * cellWidth,
				y = config.top + row * cellHeight;
			const cell = gray.roi(new cv.Rect(x, y, cellWidth, cellHeight)),
				corners = new cv.Mat();
			try {
				cv.goodFeaturesToTrack(cell, corners, config.perCell, 0.02, 7, none, 5, false, 0.04);
				for (let i = 0; i < corners.rows; i++)
					found.push(corners.data32F[i * 2] + x, corners.data32F[i * 2 + 1] + y);
			} finally {
				cell.delete();
				corners.delete();
			}
		}
	none.delete();
	return new Float32Array(found);
}

/**
 * Lucas-Kanade from one image to the next; returns positions and a per-point success flag.
 * `guess` (optional) is where each point is expected, so fast turns stay within reach.
 */
function flow(cv, from, to, start, guess) {
	const count = start.length / 2;
	const a = cv.matFromArray(count, 1, cv.CV_32FC2, start),
		b = guess ? cv.matFromArray(count, 1, cv.CV_32FC2, guess) : new cv.Mat(),
		status = new cv.Mat(),
		error = new cv.Mat();
	try {
		cv.calcOpticalFlowPyrLK(
			from,
			to,
			a,
			b,
			status,
			error,
			new cv.Size(config.window, config.window),
			config.levels,
			new cv.TermCriteria(3, 20, 0.03), // 3 = stop on count or on accuracy
			guess ? 4 : 0, // 4 = OPTFLOW_USE_INITIAL_FLOW
			1e-4
		);
		return { moved: Float32Array.from(b.data32F), ok: Uint8Array.from(status.data) };
	} finally {
		a.delete();
		b.delete();
		status.delete();
		error.delete();
	}
}

/** Expected positions of the tracked points: `matrix` maps full-size pixels of the last frame to this one. */
function predict(matrix) {
	const sx = config.sourceWidth / config.width,
		sy = config.sourceHeight / config.height,
		top = config.sourceTop || 0;
	const out = new Float32Array(points.length);
	for (let i = 0; i < points.length; i += 2) {
		const u = (points[i] + 0.5) * sx - 0.5,
			v = (points[i + 1] + 0.5) * sy - 0.5 + top;
		const w = matrix[6] * u + matrix[7] * v + matrix[8];
		const x = ((matrix[0] * u + matrix[1] * v + matrix[2]) / w + 0.5) / sx - 0.5,
			y = ((matrix[3] * u + matrix[4] * v + matrix[5]) / w - top + 0.5) / sy - 0.5;
		// A wild prediction is worse than none: fall back to "it did not move".
		const usable =
			Number.isFinite(x) &&
			Number.isFinite(y) &&
			Math.hypot(x - points[i], y - points[i + 1]) < 120;
		out[i] = usable ? x : points[i];
		out[i + 1] = usable ? y : points[i + 1];
	}
	return out;
}

function track(cv, gray, guess) {
	const count = points.length / 2;
	if (!previous || !count) return;
	const forward = flow(cv, previous, gray, points, guess ? predict(guess) : null);
	// Optionally follow every point back again; one that does not return home is unreliable.
	const backward = config.backward ? flow(cv, gray, previous, forward.moved) : null;
	const keptKey = [],
		kept = [];
	for (let i = 0; i < count; i++) {
		const x = forward.moved[i * 2],
			y = forward.moved[i * 2 + 1];
		if (!forward.ok[i]) continue;
		if (x < 4 || y < 4 || x > config.width - 5 || y > config.height - 5) continue;
		if (
			backward &&
			(!backward.ok[i] ||
				Math.hypot(
					backward.moved[i * 2] - points[i * 2],
					backward.moved[i * 2 + 1] - points[i * 2 + 1]
				) > 1)
		)
			continue;
		keptKey.push(keyPoints[i * 2], keyPoints[i * 2 + 1]);
		kept.push(x, y);
	}
	keyPoints = new Float32Array(keptKey);
	points = new Float32Array(kept);
}

// Worker pixels are a scaled copy of the lower part of the camera image
// (from row sourceTop down); report full-size camera pixels.
function fullSize(values) {
	const scaleX = config.sourceWidth / config.width,
		scaleY = config.sourceHeight / config.height;
	const out = new Float32Array(values.length);
	for (let i = 0; i < values.length; i += 2) {
		out[i] = (values[i] + 0.5) * scaleX - 0.5;
		out[i + 1] = (values[i + 1] + 0.5) * scaleY - 0.5 + (config.sourceTop || 0);
	}
	return out;
}

self.onmessage = async ({ data }) => {
	if (data.type === 'init') {
		cvReady = initialize(data.config);
		try {
			await cvReady;
			self.postMessage({ type: 'ready' });
		} catch (error) {
			self.postMessage({ type: 'error', message: String(error) });
		}
		return;
	}
	if (data.type !== 'frame') return;
	const bitmap = data.bitmap;
	let gray = null;
	try {
		await cvReady;
		const cv = self.cv;
		const started = performance.now();
		context.drawImage(bitmap, 0, 0, config.width, config.height);
		const source = cv.matFromImageData(context.getImageData(0, 0, config.width, config.height));
		gray = new cv.Mat();
		cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
		source.delete();
		if (data.restart) {
			keyPoints = points = new Float32Array(0);
			previous?.delete();
			previous = null;
		}
		const imaged = performance.now();
		track(cv, gray, data.guess);
		const reply = {
			type: 'tracks',
			id: data.id,
			key: keyId,
			from: fullSize(keyPoints),
			to: fullSize(points),
			imageMs: imaged - started,
			trackMs: performance.now() - imaged
		};
		// Start again from this frame when asked to, or when too few points are left.
		if (data.rekey || data.restart || points.length / 2 < Math.max(12, 0.4 * keyCount)) {
			keyPoints = detect(cv, gray);
			points = keyPoints.slice();
			keyCount = points.length / 2;
			keyId++;
			reply.rekeyed = keyId;
			reply.detected = points.length / 2;
		}
		previous?.delete();
		previous = gray;
		gray = null;
		self.postMessage(reply, [reply.from.buffer, reply.to.buffer]);
	} catch (error) {
		self.postMessage({ type: 'error', id: data.id, message: String(error) });
	} finally {
		gray?.delete();
		bitmap.close();
	}
};
