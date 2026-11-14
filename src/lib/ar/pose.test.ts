import { describe, expect, it } from 'vitest';
import { isPose, PoseBuffer } from './pose';
import { FrameSync } from './sync';
import type { Pose } from './types';

const pose = (f = 0, e = 1): Pose => ({ e, f, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 });
describe('pose protocol', () => {
	it('validates wire data without coercing strings or accepting non-finite coordinates', () => {
		expect(isPose(pose())).toBe(true);
		for (const invalid of [
			null,
			[],
			{ ...pose(), e: -1 },
			{ ...pose(), f: 65536 },
			{ ...pose(), q: '2' },
			{ ...pose(), x: NaN }
		])
			expect(isPose(invalid)).toBe(false);
	});
	it('discards other epochs and bounds the pose buffer across wrap', () => {
		const epochs: number[] = [],
			buffer = new PoseBuffer((e) => epochs.push(e), 2);
		buffer.push(pose(65535));
		buffer.push(pose(0));
		buffer.push(pose(1));
		expect(buffer.get(65535)).toBeUndefined();
		expect(buffer.get(0)?.f).toBe(0);
		buffer.push(pose(2, 2));
		expect(buffer.get(1)).toBeUndefined();
		expect(buffer.get(2, 1)).toBeUndefined();
		expect(epochs).toEqual([1, 2]);
	});
	it('holds two unknown pictures, hides objects on the third, and recovers only on an exact match', () => {
		const sync = new FrameSync();
		expect(sync.decide(0, pose())).toBe('matched');
		expect(sync.decide(1, pose(0))).toBe('hold');
		expect(sync.decide(null, undefined)).toBe('hold');
		expect(sync.decide(3, undefined)).toBe('video-only');
		expect(sync.unknown).toBe(3);
		expect(sync.decide(4, pose(4))).toBe('matched');
		expect(sync.decide(4, pose(4))).toBe('repeat');
		expect(sync.consecutiveUnknown).toBe(0);
	});
	it('can match a repeated stamp after its missing pose arrives', () => {
		const sync = new FrameSync();
		expect(sync.decide(7, undefined)).toBe('hold');
		expect(sync.decide(7, pose(7))).toBe('matched');
	});
});
