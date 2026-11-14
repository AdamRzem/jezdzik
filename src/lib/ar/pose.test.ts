import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPose, PoseBuffer, PoseClient } from './pose';
import { FrameSync } from './sync';
import type { Pose } from './types';

const pose = (f = 0, e = 1): Pose => ({ e, f, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 });
describe('real camera pose without an IMU gate', () => {
	afterEach(() => vi.unstubAllGlobals());
	const connect = () => {
		vi.stubGlobal('location', { href: 'http://localhost/play' });
		vi.stubGlobal('localStorage', { getItem: () => null });
		const socket = { onmessage: vi.fn<(event: { data: string }) => void>(), close: vi.fn() };
		const worker = {
			onmessage: vi.fn<(event: { data: unknown }) => void>(),
			postMessage: vi.fn(),
			terminate: vi.fn()
		};
		vi.stubGlobal(
			'WebSocket',
			class {
				constructor() {
					return socket;
				}
			}
		);
		vi.stubGlobal(
			'Worker',
			class {
				constructor() {
					return worker;
				}
			}
		);
		const client = new PoseClient(vi.fn(), vi.fn());
		client.start();
		socket.onmessage({
			data: JSON.stringify({ type: 'hello', v: 2, mode: 'real', e: 42, imu: {} })
		});
		return { client, worker };
	};
	it('provides frame poses before calibration and after history is cleared', () => {
		const { client, worker } = connect();
		const first = client.framePose(100);
		expect(first).toEqual({ e: 42, f: 0, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 0 });
		worker.onmessage({ data: { e: 42, history: [], clear: true } });
		expect(client.framePose(200)).toEqual({ ...first, f: 1 });
		client.stop();
	});
	it('uses fresh attitude, falls back for unavailable timestamps, and resumes when samples return', () => {
		const { client, worker } = connect();
		const q = [Math.cos(0.2), 0, Math.sin(0.2), 0];
		worker.onmessage({
			data: {
				e: 42,
				history: [
					{ time: 100, q },
					{ time: 120, q }
				]
			}
		});
		expect(client.framePose(110).yaw).toBeCloseTo(0.4);
		expect(client.framePose(90).yaw).toBe(0);
		expect(client.framePose(171).yaw).toBe(0);
		worker.onmessage({ data: { e: 42, history: [{ time: 180, q }] } });
		expect(client.framePose(180).yaw).toBeCloseTo(0.4);
		client.stop();
	});
});
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
