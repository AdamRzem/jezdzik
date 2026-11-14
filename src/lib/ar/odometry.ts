// Floor odometry: where the rover is, measured from the video itself.
//
// The camera's height and tilt are known, so every pixel below the horizon maps to
// one spot on the floor. static/workers/flow.worker.js follows floor texture from
// frame to frame; here those tracks become the rover's motion across the floor
// (x, z and heading). Because the position comes from the very frame that is drawn,
// the overlay cannot lag behind the video.
//
// Local floor coordinates match the world at heading 0: x to the right, z backwards
// (forward is -z), in metres, with the camera above the origin.

import { CAMERA, FLOW } from './config';
import { rawToRectified, rectifiedToRaw } from './rectify';

export interface Planar {
	x: number;
	z: number;
	yaw: number;
}
export interface Motion extends Planar {
	inliers: number;
	total: number;
}

const sinTilt = Math.sin(CAMERA.tilt),
	cosTilt = Math.cos(CAMERA.tilt);

/** The floor point seen at a camera pixel, or null at or above the horizon. */
export function pixelToFloor(u: number, v: number) {
	const p = rawToRectified(u, v);
	const x = (p.u - CAMERA.cx) / CAMERA.fx,
		y = (p.v - CAMERA.cy) / CAMERA.fy;
	const down = sinTilt + y * cosTilt;
	if (down <= 1e-6) return null;
	const depth = CAMERA.heightM / down;
	return { x: x * depth, z: -(cosTilt - y * sinTilt) * depth };
}
/** The camera pixel showing a floor point, or null if it is not in front of the camera. */
export function floorToPixel(x: number, z: number) {
	const forward = -z,
		along = forward * cosTilt + CAMERA.heightM * sinTilt;
	if (along <= 1e-6) return null;
	const y = (CAMERA.heightM * cosTilt - forward * sinTilt) / along,
		depth = CAMERA.heightM / (sinTilt + y * cosTilt);
	return rectifiedToRaw(CAMERA.cx + (CAMERA.fx * x) / depth, CAMERA.cy + CAMERA.fy * y);
}

/** Turn a floor vector by a heading (positive heading turns left, as in Pose.yaw). */
function turn(x: number, z: number, yaw: number) {
	const c = Math.cos(yaw),
		s = Math.sin(yaw);
	return { x: x * c + z * s, z: -x * s + z * c };
}
/** A step measured in the frame of `base`, expressed in the frame `base` lives in. */
export function compose(base: Planar, step: Planar): Planar {
	const moved = turn(step.x, step.z, base.yaw);
	return { x: base.x + moved.x, z: base.z + moved.z, yaw: base.yaw + step.yaw };
}

/** The inverse of compose: `pose` as seen from `base`. */
export function relative(base: Planar, pose: Planar): Planar {
	const moved = turn(pose.x - base.x, pose.z - base.z, -base.yaw);
	return { x: moved.x, z: moved.z, yaw: pose.yaw - base.yaw };
}

type Matrix3 = number[]; // row-major
function multiply(a: Matrix3, b: Matrix3): Matrix3 {
	const out: number[] = [];
	for (let row = 0; row < 3; row++)
		for (let column = 0; column < 3; column++)
			out.push(
				a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]
			);
	return out;
}
function invert(m: Matrix3): Matrix3 {
	const [a, b, c, d, e, f, g, h, i] = m;
	const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
	return [
		e * i - f * h,
		c * h - b * i,
		b * f - c * e,
		f * g - d * i,
		a * i - c * g,
		c * d - a * f,
		d * h - e * g,
		b * g - a * h,
		a * e - b * d
	].map((value) => value / det);
}
/**
 * Where the floor moves in the picture when the rover makes `step`: a 3x3 matrix
 * (row-major, on [u, v, 1]) from pixels of the previous frame to pixels of this one.
 * Lens distortion is ignored; it only seeds the tracker's search.
 */
