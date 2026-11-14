// InSight's story. NOT USED YET: this is the material moved out of Sojourner's story,
// kept here as the starting point for a separate InSight experience.
//
// AI disclosure: the texts below were drafted with an AI assistant from the cited
// sources and are meant to be rewritten by the team.
//
// To verify before use: the date of the first marsquake, how many were detected,
// and what happened to the heat probe.

import type { Step } from '../types';

const CHAPTER = 'InSight, 2018';
const NASA_INSIGHT = 'https://science.nasa.gov/mission/insight/';

export const steps: Step[] = [
	{
		id: 'arrival',
		kind: 'uplink',
		chapter: CHAPTER,
		date: '26 November 2018',
		title: 'Arrival',
		real: true,
		message:
			'InSight, this is Mission Control. You are not here to look at rocks. You are here to listen to the planet itself. Landing site: Elysium Planitia.',
		result: {
			text: 'InSight landed on 26 November 2018 in Elysium Planitia. It was a lander and never moved from its spot.',
			source: 'NASA, InSight',
			sourceUrl: NASA_INSIGHT
		}
	},
	{
		id: 'place-seismometer',
		kind: 'place',
		chapter: CHAPTER,
		date: 'December 2018',
		title: 'The seismometer',
		real: false,
		object: 'seis',
		from: 'C',
		to: 'D',
		message:
			'Go to point C, the lander deck. Pick up the seismometer. Carry it to spot D and set it down gently. It has to sit flat.',
		result: {
			text: 'InSight lifted the seismometer off its own deck with a 1.8-metre robotic arm and set it on the ground on 19 December 2018, 1.636 metres away. That was about as far as the arm could reach.',
			source: 'JPL, InSight places first instrument on Mars',
			sourceUrl: 'https://www.jpl.nasa.gov/news/nasas-insight-places-first-instrument-on-mars/'
		}
	},
	{
		id: 'listen',
		kind: 'goto',
		chapter: CHAPTER,
		date: 'December 2018',
		title: 'Listen',
		real: false,
		point: 'F',
		message: 'Drive back to point F and stay quiet. We are listening.',
		media: {
			kind: 'youtube',
			id: 'yT50Q_Zbf3s',
			credit: 'NASA/JPL-Caltech',
			caption:
				'Real recording: InSight’s sensors picked up the vibrations of Martian wind blowing across its solar panels on 1 December 2018.'
		}
	},
	{
		id: 'signal-lost',
		kind: 'signal-lost',
		chapter: CHAPTER,
		date: 'December 2022',
		title: 'Loss of signal',
		real: true,
		message:
			'InSight, your solar panels are covered in dust. Your power is dropping. We will keep lis',
		result: {
			text: 'InSight’s mission ended on 15 December 2022.',
			source: 'NASA, InSight',
			sourceUrl: NASA_INSIGHT
		}
	},
	{
		id: 'still-there',
		kind: 'epilogue',
		chapter: 'Today',
		title: 'Still there',
		real: true,
		message:
			'InSight sits under a layer of dust in Elysium Planitia. It taught us what Mars is made of inside.'
	}
];
