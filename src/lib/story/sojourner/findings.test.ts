import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StoryEngine } from '../engine.svelte';
import { steps } from './story';
import { photos, readings } from './findings';

describe('Sojourner archive material', () => {
	it('ships every photo with the site, credited and linked to its archive page', () => {
		for (const photo of Object.values(photos)) {
			expect(photo.url.startsWith('/assets/nasa/')).toBe(true);
			expect(existsSync(`static${photo.url}`), photo.url).toBe(true);
			expect(photo.credit).toMatch(/^NASA/);
			expect(photo.page).toBe(`https://images.nasa.gov/details/${photo.nasaId}`);
		}
	});
	it('loads no story picture from the internet', () => {
		for (const step of steps) {
			const photo = StoryEngine.photoOf(step);
			if (photo) expect(photo.url.startsWith('/')).toBe(true);
		}
	});
	it('quotes NASA’s published table for the rocks', () => {
		const silica = (reading: typeof readings.yogi) =>
			reading.values.find((value) => value.formula === 'SiO₂')!;
		expect(silica(readings.barnacleBill)).toMatchObject({ percent: 55.0, soil: 43.8 });
		expect(silica(readings.yogi).percent).toBe(50.9);
		for (const reading of Object.values(readings))
			for (const value of reading.values) expect(value.percent).toBeGreaterThan(0);
	});
	it('collects a memory for each finished step that has a photo', () => {
		const engine = new StoryEngine(steps);
		expect(engine.memories).toEqual([]);
		engine.completed = steps.map((step) => step.id);
		expect(engine.memories.map((memory) => memory.photo.nasaId)).toEqual([
			'PIA00621',
			'PIA00633',
			'PIA00634',
			'PIA00766',
			'PIA04318',
			'PIA00970',
			'PIA00783'
		]);
	});
});
