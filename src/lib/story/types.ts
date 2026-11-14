// Shared by every story (Sojourner, InSight, ...).
//
// Every step is tagged real (it happened) or not (part of the game).
// Result cards always describe what really happened and name their source.

export type Media =
	| { kind: 'image'; url: string; credit: string; caption: string }
	| { kind: 'youtube'; id: string; credit: string; caption: string };

export type Result = { text: string; source: string; sourceUrl: string };

type Base = {
	id: string;
	chapter: string; // shown in the top bar, e.g. "Pathfinder, 1997"
	date?: string;
	title: string;
	message: string; // what Mission Control says
	real: boolean;
};

export type Step =
	// A message only, optionally followed by a result card.
	| (Base & { kind: 'uplink'; result?: Result })
	// Drive to a point; NASA media plays on arrival.
	| (Base & { kind: 'goto'; point: string; media: Media })
	// Drive to an object and analyse it where it stands.
	| (Base & { kind: 'analyse'; object: string; scanHours: number; result: Result })
	// Pick an object up and set it down at a point.
	//   from:      drive to this point first; without it, drive straight to the object
	//   scanHours: analyse the object after setting it down
	| (Base & {
			kind: 'place';
			object: string;
			from?: string;
			to: string;
			scanHours?: number;
			result: Result;
	  })
	| (Base & { kind: 'signal-lost'; result: Result })
	| (Base & { kind: 'epilogue' });
