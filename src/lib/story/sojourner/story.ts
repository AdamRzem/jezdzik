// Sojourner's story, step by step. Edit the texts here; no code changes are needed.
//
// AI disclosure: the message and result texts below were drafted with an AI assistant
// from the cited sources and are meant to be rewritten by the team.

import type { Step } from '../types';
import { photos, readings } from './findings';

const CHAPTER = 'Pathfinder, 1997';
const NASA_PATHFINDER = 'https://science.nasa.gov/mission/mars-pathfinder/';
const NATURE = 'https://www.nature.com/articles/40712';
const APXS_TABLE = 'https://nssdc.gsfc.nasa.gov/planetary/marspath/apxs_table1.html';

export const steps: Step[] = [
	{
		id: 'briefing',
		kind: 'uplink',
		chapter: CHAPTER,
		date: 'December 1996',
		title: 'Briefing',
		real: true,
		message:
			'Sojourner, this is Mission Control. You are about to become the first rover to drive on another planet. We planned for 7 days. Let’s see how far you get.'
	},
	{
		id: 'landing',
		kind: 'uplink',
		chapter: CHAPTER,
		date: '4 July 1997',
		title: 'Landing',
		real: true,
		memory: photos.onThePetal,
		message:
			'Landing site: Ares Vallis, an ancient flood plain. No rockets for the last part. You are wrapped in airbags and you are going to bounce.',
		result: {
			text: 'Pathfinder hit the ground at about 14 metres per second, bounced about 15 times, as high as 15 metres, and stopped about 1 km from where it first touched down. It was the first airbag landing on Mars.',
			source: 'NASA, Mars Pathfinder',
			sourceUrl: NASA_PATHFINDER
		}
	},
	{
		id: 'roll-out',
		kind: 'goto',
		chapter: CHAPTER,
		date: 'Sol 2 · 5 July 1997',
		title: 'Roll out',
		real: true,
		point: 'A',
		message:
			'Stand up to your full 30 cm and roll down the ramp to point A. The ramp is tilted 20 degrees, well within limits. Take it slow.',
		media: photos.firstTracks
	},
	{
		// First rock: analysed where it stands.
		id: 'barnacle-bill',
		kind: 'analyse',
		chapter: CHAPTER,
		date: 'Sol 3',
		title: 'Barnacle Bill',
		real: true,
		object: 'barnacle-bill',
		scanHours: 10,
		reading: readings.barnacleBill,
		memory: photos.atBarnacleBill,
		message:
			'Your first rock is right next to the lander. We call it Barnacle Bill. Press your spectrometer against it and hold still. A full reading takes about 10 hours.',
		result: {
			text: 'A surprise: Barnacle Bill held far more silica than the soil around it, 55% against 44% in NASA’s first analysis. That is close to a rock called andesite on Earth. NASA noted it could also have formed from sediment or a meteorite impact.',
			source: 'NASA NSSDCA, preliminary APXS results',
			sourceUrl: APXS_TABLE
		}
	},
	{
		// Second rock: carried to the rover's last known position (point C), then analysed there.
		id: 'yogi',
		kind: 'place',
		chapter: CHAPTER,
		date: 'Sol 10',
		title: 'Yogi',
		real: false,
		object: 'yogi',
		to: 'C',
		scanHours: 10,
		reading: readings.yogi,
		memory: photos.atYogi,
		message:
			'Next is Yogi. We want this one somewhere else. Pick it up, carry it out to point C and set it down. Then run your analysis there.',
		result: {
			text: 'The real Sojourner reached Yogi on 9 July, drove a little too far and ended up leaning against it. It was repositioned and analysed the rock on sol 10. Point C marks the place where the rover was last seen, near a rock called Chimp, about 12 metres from the lander.',
			source: 'Nature, 1997',
			sourceUrl: NATURE
		}
	},
	{
		id: 'rock-garden',
		kind: 'goto',
		chapter: CHAPTER,
		date: 'August 1997',
		title: 'The Rock Garden',
		real: true,
		point: 'B',
		message: 'Drive to point B, the Rock Garden. Look around when you get there.',
		media: photos.rockGarden
	},
	{
		id: 'signal-lost',
		kind: 'signal-lost',
		chapter: CHAPTER,
		date: '27 September 1997',
		title: 'Loss of signal',
		real: true,
		memory: photos.atChimp,
		message: 'Sojourner, good work today. Tomorrow we want you to head back towards the',
		result: {
			text: 'The lander sent its last transmission on 27 September 1997. Sojourner’s last orders were to wait, then drive around the lander. Nobody knows if it did. Planned for 7 days, it had worked for 83.',
			source: 'Wikipedia, Sojourner (rover)',
			sourceUrl: 'https://en.wikipedia.org/wiki/Sojourner_(rover)'
		}
	},
	{
		id: 'still-there',
		kind: 'epilogue',
		chapter: 'Today',
		title: 'Still there',
		real: true,
		message:
			'Sojourner never answered again. It is still in Ares Vallis, close to its lander. In 2006 an orbiter photographed something about 6 metres south of the lander that may be Sojourner. It was never confirmed.'
	},
	{
		id: 'legacy',
		kind: 'epilogue',
		chapter: 'Today',
		title: 'Abandoned, but not forgotten',
		real: true,
		memory: photos.sunset,
		message:
			'Sojourner was named by Valerie Ambroise, who was 12. It proved that rovers work: Spirit, Opportunity, Curiosity and Perseverance followed its tracks.'
	}
];
