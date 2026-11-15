// What Sojourner's spectrometer (APXS) really measured, and the real photos of the mission.
//
// Readings: NASA NSSDCA, "Preliminary Mars Pathfinder APXS Results", oxide table,
// last updated 14 August 1997. Samples A-3 (Barnacle Bill), A-7 (Yogi) and A-5 (soil).
// These are NASA's first published values; later papers refined them. The table marks
// potassium and manganese as upper limits, so they are left out here.
//
// Photos: NASA Image and Video Library (images.nasa.gov), copied unchanged into
// static/assets/nasa so they load without internet. Captions are rewritten from NASA's.

import type { Photo, Reading } from '../types';

const APXS_TABLE = 'https://nssdc.gsfc.nasa.gov/planetary/marspath/apxs_table1.html';
const APXS_NOTES = 'https://nssdc.gsfc.nasa.gov/planetary/marspath/apxs.html';

const OXIDES = [
	['SiO₂', 'silica'],
	['FeO', 'iron oxide'],
	['Al₂O₃', 'alumina'],
	['MgO', 'magnesia'],
	['CaO', 'lime'],
	['Na₂O', 'soda'],
	['SO₃', 'sulfur']
] as const;
const SOIL_A5 = [43.8, 17.5, 10.1, 8.6, 5.3, 3.6, 5.4];

function reading(sample: string, percents: number[], note: string, sourceUrl: string): Reading {
	return {
		sample,
		values: OXIDES.map(([formula, name], i) => ({
			formula,
			name,
			percent: percents[i],
			soil: SOIL_A5[i]
		})),
		soilSample: 'A-5',
		note,
		source: 'NASA NSSDCA, preliminary APXS results, August 1997',
		sourceUrl
	};
}

export const readings = {
	barnacleBill: reading(
		'A-3',
		[55.0, 12.7, 12.4, 3.1, 4.6, 4.2, 2.2],
		'More silica and less magnesium than the soil: this rock is not just hardened dust.',
		APXS_TABLE
	),
	yogi: reading(
		'A-7',
		[50.9, 13.8, 11.4, 6.3, 5.8, 2.5, 4.2],
		'Yogi was coated in dust, which pulls this reading towards the soil. With the dust subtracted, NASA found it very similar to Barnacle Bill.',
		APXS_NOTES
	)
};

function photo(nasaId: string, by: Photo['by'], credit: string, caption: string): Photo {
	return {
		kind: 'image',
		url: `/assets/nasa/${nasaId}.jpg`,
		credit,
		caption,
		nasaId,
		by,
		page: `https://images.nasa.gov/details/${nasaId}`
	};
}

export const photos = {
	onThePetal: photo(
		'PIA00621',
		'lander',
		'NASA/JPL',
		'Sol 1, 4 July 1997. Sojourner is still latched to the lander’s petal, with the deflated airbags around it and the ramps not yet unrolled.'
	),
	firstTracks: photo(
		'PIA00633',
		'sojourner',
		'NASA/JPL',
		'Sojourner’s own camera, sol 3: its first wheel tracks, made while turning towards Barnacle Bill. Tracks this sharp meant the soil is as fine as powder. The real rover was 65 cm long, weighed 10.6 kg and drove at 1 cm per second.'
	),
	atBarnacleBill: photo(
		'PIA00634',
		'lander',
		'NASA/JPL',
		'Sojourner pressing its spectrometer against Barnacle Bill, the first rock on Mars ever analysed by a rover.'
	),
	atYogi: photo(
		'PIA00766',
		'lander',
		'NASA/JPL',
		'Sojourner with its spectrometer against Yogi, a rock taller than the rover itself.'
	),
	rockGarden: photo(
		'PIA04318',
		'lander',
		'NASA/JPL-Caltech',
		'Sojourner beside the rock Wedge, with part of the Rock Garden at upper right. Rounded pebbles found at this site suggested that water once flowed across the plain.'
	),
	atChimp: photo(
		'PIA00970',
		'lander',
		'NASA/JPL',
		'Sol 80, 23 September 1997: Sojourner with its spectrometer against the rock Chimp. The rim of Big Crater, 2.2 km away, is on the left horizon. The last transmission came four days later.'
	),
	sunset: photo(
		'PIA00783',
		'lander',
		'NASA/JPL/University of Arizona',
		'Sunset over the Twin Peaks on sol 21. The sky stayed bright for up to two hours after sunset, which showed that Martian dust reaches very high into the atmosphere.'
	)
};