export function floorHomography(step: Planar): Matrix3 {
	const { fx, fy, cx, cy, heightM: h } = CAMERA;
	// Floor point (x, z, 1) to homogeneous pixel.
	const depth = [0, -cosTilt, h * sinTilt];
	const project = [
		fx + cx * depth[0],
		cx * depth[1],
		cx * depth[2],
		cy * depth[0],
		fy * sinTilt + cy * depth[1],
		fy * h * cosTilt + cy * depth[2],
		...depth
	];
	// The same floor point seen from the rover after the step.
	const c = Math.cos(step.yaw),
		s = Math.sin(step.yaw);
	const move = [c, -s, -c * step.x + s * step.z, s, c, -s * step.x - c * step.z, 0, 0, 1];
	return multiply(multiply(project, move), invert(project));
}

interface Pair {
	key: { x: number; z: number }; // floor point as seen from the keyframe
	now: { x: number; z: number }; // the same floor point as seen from this frame
	u: number;
	v: number;
	weight: number;
}

/** Weighted least-squares rigid motion that maps `now` points onto `key` points. */
function fit(pairs: Pair[]): Planar | null {
	let total = 0,
		ax = 0,
		az = 0,
		bx = 0,
		bz = 0;
	for (const p of pairs) {
		total += p.weight;
		ax += p.weight * p.now.x;
		az += p.weight * p.now.z;
		bx += p.weight * p.key.x;
		bz += p.weight * p.key.z;
	}
	if (total <= 0) return null;
	ax /= total;
	az /= total;
	bx /= total;
	bz /= total;
	let dot = 0,
		cross = 0;
	for (const p of pairs) {
		const x = p.now.x - ax,
			z = p.now.z - az,
			kx = p.key.x - bx,
			kz = p.key.z - bz;
		dot += p.weight * (x * kx + z * kz);
		cross += p.weight * (x * kz - z * kx);
	}
	if (Math.hypot(dot, cross) < 1e-12) return null;
	const yaw = -Math.atan2(cross, dot),
		centre = turn(ax, az, yaw);
	return { x: bx - centre.x, z: bz - centre.z, yaw };
}

/** Pixel distance between where a keyframe point should now appear and where it was tracked. */
function miss(pair: Pair, motion: Planar) {
	const local = turn(pair.key.x - motion.x, pair.key.z - motion.z, -motion.yaw);
	const pixel = floorToPixel(local.x, local.z);
	return pixel ? Math.hypot(pixel.u - pair.u, pixel.v - pair.v) : Infinity;
}

/**
 * The rover's motion since the keyframe: its position and heading now, in the
 * keyframe's own floor frame. `from` and `to` are x,y pixel pairs of the same
 * points in the keyframe and in the current frame. Points that are not on the
 * floor, or that belong to something moving, do not fit one rigid motion and
 * are voted out.
 */
export function estimateMotion(
	from: ArrayLike<number>,
	to: ArrayLike<number>,
	random: () => number = Math.random
): Motion | null {
	const pairs: Pair[] = [];
	for (let i = 0; i + 1 < from.length; i += 2) {
		const key = pixelToFloor(from[i], from[i + 1]),
			now = pixelToFloor(to[i], to[i + 1]);
		if (!key || !now || -key.z > FLOW.maxRangeM || -now.z > FLOW.maxRangeM) continue;
		// A pixel of error is worth more metres the farther away the point is.
		const range = Math.max(0.2, -now.z);
		pairs.push({ key, now, u: to[i], v: to[i + 1], weight: 1 / range ** 2 });
	}
	if (pairs.length < FLOW.minInliers) return null;
	let best: Pair[] = [];
	for (let iteration = 0; iteration < 120; iteration++) {
		const a = pairs[Math.floor(random() * pairs.length)],
			b = pairs[Math.floor(random() * pairs.length)];
		if (Math.hypot(a.now.x - b.now.x, a.now.z - b.now.z) < 0.03) continue;
		const candidate = fit([a, b]);
		if (!candidate) continue;
		const inliers = pairs.filter((p) => miss(p, candidate) <= FLOW.tolerancePx);
		if (inliers.length > best.length) best = inliers;
	}
	let motion: Planar | null = null;
	for (let pass = 0; pass < 3 && best.length >= FLOW.minInliers; pass++) {
		motion = fit(best);
		if (!motion) return null;
		const refined = motion;
		best = pairs.filter((p) => miss(p, refined) <= FLOW.tolerancePx);
	}
	if (!motion || best.length < FLOW.minInliers || best.length < 0.25 * pairs.length) return null;
	return { ...motion, inliers: best.length, total: pairs.length };
}

