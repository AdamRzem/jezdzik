import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA } from './config';
import {
	compose,
	estimateMotion,
	floorHomography,
	floorToPixel,
	pixelToFloor,
	relative,
	type Planar
} from './odometry';
import { cameraWorld } from './rectify';
import type { Pose } from './types';

const at = (p: Planar): Pose => ({ e: 1, f: 1, ...p, pitch: 0, roll: 0, q: 2 });
/** Pixel of a world floor point, through the same camera matrix the renderer uses. */
function render(x: number, z: number, pose: Planar) {
	const p = new Vector3(x, 0, z).applyMatrix4(cameraWorld(at(pose)).invert());
	return { u: CAMERA.cx + (CAMERA.fx * p.x) / -p.z, v: CAMERA.cy - (CAMERA.fy * p.y) / -p.z };
}
function seeded(seed = 7) {
	return () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
}
/** Tracks of scattered floor points between two rover poses, as x,y pixel pairs. */
function tracks(key: Planar, now: Planar, random: () => number, count = 150) {
	const from: number[] = [],
		to: number[] = [];
	while (from.length < count * 2) {
		const local = { x: (random() - 0.5) * 0.6, z: -(0.38 + random() * 0.9) };
		const world = compose(key, { ...local, yaw: 0 });
		const a = render(world.x, world.z, key),
			b = render(world.x, world.z, now);
		if ([a, b].some((p) => p.u < 0 || p.u > CAMERA.width || p.v < 0 || p.v > CAMERA.height))
			continue;
		from.push(a.u, a.v);
		to.push(b.u + (random() - 0.5) * 0.4, b.v + (random() - 0.5) * 0.4);
	}
	return { from, to };
}

describe('floor odometry', () => {
	it('maps pixels to the floor exactly as the renderer draws the floor', () => {
		const pixel = render(0.12, -0.7, { x: 0, z: 0, yaw: 0 });
		const floor = pixelToFloor(pixel.u, pixel.v)!;
		expect(floor.x).toBeCloseTo(0.12, 9);
		expect(floor.z).toBeCloseTo(-0.7, 9);
		const back = floorToPixel(0.12, -0.7)!;
		expect(back.u).toBeCloseTo(pixel.u, 6);
		expect(back.v).toBeCloseTo(pixel.v, 6);
		expect(pixelToFloor(640, 20)).toBeNull(); // above the horizon
	});
	it('composes steps the way the rover drives', () => {
		// Facing left (yaw 90°), one step forward moves the rover towards -x.
		const moved = compose({ x: 1, z: -2, yaw: Math.PI / 2 }, { x: 0, z: -0.5, yaw: 0.1 });
		expect(moved.x).toBeCloseTo(0.5, 9);
		expect(moved.z).toBeCloseTo(-2, 9);
		expect(moved.yaw).toBeCloseTo(Math.PI / 2 + 0.1, 9);
		const step = relative({ x: 1, z: -2, yaw: Math.PI / 2 }, moved);
		expect(step.x).toBeCloseTo(0, 9);
		expect(step.z).toBeCloseTo(-0.5, 9);
		expect(step.yaw).toBeCloseTo(0.1, 9);
	});
	it.each([
		['driving forward', { x: 0, z: -0.06, yaw: 0 }],
		['turning left on the spot', { x: 0, z: 0, yaw: 0.07 }],
		['driving and turning right', { x: 0.01, z: -0.05, yaw: -0.05 }],
		['standing still', { x: 0, z: 0, yaw: 0 }]
	])('measures %s from tracked floor points', (_name, step) => {
		const random = seeded(),
			key = { x: 0.4, z: -1.1, yaw: 0.6 },
			now = compose(key, step);
		const { from, to } = tracks(key, now, random);
		const motion = estimateMotion(from, to, random)!;
		expect(motion.x).toBeCloseTo(step.x, 2.5);
		expect(motion.z).toBeCloseTo(step.z, 2.5);
		expect(motion.yaw).toBeCloseTo(step.yaw, 2.5);
		const world = compose(key, motion);
		expect(world.x).toBeCloseTo(now.x, 2.5);
		expect(world.z).toBeCloseTo(now.z, 2.5);
	});
	it('ignores points that are not part of the floor', () => {
		const random = seeded(11),
			key = { x: 0, z: 0, yaw: 0 },
			step = { x: 0, z: -0.05, yaw: 0.03 };
		const { from, to } = tracks(key, compose(key, step), random, 120);
		// 60 more tracks that stay still in the image, like a rock held in the gripper.
		for (let i = 0; i < 60; i++) {
			const u = 500 + random() * 280,
				v = 520 + random() * 180;
			from.push(u, v);
			to.push(u, v);
		}
		const motion = estimateMotion(from, to, random)!;
		expect(motion.z).toBeCloseTo(step.z, 2.5);
		expect(motion.yaw).toBeCloseTo(step.yaw, 2.5);
		expect(motion.inliers).toBeGreaterThan(100);
		expect(motion.inliers).toBeLessThan(140);
	});
	it('predicts where floor points move in the picture for a given step', () => {
		const step = { x: 0.01, z: -0.03, yaw: 0.06 },
			matrix = floorHomography(step);
		for (const [x, z] of [
			[0.1, -0.5],
			[-0.2, -1.2],
			[0, -0.4]
		]) {
			const before = floorToPixel(x, z)!,
				local = relative(step, { x, z, yaw: 0 }),
				after = floorToPixel(local.x, local.z)!;
			const w = matrix[6] * before.u + matrix[7] * before.v + matrix[8];
			expect((matrix[0] * before.u + matrix[1] * before.v + matrix[2]) / w).toBeCloseTo(after.u, 6);
			expect((matrix[3] * before.u + matrix[4] * before.v + matrix[5]) / w).toBeCloseTo(after.v, 6);
		}
	});
	it('refuses to guess from too few points', () => {
		expect(estimateMotion([600, 500, 700, 520], [601, 505, 702, 524])).toBeNull();
	});
});
