import { describe, expect, it } from 'vitest';
import { initialStatus } from '../ar/main';
import type { Pose, TrackedItem } from '../ar/types';
import { StoryEngine } from './engine.svelte';
import { stories } from './missions';
import {
	emptyMapMemory,
	objectiveLocations,
	projectRadar,
	rememberMap,
	separateMarkers
} from './minimap';

const pose: Pose = { e: 1, f: 1, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 };
const item: TrackedItem = { id: 9, x: 1, z: -2, yaw: 0, lastSeen: 100, detections: 1 };

describe('mission radar', () => {
	it('projects forward/right correctly at different headings and clips distant destinations', () => {
		expect(projectRadar({ x: 0, z: -1 }, pose)).toMatchObject({ x: 112, y: 82, clipped: false });
		expect(projectRadar({ x: 1, z: 0 }, pose)).toMatchObject({ x: 142, y: 112 });
		const turned = projectRadar({ x: -1, z: 0 }, { ...pose, yaw: Math.PI / 2 });
		expect(turned.x).toBeCloseTo(112);
		expect(turned.y).toBeCloseTo(82);
		expect(projectRadar({ x: 0, z: -6 }, pose)).toMatchObject({
			x: 112,
			y: 22,
			distance: 6,
			clipped: true
		});
		expect(projectRadar(pose, pose)).toMatchObject({ x: 112, y: 112, distance: 0 });
	});

	it('separates coincident glyphs while preserving their projected coordinates', () => {
		const markers = separateMarkers(Array.from({ length: 7 }, () => ({ x: 112, y: 112 })));
		for (const [i, marker] of markers.entries()) {
			expect(marker.x).toBe(112);
			expect(marker.y).toBe(112);
			for (const other of markers.slice(i + 1)) {
				expect(
					Math.hypot(marker.labelX - other.labelX, marker.labelY - other.labelY)
				).toBeGreaterThanOrEqual(18);
			}
		}
	});

	it('extracts only the selected story locations, with shared destinations deduplicated', () => {
		expect(objectiveLocations(stories.sojourner.steps, [], null).map((entry) => entry.id)).toEqual([
			'A',
			'barnacle-bill',
			'yogi',
			'C',
			'B'
		]);
		expect(objectiveLocations(stories.insight.steps, [], null).map((entry) => entry.id)).toEqual([
			'seis',
			'D',
			'seis-shield',
			'heat-probe',
			'E',
			'F'
		]);
		const state = (completed: string[]) =>
			objectiveLocations(stories.insight.steps, completed, null).find((entry) => entry.id === 'D')!
				.state;
		expect(state(['place-seismometer'])).toBe('pending');
		expect(state(['place-seismometer', 'place-shield'])).toBe('completed');
	});

	it('follows pickup, delivery, completion and restart without changing engine behavior', () => {
		const engine = new StoryEngine(stories.insight.steps);
		const locations = () => objectiveLocations(engine.steps, engine.completed, engine.target);
		engine.goTo(1);
		engine.advance();
		expect(locations().find((entry) => entry.state === 'active')?.id).toBe('seis');
		engine.seen('seis', 0.2);
		engine.grabbed();
		expect(locations().find((entry) => entry.state === 'active')?.id).toBe('D');
		engine.near('seis', 'D', 0.1);
		engine.advance();
		expect(locations().find((entry) => entry.id === 'seis')?.state).toBe('completed');
		engine.restart();
		expect(locations().every((entry) => entry.state === 'pending')).toBe(true);
	});

	it('remembers last-known locations, freezes lost poses, and clears on frame/source changes', () => {
		const status = {
			...initialStatus(),
			mode: 'live' as const,
			pose,
			frame: 1,
			trackingLost: false,
			items: [item]
		};
		const first = rememberMap(emptyMapMemory(), status);
		const expired = rememberMap(first, { ...status, items: [] });
		expect(expired.items[9]).toEqual(item);
		expect(expired.items[10]).toBeUndefined();
		expect(expired.items[9].lastSeen).toBe(100);
		const lost = rememberMap(expired, {
			...status,
			pose: { ...pose, x: 10, q: 0 },
			trackingLost: true
		});
		expect(lost.pose?.x).toBe(0);
		const newEpoch = rememberMap(lost, { ...status, pose: { ...pose, e: 2 }, items: [] });
		expect(newEpoch.items).toEqual({});
		expect(rememberMap(first, { ...status, mode: 'demo', items: [] }).items).toEqual({});
		expect(rememberMap(first, { ...status, pose: null, frame: null, items: [] }).pose).toBeNull();
		expect(rememberMap(emptyMapMemory(), initialStatus()).items).toEqual({});
	});
});
