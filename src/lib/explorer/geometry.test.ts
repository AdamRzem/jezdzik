import { describe, it, expect } from 'vitest';
import { surfacePoint } from './geometry';
import { missions } from './missions';
describe('planet coordinates', () => {
	it('aligns east-positive longitude with the equirectangular sphere', () => {
		expect(surfacePoint(0, 0)).toEqual([1, 0, -0]);
		const east = surfacePoint(0, 90);
		expect(east[0]).toBeCloseTo(0);
		expect(east[2]).toBeCloseTo(-1);
		const north = surfacePoint(90, 0);
		expect(north[1]).toBeCloseTo(1);
		const west = surfacePoint(0, -90);
		expect(west[2]).toBeCloseTo(1);
	});
	it('contains the agreed missions without assigning orbital craft surface coordinates', () => {
		expect(missions).toHaveLength(24);
		expect(new Set(missions.map((m) => m.id)).size).toBe(24);
		expect(missions.filter((m) => m.play).map((m) => m.name)).toEqual(['Sojourner']);
		for (const m of missions)
			if (m.location.type === 'surface') {
				expect(Math.abs(m.location.lat)).toBeLessThanOrEqual(90);
				expect(Math.abs(m.location.lon)).toBeLessThanOrEqual(180);
			}
		expect(missions.find((m) => m.id === 'dawn')?.location.type).toBe('orbit');
		expect(missions.find((m) => m.id === 'kepler')?.world).toBe('Deep space');
		expect(missions.find((m) => m.name === 'Spirit')?.location).toMatchObject({
			lat: -14.5684,
			lon: 175.4726
		});
		expect(missions.find((m) => m.name === 'Opportunity')?.location).toMatchObject({
			lat: -1.9462,
			lon: -5.5268
		});
	});
});
