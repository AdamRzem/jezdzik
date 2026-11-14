import { steps as sojourner } from './sojourner/story';
import { steps as insight } from './insight/story';

export const stories = {
	sojourner: { name: 'Sojourner', steps: sojourner },
	insight: { name: 'InSight', steps: insight }
} as const;

// Existing /story links keep opening Sojourner.
export function storyFor(mission: string | null) {
	return mission === 'insight' ? stories.insight : stories.sojourner;
}
