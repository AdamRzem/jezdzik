import { describe, expect, it } from 'vitest';
import { CAMERA } from './config';
import { fitFloor, maskDepth, OcclusionProcessor } from './occlusion';
import { QualityController } from './quality';

describe('occlusion', () => {
	it('recovers inverse-depth scale and shift despite foreground outliers', () => {
		const samples = Array.from({ length: 600 }, (_, i) => {
			const d = 0.1 + i / 100;
			return { d, inverseZ: 0.6 * d + 0.15 + (i % 3 === 0 ? 3 : 0), u: i, v: 400 };
		});
		let seed = 31;
		const random = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		const fit = fitFloor(samples, random)!;
		expect(fit.a).toBeCloseTo(0.6, 5);
		expect(fit.b).toBeCloseTo(0.15, 5);
		expect(fit.ratio).toBeGreaterThan(0.6);
	});
	it('removes floor and replacement cube depth while preserving nearer foreground', () => {
		expect(maskDepth(1, 1)).toBe(CAMERA.far);
		expect(maskDepth(0.95, 2, 1)).toBe(CAMERA.far);
		expect(maskDepth(0.7, 2, 1)).toBe(0.7);
	});
	it('rejects depth from a different frame or epoch', () => {
		const processor = new OcclusionProcessor(),
			pose = { e: 2, f: 10, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 as const };
		expect(
			processor.process(
				{ type: 'depth', e: 1, f: 10, width: 1, height: 1, data: new Float32Array([1]), ms: 0 },
				pose,
				[]
			)
		).toBeNull();
	});
});
describe('depth quality', () => {
	it('measures ten cycles at each size and never promotes automatically', () => {
		const quality = new QualityController();
		for (let i = 0; i < 9; i++) expect(quality.observe(110)).toBe('A');
		expect(quality.observe(110)).toBe('B');
		for (let i = 0; i < 10; i++) quality.observe(340);
		expect(quality.tier).toBe('C');
		quality.observe(10);
		expect(quality.tier).toBe('C');
	});
	it('waits five seconds before stepping down after a successful initial measurement', () => {
		const quality = new QualityController();
		for (let i = 0; i < 10; i++) quality.observe(90, 0);
		for (let i = 0; i < 10; i++) quality.observe(200, 1000);
		expect(quality.tier).toBe('A');
		quality.observe(200, 5999);
		expect(quality.tier).toBe('A');
		quality.observe(200, 6000);
		expect(quality.tier).toBe('B');
		quality.set('A');
		for (let i = 0; i < 20; i++) quality.observe(500);
		expect(quality.tier).toBe('A');
	});
});
