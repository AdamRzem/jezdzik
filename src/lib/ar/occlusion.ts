import { Vector3 } from 'three';
import { CAMERA, DEPTH } from './config';
import { cameraWorld, floorDepth, floorPlane, rawToRectified, rectifiedToRaw } from './rectify';
import type { DepthResult, Pose, TrackedItem } from './types';

export interface FloorSample {
	d: number;
	inverseZ: number;
	u: number;
	v: number;
}
export interface FloorFit {
	a: number;
	b: number;
	ratio: number;
	inliers: FloorSample[];
}
export interface OcclusionFrame {
	e: number;
	f: number;
	width: number;
	height: number;
	data: Float32Array;
	fit: FloorFit;
}

export function fitFloor(samples: FloorSample[], random = Math.random): FloorFit | null {
	if (samples.length < 20) return null;
	let best: FloorSample[] = [];
	for (let iteration = 0; iteration < DEPTH.iterations; iteration++) {
		const p = samples[Math.floor(random() * samples.length)],
			q = samples[Math.floor(random() * samples.length)];
		if (Math.abs(p.d - q.d) < 1e-7) continue;
		const a = (p.inverseZ - q.inverseZ) / (p.d - q.d),
			b = p.inverseZ - a * p.d;
		if (a <= 0) continue;
		const inliers = samples.filter(
			(s) => Math.abs(a * s.d + b - s.inverseZ) <= DEPTH.tolerance * s.inverseZ
		);
		if (inliers.length > best.length) best = inliers;
	}
	const ratio = best.length / samples.length;
	if (ratio < DEPTH.minInliers) return null;
	const mx = best.reduce((s, p) => s + p.d, 0) / best.length;
	const my = best.reduce((s, p) => s + p.inverseZ, 0) / best.length;
	let covariance = 0,
		variance = 0;
	for (const p of best) {
		covariance += (p.d - mx) * (p.inverseZ - my);
		variance += (p.d - mx) ** 2;
	}
	if (variance < 1e-10) return null;
	const a = covariance / variance,
		b = my - a * mx;
	return a > 0 && Number.isFinite(b) ? { a, b, ratio, inliers: best } : null;
}

/** Keep genuine foreground even where the replacement cube is masked. */
export function maskDepth(z: number, zFloor: number, itemNear?: number) {
	if (z > 0.92 * zFloor) return CAMERA.far;
	if (itemNear !== undefined && z >= itemNear - Math.max(0.05, 0.1 * itemNear)) return CAMERA.far;
	return z;
}

function itemBoxes(items: TrackedItem[], pose: Pose) {
	const inverse = cameraWorld(pose).invert();
	return items
		.map((item) => {
			const center = new Vector3(item.x, 0.05, item.z).applyMatrix4(inverse);
			if (-center.z <= CAMERA.near) return null;
			const points: { u: number; v: number }[] = [];
			for (const dx of [-0.071, 0.071])
				for (const y of [0, 0.1])
					for (const dz of [-0.071, 0.071]) {
						const p = new Vector3(item.x + dx, y, item.z + dz).applyMatrix4(inverse);
						if (-p.z <= CAMERA.near) return null;
						points.push({
							u: CAMERA.cx + (CAMERA.fx * p.x) / -p.z,
							v: CAMERA.cy - (CAMERA.fy * p.y) / -p.z
						});
					}
			const minU = Math.min(...points.map((p) => p.u)),
				maxU = Math.max(...points.map((p) => p.u));
			const minV = Math.min(...points.map((p) => p.v)),
				maxV = Math.max(...points.map((p) => p.v));
			return {
				minU: minU - (maxU - minU) * 0.05,
				maxU: maxU + (maxU - minU) * 0.05,
				minV: minV - (maxV - minV) * 0.05,
				maxV: maxV + (maxV - minV) * 0.05,
				near: -center.z - 0.071
			};
		})
		.filter((box) => box !== null);
}

export class OcclusionProcessor {
	private previous: FloorFit | null = null;
	clear() {
		this.previous = null;
	}
	process(result: DepthResult, pose: Pose, items: TrackedItem[]): OcclusionFrame | null {
		if (result.e !== pose.e || result.f !== pose.f) return null;
		const { width, height, data } = result,
			plane = floorPlane(pose);
		const samples: FloorSample[] = [];
		const sampleDepth = (u: number, v: number) => {
			const x = Math.round((u / CAMERA.width) * (width - 1)),
				y = Math.round((v / CAMERA.height) * (height - 1));
			return x < 0 || x >= width || y < 0 || y >= height ? NaN : data[y * width + x];
		};
		for (let row = 0; row < 20; row++)
			for (let col = 0; col < 30; col++) {
				const u = ((col + 0.5) / 30) * CAMERA.width,
					v = 100 + ((row + 0.5) / 20) * (CAMERA.height - 100);
				const z = floorDepth(u, v, plane),
					raw = rectifiedToRaw(u, v),
					d = sampleDepth(raw.u, raw.v);
				if (z > 0 && z < 8 && Number.isFinite(d)) samples.push({ d, inverseZ: 1 / z, u, v });
			}
		const fitted = fitFloor(samples);
		if (fitted) {
			if (this.previous) {
				fitted.a = (fitted.a + this.previous.a) / 2;
				fitted.b = (fitted.b + this.previous.b) / 2;
			}
			this.previous = fitted;
		}
		if (!this.previous) return null;
		const fit = { ...this.previous, ratio: fitted?.ratio ?? 0, inliers: fitted?.inliers ?? [] };
		const metric = new Float32Array(width * height),
			boxes = itemBoxes(items, pose);
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const i = y * width + x,
					uv = rawToRectified(
						((x + 0.5) / width) * CAMERA.width,
						((y + 0.5) / height) * CAMERA.height
					);
				const z = 1 / Math.max(fit.a * data[i] + fit.b, 0.02);
				let masked = Number.isFinite(z) ? maskDepth(z, floorDepth(uv.u, uv.v, plane)) : CAMERA.far;
				for (const box of boxes)
					if (uv.u >= box.minU && uv.u <= box.maxU && uv.v >= box.minV && uv.v <= box.maxV) {
						masked = maskDepth(masked, Infinity, box.near);
					}
				metric[i] = masked;
			}
		return { e: result.e, f: result.f, width, height, data: metric, fit };
	}
}
