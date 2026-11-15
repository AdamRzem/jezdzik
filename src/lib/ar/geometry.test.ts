import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA, MARKER } from './config';
import { ItemStore, itemObservation, markerToItem } from './items';
import {
	cameraWorld,
	floorDepth,
	floorPlane,
	projectionMatrix,
	rawToRectified,
	rectifiedToRaw
} from './rectify';
import type { Pose } from './types';
const HALF = MARKER.cubeM / 2; // a marker sits on a face, half a cube from the centre
const pose: Pose = { e: 1, f: 1, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 };

describe('shared camera convention', () => {
	it.each([
		// Rows for a camera 11.9 cm above the floor, tilted 10° down.
		[0.5, 458],
		[1, 267],
		[2, 168],
		[3, 134]
	])('projects a floor mark %sm ahead at the planned row', (distance, row) => {
		const p = new Vector3(0, 0, -distance)
			.applyMatrix4(cameraWorld(pose).invert())
			.applyMatrix4(projectionMatrix());
		expect(((1 - p.y) * CAMERA.height) / 2).toBeCloseTo(row, -0.3);
	});
	it('computes optical-axis floor depth including pitch and roll', () => {
		const tilted = { ...pose, pitch: 0.03, roll: -0.02, yaw: 0.5 },
			plane = floorPlane(tilted);
		const u = 800,
			v = 500,
			z = floorDepth(u, v, plane);
		const floor = new Vector3(
			((u - CAMERA.cx) / CAMERA.fx) * z,
			(-(v - CAMERA.cy) / CAMERA.fy) * z,
			-z
		).applyMatrix4(cameraWorld(tilted));
		expect(floor.y).toBeCloseTo(0, 10);
		expect(floorDepth(640, 0, floorPlane(pose))).toBe(Infinity);
	});
	it('inverts radial and tangential distortion at the image edges', () => {
		const distortion = { k1: -0.12, k2: 0.02, p1: 0.001, p2: -0.002, k3: 0 };
		const raw = rectifiedToRaw(30, 690, distortion),
			rectified = rawToRectified(raw.u, raw.v, distortion);
		expect(rectified.u).toBeCloseTo(30, 4);
		expect(rectified.v).toBeCloseTo(690, 4);
	});
	it('converts OpenCV marker coordinates to a cube centre using the detection frame', () => {
		const moving = { ...pose, x: 0.2, yaw: 0.1 },
			worldMarker = new Matrix4().makeTranslation(-0.1, HALF, -1 + HALF);
		const m = cameraWorld(moving).invert().multiply(worldMarker).elements;
		const item = markerToItem(
			{
				id: MARKER.startId,
				rotation: [m[0], m[4], m[8], -m[1], -m[5], -m[9], -m[2], -m[6], -m[10]],
				translation: [m[12], -m[13], -m[14]]
			},
			moving
		)!;
		expect(item.x).toBeCloseTo(-0.1);
		expect(item.z).toBeCloseTo(-1);
		expect(itemObservation(item, moving).f).toBe(moving.f);
	});
	it.each(Array.from({ length: 48 }, (_, offset) => offset))(
		'recovers object and orientation from marker offset %s',
		(offset) => {
			const yaw = 0.37;
			const angle = yaw + ((offset % 4) * Math.PI) / 2;
			const normal = new Vector3(-Math.sin(angle), 0, -Math.cos(angle));
			const world = new Matrix4().makeRotationY(angle + Math.PI);
			world.setPosition(new Vector3(0.2, HALF, -1).addScaledVector(normal, HALF));
			const m = cameraWorld(pose).invert().multiply(world).elements;
			const item = markerToItem(
				{
					id: MARKER.startId + offset,
					rotation: [m[0], m[4], m[8], -m[1], -m[5], -m[9], -m[2], -m[6], -m[10]],
					translation: [m[12], -m[13], -m[14]]
				},
				pose
			)!;
			expect(item.id).toBe(Math.floor(offset / 4));
			expect(item.x).toBeCloseTo(0.2);
			expect(item.z).toBeCloseTo(-1);
			expect(item.yaw).toBeCloseTo(yaw);
		}
	);
	it.each([-1, 0, 9, 58, 99, 10.5, NaN])('ignores unassigned marker ID %s', (id) => {
		expect(
			markerToItem({ id, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 1] }, pose)
		).toBeNull();
	});
	it('stores display smoothing separately and accepts a moved item only after five consistent detections', () => {
		const items = new ItemStore();
		const item = { id: 0, x: 0, z: -1, yaw: 0 };
		items.update(item, 1);
		for (let i = 0; i < 4; i++) items.update({ ...item, x: 0.5 }, 1);
		expect(items.values()[0].x).toBe(0);
		items.update({ ...item, x: 0.5 }, 1);
		expect(items.values()[0].x).toBe(0.5);
		items.clear();
		expect(items.values()).toEqual([]);
	});
	it('expires missing objects after a brief grace period while retaining recently detected objects', () => {
		const items = new ItemStore();
		const item = { id: 0, x: 0, z: -1, yaw: 0 };
		items.update(item, 1, 0);
		items.update({ ...item, id: 1 }, 1, 200);
		expect(items.expire(499)).toEqual([]);
		expect(items.expire(500)).toEqual([0]);
		expect(items.values().map((entry) => entry.id)).toEqual([1]);
		items.update({ ...item, id: 1 }, 1, 600);
		expect(items.expire(700)).toEqual([]);
		expect(items.expire(1100)).toEqual([1]);
		expect(items.values()).toEqual([]);
	});
	it('clears stale jump confirmation and immediately places a reacquired object', () => {
		const items = new ItemStore();
		const item = { id: 0, x: 0, z: -1, yaw: 0 };
		items.update(item, 1, 0);
		for (let i = 1; i <= 4; i++) items.update({ ...item, x: 0.5 }, 1, i);
		items.expire(500);
		items.update({ ...item, x: 1 }, 1, 600);
		expect(items.values()[0]).toMatchObject({ x: 1, detections: 1, lastSeen: 600 });
		items.update({ ...item, x: 0.5 }, 1, 601);
		expect(items.values()[0].x).toBe(1);
	});
});
