// Runs the story. It knows nothing about cameras or markers: the page that owns the
// video feeds it events, and the HUD draws its state.
//
// Events in:
//   advance()                      key press; completes whatever the current stage waits for
//   seen(id, distance)             a marker of that object or point is in view, distance in metres
//   lost(id)                       it left the view
//   near(objectId, pointId, d)     an object and a point seen in the same frame, d metres apart
//   grabbed()                      the gripper closed on the target object
//   tick(seconds)                  call every frame; drives the analyse timer

import { labelOf, phraseOf } from './world';
import type { Photo, Reading, Step } from './types';

export type Stage =
	'message' | 'travel' | 'scan' | 'grab' | 'deliver' | 'media' | 'result' | 'done';
export type Target = { kind: 'object' | 'point'; id: string };

const REACH = 0.4; // metres: close enough to count as "arrived"
const DROP = 0.15; // metres between an object and its spot to count as "delivered"
const SECONDS_PER_HOUR = 1; // one second of scanning stands for one hour

export class StoryEngine {
	readonly steps: Step[];
	index = $state(0);
	stage = $state<Stage>('message');
	scan = $state(0); // 0 to 1
	distance = $state<number | null>(null); // to the current target; null when it is not in view
	completed = $state<string[]>([]);

	constructor(steps: Step[]) {
		this.steps = steps;
	}

	get step(): Step {
		return this.steps[this.index];
	}

	/** The real photo that belongs to a step, if it has one. */
	static photoOf(step: Step): Photo | null {
		if (step.kind === 'goto') return step.media.kind === 'image' ? step.media : null;
		return step.memory ?? null;
	}

	// Photos of the steps completed so far, in story order: the album.
	get memories(): { title: string; photo: Photo }[] {
		return this.steps
			.filter((step) => this.completed.includes(step.id))
			.flatMap((step) => {
				const photo = StoryEngine.photoOf(step);
				return photo ? [{ title: step.title, photo }] : [];
			});
	}

	// The real measurement for the rock being analysed.
	get reading(): Reading | null {
		const s = this.step;
		return (s.kind === 'analyse' || s.kind === 'place') && s.reading ? s.reading : null;
	}

	// What the driver should be looking for right now, for highlighting in AR.
	get target(): Target | null {
		const s = this.step;
		if (s.kind === 'goto' && this.stage === 'travel') return { kind: 'point', id: s.point };
		if (s.kind === 'analyse' && (this.stage === 'travel' || this.stage === 'scan'))
			return { kind: 'object', id: s.object };
		if (s.kind === 'place') {
			if (this.stage === 'travel')
				return s.from ? { kind: 'point', id: s.from } : { kind: 'object', id: s.object };
			if (this.stage === 'grab' || this.stage === 'scan') return { kind: 'object', id: s.object };
			if (this.stage === 'deliver') return { kind: 'point', id: s.to };
		}
		return null;
	}

	// True while the rover is holding an object, so AR can draw it in front of the camera.
	get carrying(): string | null {
		const s = this.step;
		return s.kind === 'place' && this.stage === 'deliver' ? s.object : null;
	}

	get goal(): string {
		const s = this.step;
		if (s.kind === 'goto' && this.stage === 'travel') return `Drive to ${labelOf(s.point)}`;
		if (s.kind === 'analyse') {
			if (this.stage === 'travel') return `Find ${labelOf(s.object)} and drive up to it`;
			if (this.stage === 'scan') return `Hold still: analysing ${labelOf(s.object)}`;
		}
		if (s.kind === 'place') {
			const object = phraseOf(s.object);
			if (this.stage === 'travel')
				return s.from ? `Drive to ${labelOf(s.from)}` : `Find ${object} and drive up to it`;
			if (this.stage === 'grab') return `Pick up ${object}`;
			if (this.stage === 'deliver') return `Carry ${object} to ${labelOf(s.to)} and set it down`;
			if (this.stage === 'scan') return `Hold still: analysing ${object}`;
		}
		return '';
	}

	// Stage position within a Place mission, for "2 of 4" in the HUD.
	get placeStage(): number | null {
		if (this.step.kind !== 'place') return null;
		return { travel: 1, grab: 2, deliver: 3, scan: 4 }[this.stage as 'travel'] ?? null;
	}

	get placeStages(): number {
		return this.step.kind === 'place' && this.step.scanHours ? 4 : 3;
	}

	get scanHours(): number {
		const s = this.step;
		if (s.kind === 'analyse') return s.scanHours;
		return s.kind === 'place' ? (s.scanHours ?? 0) : 0;
	}

	advance() {
		const s = this.step;
		this.distance = null;
		switch (this.stage) {
			case 'message':
				if (s.kind === 'goto' || s.kind === 'analyse' || s.kind === 'place') this.stage = 'travel';
				else if ('result' in s && s.result) this.stage = 'result';
				else this.finish();
				break;
			case 'travel':
				if (s.kind === 'goto') this.stage = 'media';
				else if (s.kind === 'analyse') {
					this.scan = 0;
					this.stage = 'scan';
				} else if (s.kind === 'place') this.stage = 'grab';
				break;
			case 'deliver':
				// Some Place missions analyse the object once it has been set down.
				if (this.scanHours > 0) {
					this.scan = 0;
					this.stage = 'scan';
				} else this.stage = 'result';
				break;
			case 'scan':
				this.stage = 'result';
				break;
			case 'grab':
				this.stage = 'deliver';
				break;
			case 'media':
			case 'result':
				this.finish();
				break;
		}
	}

	seen(id: string, distance: number) {
		const t = this.target;
		if (!t || t.id !== id) return;
		this.distance = distance;
		if (this.stage === 'travel' && distance <= REACH) this.advance();
	}

	lost(id: string) {
		if (this.target?.id === id) this.distance = null;
	}

	near(objectId: string, pointId: string, distance: number) {
		const s = this.step;
		if (s.kind !== 'place' || this.stage !== 'deliver') return;
		if (s.object === objectId && s.to === pointId && distance <= DROP) this.advance();
	}

	grabbed() {
		if (this.stage === 'grab') this.advance();
	}

	tick(seconds: number) {
		if (this.stage !== 'scan') return;
		this.scan = Math.min(1, this.scan + seconds / (this.scanHours * SECONDS_PER_HOUR));
		if (this.scan >= 1) this.advance();
	}

	// For rehearsing: jump around the story.
	goTo(index: number) {
		this.index = Math.max(0, Math.min(this.steps.length - 1, index));
		this.stage = 'message';
		this.scan = 0;
		this.distance = null;
	}

	restart() {
		this.completed = [];
		this.goTo(0);
	}

	private finish() {
		if (!this.completed.includes(this.step.id)) this.completed = [...this.completed, this.step.id];
		if (this.index >= this.steps.length - 1) this.stage = 'done';
		else this.goTo(this.index + 1);
	}
}
