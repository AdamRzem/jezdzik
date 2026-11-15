// Shared by every story (Sojourner, InSight, ...).
//
// Every step is tagged real (it happened) or not (part of the game).
// Result cards always describe what really happened and name their source.

// A real photo from the mission archive. Files live in static/assets/nasa so they
// load on the rover's own network, where there is no internet.
//   by:   whose camera took it; Sojourner's own pictures are its memories in the truest sense
//   page: the archive page for the picture, for the credit line
export type Photo = {
	kind: 'image';
	url: string;
	credit: string;
	caption: string;
	nasaId?: string;
	by?: 'sojourner' | 'lander';
	page?: string;
};
export type Media = Photo | { kind: 'youtube'; id: string; credit: string; caption: string };

// What the spectrometer really measured, as published. Values are weight percent.
export type Reading = {
	sample: string; // NASA's name for the measurement, e.g. "A-3"
	values: { formula: string; name: string; percent: number; soil: number }[];
	soilSample: string;
	note: string;
	source: string;
	sourceUrl: string;
};

export type Result = { text: string; source: string; sourceUrl: string };

type Base = {
	id: string;
	chapter: string; // shown in the top bar, e.g. "Pathfinder, 1997"
	date?: string;
	title: string;
	message: string; // what Mission Control says
	real: boolean;
	// A real photo of this moment. Shown on the step's card and kept in the album.
	// A 'goto' step uses its media instead.
	memory?: Photo;
};

export type Step =
	// A message only, optionally followed by a result card.
	| (Base & { kind: 'uplink'; result?: Result })
	// Drive to a point; NASA media plays on arrival.
	| (Base & { kind: 'goto'; point: string; media: Media })
	// Drive to an object and analyse it where it stands.
	//   reading: the real measurement, drawn while analysing and on the result card
	| (Base & {
			kind: 'analyse';
			object: string;
			scanHours: number;
			reading?: Reading;
			result: Result;
	  })
	// Pick an object up and set it down at a point.
	//   from:      drive to this point first; without it, drive straight to the object
	//   scanHours: analyse the object after setting it down
	| (Base & {
			kind: 'place';
			object: string;
			from?: string;
			to: string;
			scanHours?: number;
			reading?: Reading;
			result: Result;
	  })
	| (Base & { kind: 'signal-lost'; result: Result })
	| (Base & { kind: 'epilogue' });
