import { describe, expect, it } from 'vitest';
import { COURSE_ITEMS } from '../ar/demo';
import { ITEM_TYPES } from '../ar/config';
import { missions } from '../explorer/missions';
import { StoryEngine } from './engine.svelte';
import { stories, storyFor } from './missions';
import { world } from './world';

describe('story missions', () => {
	it('opens InSight from the explorer while keeping legacy Sojourner links', () => {
		const link = missions.find((mission) => mission.id === 'insight')!.story!;
		expect(storyFor(new URL(link, 'https://rover.local').searchParams.get('mission'))).toBe(
			stories.insight
		);
		expect(storyFor(null)).toBe(stories.sojourner);
		expect(storyFor('unknown')).toBe(stories.sojourner);
	});

	for (const story of Object.values(stories)) {
		it(`${story.name} has unique steps and reachable, modelled course targets`, () => {
			expect(new Set(story.steps.map((step) => step.id)).size).toBe(story.steps.length);
			for (const step of story.steps) {
				const targets =
					step.kind === 'goto'
						? [step.point]
						: step.kind === 'analyse'
							? [step.object]
							: step.kind === 'place'
								? [step.object, step.to, ...(step.from ? [step.from] : [])]
								: [];
				for (const id of targets) {
					const entry = world.find((entry) => entry.id === id);
					expect(entry, `${story.name}: ${id}`).toBeDefined();
					expect(COURSE_ITEMS.some((item) => item.id === entry!.item)).toBe(true);
					expect(ITEM_TYPES[entry!.item].model).toBeTruthy();
				}
			}
		});
	}

	it('completes InSight through tracking, gripping, delivery and media events', () => {
		const engine = new StoryEngine(stories.insight.steps);
		for (const step of stories.insight.steps) {
			expect(engine.step.id).toBe(step.id);
			engine.advance();
			if (step.kind === 'place') {
				engine.seen(step.object, 2);
				expect(engine.stage).toBe('travel');
				engine.seen(step.object, 0.3);
				expect(engine.stage).toBe('grab');
				engine.grabbed();
				expect(engine.carrying).toBe(step.object);
				engine.near(step.object, step.to, 1);
				expect(engine.stage).toBe('deliver');
				engine.near(step.object, step.to, 0.1);
				expect(engine.stage).toBe('result');
				expect(engine.carrying).toBeNull();
			} else if (step.kind === 'goto') {
				engine.seen(step.point, 0.3);
				expect(engine.stage).toBe('media');
			}
			if (engine.stage === 'result' || engine.stage === 'media') engine.advance();
		}
		expect(engine.stage).toBe('done');
		expect(engine.completed).toEqual(stories.insight.steps.map((step) => step.id));
		engine.restart();
		expect(engine.step.id).toBe('arrival');
		expect(engine.stage).toBe('message');
		expect(engine.completed).toEqual([]);
	});
});
