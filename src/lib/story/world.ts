// What each tracked item means in the story.
//
// Item numbers come from the model list in src/lib/ar/config.ts (COVER_MODELS).
// Item i carries ArUco markers MARKER.startId + 4i to + 4i + 3, one per side face.
// Keep the two files in step.

import { MARKER } from '../ar/config';

export type WorldEntry = {
	id: string;
	label: string;
	item: number;
	kind: 'object' | 'point';
	the?: boolean; // say "the seismometer" but plain "Yogi"
};

export const world: WorldEntry[] = [
	{ id: 'barnacle-bill', label: 'Barnacle Bill', item: 0, kind: 'object' },
	{ id: 'yogi', label: 'Yogi', item: 1, kind: 'object' },
	{ id: 'seis', label: 'Seismometer', item: 9, kind: 'object', the: true },
	{ id: 'seis-shield', label: 'Wind and thermal shield', item: 10, kind: 'object', the: true },
	{ id: 'heat-probe', label: 'Heat probe', item: 11, kind: 'object', the: true },
	{ id: 'A', label: 'Point A', item: 12, kind: 'point' },
	{ id: 'B', label: 'Point B', item: 13, kind: 'point' },
	{ id: 'C', label: 'Point C', item: 14, kind: 'point' },
	{ id: 'D', label: 'Spot D', item: 15, kind: 'point' },
	{ id: 'E', label: 'Spot E', item: 16, kind: 'point' },
	{ id: 'F', label: 'Point F', item: 17, kind: 'point' }
];

export const labelOf = (id: string) => world.find((w) => w.id === id)?.label ?? id;
// How to name an entry mid-sentence.
export const phraseOf = (id: string) => {
	const entry = world.find((w) => w.id === id);
	if (!entry) return id;
	return entry.the ? 'the ' + entry.label.toLowerCase() : entry.label;
};
export const idOfItem = (item: number) => world.find((w) => w.item === item)?.id ?? null;
export const itemOf = (id: string) => world.find((w) => w.id === id)?.item ?? null;
export const markersOf = (id: string) => {
	const entry = world.find((w) => w.id === id);
	return entry ? [0, 1, 2, 3].map((face) => MARKER.startId + entry.item * 4 + face) : [];
};
