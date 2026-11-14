import { describe, it, expect } from 'vitest';
import { Fusion, angles } from './imu';
const settings = {
	axis_mapping: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1]
	],
	bias_seconds: 0.5,
	delay_ns: 0
};
describe('browser IMU processing', () => {
	it('calibrates and integrates a known rotation, then rejects a gap', () => {
		const f = new Fusion(settings);
		for (let i = 0; i < 100; i++) f.sample([i, i * 5000, 0, 16384, 0, 0, 0, 0]);
		expect(f.ready).toBe(true);
		for (let i = 100; i < 300; i++) f.sample([i, i * 5000, 0, 16384, 0, 0, 65.5 * 30, 0]);
		expect(angles(f.q).yaw).toBeCloseTo(Math.PI / 6, 4);
		f.sample([301, 301 * 5000, 0, 16384, 0, 0, 0, 0]);
		expect(f.ready).toBe(false);
	});
	it('rejects moving calibration and malformed samples', () => {
		const f = new Fusion(settings);
		expect(f.sample([NaN])).toBeNull();
		for (let i = 0; i < 100; i++) f.sample([i, i * 5000, 0, 16384, 0, (i % 2) * 655, 0, 0]);
		expect(f.ready).toBe(false);
	});
});
