import type { Pose, TrackedItem, ViewerStatus } from '../ar/types';
import type { Target } from './engine.svelte';
import type { Step } from './types';
import { world } from './world';

export const RADAR_RANGE = 3;
export const FRESH_MS = 1500;
export type Position = { x: number; z: number };
export type MapMemory = {
	mode: ViewerStatus['mode'] | null;
	epoch: number | null;
	pose: Pose | null;
	items: Record<number, TrackedItem>;
};
export const emptyMapMemory = (): MapMemory => ({ mode: null, epoch: null, pose: null, items: {} });

/** Retain observations only within a single source and world coordinate frame. */
export function rememberMap(previous: MapMemory, status: ViewerStatus): MapMemory {
	const reset =
		previous.mode !== status.mode ||
		(status.pose !== null && previous.epoch !== status.pose.e) ||
		(status.pose === null && status.frame === null);
	const memory = reset ? emptyMapMemory() : previous;
	const usable = status.pose !== null && status.pose.q !== 0 && !status.trackingLost;
	return {
		mode: status.mode,
		epoch: status.pose?.e ?? memory.epoch,
		pose: usable ? { ...status.pose! } : memory.pose,
		items: usable
			? {
					...memory.items,
					...Object.fromEntries(status.items.map((item) => [item.id, { ...item }]))
				}
			: memory.items
	};
}

export function objectiveLocations(steps: Step[], completed: string[], target: Target | null) {
	const references = new Map<string, string[]>();
	for (const step of steps) {
		const ids =
			step.kind === 'goto'
				? [step.point]
				: step.kind === 'analyse'
					? [step.object]
					: step.kind === 'place'
						? [...(step.from ? [step.from] : []), step.object, step.to]
						: [];
		for (const id of new Set(ids)) references.set(id, [...(references.get(id) ?? []), step.id]);
	}
	return [...references].flatMap(([id, missions], index) => {
		const entry = world.find((entry) => entry.id === id);
		return entry
			? [
					{
						...entry,
						number: index + 1,
						state:
							target?.id === id
								? ('active' as const)
								: missions.every((mission) => completed.includes(mission))
									? ('completed' as const)
									: ('pending' as const)
					}
				]
			: [];
	});
}

/** Heading up: yaw zero faces -Z; positive yaw turns toward -X. */
export function projectRadar(position: Position, pose: Pick<Pose, 'x' | 'z' | 'yaw'>) {
	const dx = position.x - pose.x,
		dz = position.z - pose.z;
	const right = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
	const forward = -dx * Math.sin(pose.yaw) - dz * Math.cos(pose.yaw);
	const distance = Math.hypot(dx, dz);
	const scale = 90 / Math.max(RADAR_RANGE, distance);
	return {
		x: 112 + right * scale,
		y: 112 - forward * scale,
		distance,
		clipped: distance > RADAR_RANGE,
		angle: (Math.atan2(right, forward) * 180) / Math.PI
	};
}

/** Offset only the glyphs, keeping a leader back to each true projected position. */
export function separateMarkers<T extends { x: number; y: number }>(markers: T[]) {
	const placed: { x: number; y: number }[] = [];
	return markers.map((marker) => {
		let label = { x: marker.x, y: marker.y };
		for (let attempt = 0; attempt < 160; attempt++) {
			const radius = attempt === 0 ? 0 : 18 * Math.ceil(attempt / 12);
			const angle = (attempt * Math.PI) / 6;
			label = {
				x: Math.max(12, Math.min(212, marker.x + Math.cos(angle) * radius)),
				y: Math.max(12, Math.min(212, marker.y + Math.sin(angle) * radius))
			};
			if (
				Math.hypot(label.x - 112, label.y - 112) >= 18 &&
				placed.every((other) => Math.hypot(label.x - other.x, label.y - other.y) >= 18)
			)
				break;
		}
		placed.push(label);
		return { ...marker, labelX: label.x, labelY: label.y };
	});
}
