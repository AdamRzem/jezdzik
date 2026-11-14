import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_TYPES, MARKER } from './config';

describe('cover catalog', () => {
	it('assigns one existing GLB to each item', () => {
		expect(ITEM_TYPES).toHaveLength(MARKER.count);
		expect(new Set(ITEM_TYPES.map((item) => item.model)).size).toBe(MARKER.count);
		for (const item of ITEM_TYPES) {
			expect(item.model).toBeTruthy();
			expect(existsSync(resolve('static', item.model!.slice(1)))).toBe(true);
		}
		expect(ITEM_TYPES.map((item) => item.name)).toEqual([
			'Barnacle Bill',
			'Yogi',
			'Scooby-Doo',
			'Wedge',
			'Shark',
			'Half Dome',
			'Moe',
			'Stimpy',
			'Chimp',
			'SEIS',
			'SEIS shield',
			'Heat probe',
			'Point A',
			'Point B',
			'Point C',
			'Spot D',
			'Spot E',
			'Point F'
		]);
	});
});
