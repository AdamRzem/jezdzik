import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemStore, markerToItem } from './items';
import { Viewer } from './main';
import type { MarkerDetection, MarkerResult, Pose } from './types';

const pose: Pose = { e: 1, f: 7, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 0 };
const detection: MarkerDetection = {
	id: 10,
	rotation: [1, 0, 0, 0, -1, 0, 0, 0, -1],
	translation: [0, 0, 1]
};
const result: MarkerResult = { type: 'markers', e: 1, f: 7, detections: [detection] };

// Exercise the result handler without creating a WebGL renderer or camera stream.
function handler(debug: boolean) {
	return Object.assign(Object.create(Viewer.prototype), {
		markerDebug: debug,
		markerRequest: pose,
		poses: { epoch: 1 },
		items: new ItemStore(),
		anchors: new Map(),
		socket: null
	}) as {
		acceptMarkers: (result: MarkerResult) => void;
		markerRequest: Pose | null;
		poses: { epoch: number };
	};
}

describe('ArUco guard debugging', () => {
	afterEach(() => vi.restoreAllMocks());
	it('stays silent unless debug is enabled', () => {
		const log = vi.spyOn(console, 'info').mockImplementation(() => {});
		handler(false).acceptMarkers({ ...result, f: 8 });
		expect(log).not.toHaveBeenCalled();
	});
	it('logs rejected worker results with marker and frame context without releasing the current request', () => {
		const log = vi.spyOn(console, 'info').mockImplementation(() => {});
		const viewer = handler(true);
		viewer.acceptMarkers({ ...result, f: 8 });
		expect(log).toHaveBeenCalledWith(
			'[ArUco guard]',
			expect.objectContaining({
				markerId: 10,
				reason: 'unmatched-worker-result',
				epoch: 1,
				frame: 8,
				expectedFrame: 7
			})
		);
		expect(viewer.markerRequest).toBe(pose);
	});
	it('logs stale epochs and duplicate cube faces', () => {
		const log = vi.spyOn(console, 'info').mockImplementation(() => {});
		const stale = handler(true);
		stale.poses.epoch = 2;
		stale.acceptMarkers(result);
		expect(log).toHaveBeenCalledWith(
			'[ArUco guard]',
			expect.objectContaining({ reason: 'stale-epoch', markerId: 10 })
		);
		handler(true).acceptMarkers({ ...result, detections: [detection, { ...detection, id: 11 }] });
		expect(log).toHaveBeenCalledWith(
			'[ArUco guard]',
			expect.objectContaining({ reason: 'duplicate-cube-face', markerId: 11, itemId: 0 })
		);
	});
	it('reports unmapped IDs, malformed poses, and upright-angle failures', () => {
		const report = vi.fn();
		expect(markerToItem({ ...detection, id: 9 }, pose, report)).toBeNull();
		expect(report).toHaveBeenLastCalledWith('unmapped-marker-id', { minId: 10, maxId: 57 });
		expect(markerToItem({ ...detection, translation: [NaN, 0, 1] }, pose, report)).toBeNull();
		expect(report).toHaveBeenLastCalledWith('invalid-marker-pose', expect.any(Object));
		expect(
			markerToItem({ ...detection, rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, pose, report)
		).toBeNull();
		expect(report).toHaveBeenLastCalledWith(
			'marker-not-upright',
			expect.objectContaining({ maxTiltDegrees: 15 })
		);
	});
	it('reports each deferred jump, then accepts the fifth consistent measurement', () => {
		const report = vi.fn();
		const items = new ItemStore();
		const item = { id: 0, x: 0, z: -1, yaw: 0 };
		items.update(item, 1, 0, report);
		for (let count = 1; count <= 4; count++) {
			items.update({ ...item, x: 0.5 }, 1, count, report);
			expect(report).toHaveBeenLastCalledWith(
				'position-jump-pending',
				expect.objectContaining({ count, required: 5 })
			);
		}
		expect(report).toHaveBeenCalledTimes(4);
		items.update({ ...item, x: 0.5 }, 1, 5, report);
		expect(report).toHaveBeenCalledTimes(4);
		expect(items.values()[0].x).toBe(0.5);
	});
});
