// What each tracked item means in the story.
//
// The AR viewer numbers items 0 to 11. Item i carries ArUco markers 4i to 4i+3
// (dictionary DICT_4X4_50), one per side face. The same numbering selects the model
// in src/lib/ar/config.ts, so keep the two files in step.

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
	{ id: 'seis', label: 'Seismometer', item: 2, kind: 'object', the: true },
	{ id: 'heat-probe', label: 'Heat probe', item: 3, kind: 'object', the: true },
	{ id: 'A', label: 'Point A', item: 4, kind: 'point' },
	{ id: 'B', label: 'Point B', item: 5, kind: 'point' },
	{ id: 'C', label: 'Point C', item: 6, kind: 'point' },
	{ id: 'D', label: 'Spot D', item: 7, kind: 'point' },
	{ id: 'E', label: 'Spot E', item: 8, kind: 'point' },
	{ id: 'F', label: 'Point F', item: 9, kind: 'point' }
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
	return entry ? [0, 1, 2, 3].map((face) => entry.item * 4 + face) : [];
};