export interface OdometryFix extends Planar {
	/** 2 measured on this frame, 1 briefly held, 0 lost. */
	q: 0 | 1 | 2;
}
interface TrackReply {
	type: 'tracks';
	id: number;
	key: number;
	from: Float32Array;
	to: Float32Array;
	rekeyed?: number;
	detected?: number;
}

/** Feeds frames to the tracking worker and keeps the rover's position on the floor. */
export class FloorOdometry {
	/** Shown in the viewer's diagnostics. */
	status = 'Loading OpenCV…';
	private worker: Worker | null;
	private ready = false;
	private pose: Planar = { x: 0, z: 0, yaw: 0 };
	private keys = new Map<number, { pose: Planar; count: number }>();
	// Motion per millisecond over the last tracked frames, to predict the next one.
	private velocity: Planar | null = null;
	private lastTime = 0;
	private pending: { id: number; resolve: (reply: TrackReply | null) => void } | null = null;
	private counter = 0;
	private rekey = false;
	private restart = true;
	private world = 0;
	private cropTop = 0;
	private width = 0;
	private height = 0;
	private cost = 0; // smoothed milliseconds per tracked frame
	private misses = 0;
	constructor() {
		const worker = (this.worker = new Worker('/workers/flow.worker.js'));
		const fail = (message: string) => {
			if (worker !== this.worker) return;
			this.status = `Unavailable · ${message}`;
			this.worker = null;
			this.ready = false;
			worker.terminate();
			this.pending?.resolve(null);
		};
		worker.onmessage = ({ data }) => {
			if (data.type === 'ready') {
				this.ready = true;
				this.status = 'Ready';
			} else if (data.type === 'error' && data.id === undefined) fail(data.message);
			else if (this.pending && data.id === this.pending.id)
				this.pending.resolve(data.type === 'tracks' ? data : null);
		};
		worker.onerror = () => fail('run npm run assets');
		// Only floor near enough to measure is sent to the worker: the part of the image
		// below the row where the floor is maxRangeM away, plus a margin for the tracker.
		const margin = 32,
			farthest = Math.round(floorToPixel(0, -FLOW.maxRangeM)!.v);
		this.cropTop = Math.max(0, Math.min(CAMERA.height - 64, farthest - margin));
		this.width = Math.round(CAMERA.width * FLOW.scale);
		this.height = Math.round((CAMERA.height - this.cropTop) * FLOW.scale);
		worker.postMessage({
			type: 'init',
			config: {
				width: this.width,
				height: this.height,
				sourceWidth: CAMERA.width,
				sourceHeight: CAMERA.height - this.cropTop,
				sourceTop: this.cropTop,
				top: Math.round((farthest - this.cropTop) * FLOW.scale)
			}
		});
	}
	get available() {
		return this.worker !== null;
	}
	/** Start a new world: the rover's current spot becomes the origin. */
	reset() {
		this.pose = { x: 0, z: 0, yaw: 0 };
		this.keys.clear();
		this.velocity = null;
		this.restart = true;
		this.world++;
		this.misses = 0;
	}
	/**
	 * Where the rover was when this upright, full-size camera frame was taken.
	 * `time` is the frame's time in milliseconds.
	 */
	async track(frame: ImageBitmap, time = performance.now()): Promise<OdometryFix> {
		const held = (): OdometryFix => ({ ...this.pose, q: this.misses > 15 ? 0 : 1 });
		if (!this.worker || !this.ready || this.pending) return held();
		// Expect the rover to keep moving as it just did. The guess widens the tracker's
		// reach on fast turns and carries the position through a few unreadable frames.
		const elapsed = time - this.lastTime;
		const expected =
			this.velocity && elapsed > 0 && elapsed < 250
				? {
						x: this.velocity.x * elapsed,
						z: this.velocity.z * elapsed,
						yaw: this.velocity.yaw * elapsed
					}
				: null;
		const before = this.pose;
		const worker = this.worker,
			id = ++this.counter,
			world = this.world,
			started = performance.now();
		const small = await createImageBitmap(
			frame,
			0,
			this.cropTop,
			CAMERA.width,
			CAMERA.height - this.cropTop,
			{ resizeWidth: this.width, resizeHeight: this.height, resizeQuality: 'low' }
		);
		if (worker !== this.worker || world !== this.world) {
			small.close();
			return held();
		}
		const rekey = this.rekey,
			restart = this.restart;
		this.rekey = this.restart = false;
		const reply = await new Promise<TrackReply | null>((resolve) => {
			// Never hold the video back for long if the worker stalls.
			const timer = setTimeout(() => resolve(null), 400);
			this.pending = {
				id,
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value);
				}
			};
			worker.postMessage(
				{
					type: 'frame',
					id,
					bitmap: small,
					rekey,
					restart,
					guess: expected && !restart ? floorHomography(expected) : null
				},
				[small]
			);
		});
		this.pending = null;
		// reset() arrived while this frame was being tracked: its result is from the old world.
		if (world !== this.world) return held();
		const coast = () => {
			this.misses++;
			this.rekey = true;
			if (expected && this.misses <= 5) this.pose = compose(this.pose, expected);
			else this.velocity = null;
			this.lastTime = time;
			if (this.misses > 15) this.status = 'Lost · the floor needs more visible texture';
		};
		if (!reply) {
			coast();
			return held();
		}
		const key = this.keys.get(reply.key);
		const motion = key ? estimateMotion(reply.from, reply.to) : null;
		const next = key && motion ? compose(key.pose, motion) : null;
		// A jump no rover could make between two frames is a bad measurement.
		const sane =
			next !== null &&
			Math.hypot(next.x - this.pose.x, next.z - this.pose.z) < 0.25 &&
			Math.abs(next.yaw - this.pose.yaw) < 0.5;
		if (next && motion && sane) {
			this.pose = next;
			this.misses = 0;
			if (elapsed > 0 && elapsed < 250) {
				const step = relative(before, next);
				const now = { x: step.x / elapsed, z: step.z / elapsed, yaw: step.yaw / elapsed };
				this.velocity = this.velocity
					? {
							x: (this.velocity.x + now.x) / 2,
							z: (this.velocity.z + now.z) / 2,
							yaw: (this.velocity.yaw + now.yaw) / 2
						}
					: now;
			} else this.velocity = null;
			this.lastTime = time;
			this.cost += (performance.now() - started - this.cost) * 0.1;
			this.status = `Tracking · ${motion.inliers} floor points · ${this.cost.toFixed(0)} ms`;
			// Take a new keyframe before the tracked patch of floor leaves the view.
			if (
				motion.inliers < 0.5 * key!.count ||
				Math.hypot(motion.x, motion.z) > 0.08 ||
				Math.abs(motion.yaw) > 0.1
			)
				this.rekey = true;
		} else if (reply.rekeyed === undefined || reply.from.length) coast();
		else this.lastTime = time;
		if (reply.rekeyed !== undefined) {
			this.keys.set(reply.rekeyed, { pose: { ...this.pose }, count: reply.detected ?? 0 });
			for (const old of this.keys.keys()) if (old < reply.rekeyed - 1) this.keys.delete(old);
			if (!reply.detected) this.status = 'Lost · the floor needs more visible texture';
		}
		return { ...this.pose, q: this.misses === 0 ? 2 : this.misses > 15 ? 0 : 1 };
	}
	dispose() {
		this.worker?.terminate();
		this.worker = null;
		this.pending?.resolve(null);
	}
}
