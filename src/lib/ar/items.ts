import { Matrix4, Vector3 } from 'three';
import { MARKER } from './config';
import { cameraWorld } from './rectify';
import type { MarkerDetection, Observation, Pose, TrackedItem } from './types';

export function wrapAngle(angle: number) {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}
export function markerToItem(detection: MarkerDetection, pose: Pose) {
	if (
		!Number.isInteger(detection.id) ||
		detection.id < 0 ||
		detection.id >= MARKER.count * 4 ||
		detection.rotation.length !== 9 ||
		detection.translation.length !== 3 ||
		![...detection.rotation, ...detection.translation].every(Number.isFinite)
	)
		return null;
	const r = detection.rotation,
		t = detection.translation;
	const marker = new Matrix4().set(
		r[0],
		r[1],
		r[2],
		t[0],
		-r[3],
		-r[4],
		-r[5],
		-t[1],
		-r[6],
		-r[7],
		-r[8],
		-t[2],
		0,
		0,
		0,
		1
	);
	marker.premultiply(cameraWorld(pose));
	const up = new Vector3(0, 1, 0).transformDirection(marker);
	if (up.y < Math.cos(Math.PI / 12)) return null;
	const normal = new Vector3(0, 0, 1).transformDirection(marker);
	const center = new Vector3()
		.setFromMatrixPosition(marker)
		.addScaledVector(normal, -MARKER.cubeM / 2);
	const yaw = wrapAngle(Math.atan2(-normal.x, -normal.z) - ((detection.id % 4) * Math.PI) / 2);
	return { id: Math.floor(detection.id / 4), x: center.x, z: center.z, yaw };
}

export function itemObservation(
	item: Pick<TrackedItem, 'id' | 'x' | 'z' | 'yaw'>,
	pose: Pose
): Observation {
	const dx = item.x - pose.x,
		dz = item.z - pose.z,
		c = Math.cos(pose.yaw),
		s = Math.sin(pose.yaw);
	return {
		cmd: 'obs',
		e: pose.e,
		f: pose.f,
		item: item.id,
		right: dx * c - dz * s,
		forward: -dx * s - dz * c,
		yaw: wrapAngle(item.yaw - pose.yaw)
	};
}

export class ItemStore {
	private items = new Map<number, TrackedItem>();
	private jumps = new Map<number, { x: number; z: number; count: number }>();
	clear() {
		this.items.clear();
		this.jumps.clear();
	}
	values() {
		return [...this.items.values()].map((item) => ({ ...item }));
	}
	update(
		measured: Pick<TrackedItem, 'id' | 'x' | 'z' | 'yaw'>,
		distance: number,
		now = performance.now()
	) {
		const previous = this.items.get(measured.id);
		if (!previous) {
			this.items.set(measured.id, { ...measured, lastSeen: now, detections: 1 });
			return;
		}
		if (Math.hypot(measured.x - previous.x, measured.z - previous.z) > 0.3) {
			const jump = this.jumps.get(measured.id);
			const count =
				jump && Math.hypot(measured.x - jump.x, measured.z - jump.z) < 0.05 ? jump.count + 1 : 1;
			this.jumps.set(measured.id, { x: measured.x, z: measured.z, count });
			if (count < 5) return;
			Object.assign(previous, measured);
		} else {
			const blend = distance <= 2 ? 0.3 : 0.1;
			previous.x += (measured.x - previous.x) * blend;
			previous.z += (measured.z - previous.z) * blend;
			previous.yaw += wrapAngle(measured.yaw - previous.yaw) * blend;
		}
		this.jumps.delete(measured.id);
		previous.lastSeen = now;
		previous.detections++;
	}
}
