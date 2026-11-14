export type World = 'Mars' | 'Moon' | 'Ceres' | 'Eros' | 'Deep space';
export type Mission = {
	id: string;
	name: string;
	world: World;
	year: number;
	kind: string;
	site: string;
	description: string;
	remains: string;
	source: string;
	location: { type: 'surface'; lat: number; lon: number } | { type: 'orbit' | 'trajectory' };
	play?: '/play';
	story?: '/story' | '/story?mission=insight';
};
const nasa = (slug: string) => `https://science.nasa.gov/mission/${slug}/`;
function surface(
	id: string,
	name: string,
	world: World,
	year: number,
	kind: string,
	site: string,
	lat: number,
	lon: number,
	description: string,
	remains: string,
	source = nasa(id)
): Mission {
	return {
		id,
		name,
		world,
		year,
		kind,
		site,
		location: { type: 'surface', lat, lon },
		description,
		remains,
		source
	};
}
export const missions: Mission[] = [
	{
		...surface(
			'mars-pathfinder',
			'Sojourner',
			'Mars',
			1997,
			'Rover',
			'Ares Vallis',
			19.13,
			-33.22,
			'Small wheels. An enormous first step. Sojourner proved that a robot could roam another planet, opening the way for every Mars rover that followed.',
			'The rover and its Pathfinder lander remain in Ares Vallis.'
		),
		play: '/play',
		story: '/story'
	},
	surface(
		'mer-spirit',
		'Spirit',
		'Mars',
		2004,
		'Rover',
		'Gusev Crater',
		-14.5684,
		175.4726,
		'Built for 90 Martian days, Spirit explored for more than six Earth years, finding evidence of a wetter ancient Mars.',
		'Its journey ended at Troy, near Home Plate in the Columbia Hills.'
	),
	surface(
		'mer-opportunity',
		'Opportunity',
		'Mars',
		2004,
		'Rover',
		'Meridiani Planum',
		-1.9462,
		-5.5268,
		'A geologist on six wheels. Opportunity crossed more than a marathon of Martian terrain and uncovered signs of ancient water.',
		'It rests in Perseverance Valley at Endeavour Crater after the 2018 dust storm.'
	),
	surface(
		'viking-1',
		'Viking 1',
		'Mars',
		1976,
		'Lander',
		'Chryse Planitia',
		22.2692,
		-47.9519,
		'Viking 1 opened a lasting window onto the Martian surface, photographing its surroundings and studying the soil.',
		'The stationary lander remains at its touchdown site.'
	),
	surface(
		'viking-2',
		'Viking 2',
		'Mars',
		1976,
		'Lander',
		'Utopia Planitia',
		47.668,
		134.28,
		'On a rock-strewn plain, Viking 2 watched frost form and searched for clues in the chemistry of Mars.',
		'The lander remains on the plains of Utopia Planitia.'
	),
	surface(
		'phoenix',
		'Phoenix',
		'Mars',
		2008,
		'Lander',
		'Vastitas Borealis',
		68.2188,
		-125.7492,
		'Phoenix reached into the northern soil and confirmed water ice just beneath the surface.',
		'The lander fell silent as the northern winter approached.'
	),
	{
		...surface(
			'insight',
			'InSight',
			'Mars',
			2018,
			'Lander',
			'Elysium Planitia',
			4.5024,
			135.6234,
			'Listening rather than roaming, InSight used marsquakes to reveal the planet’s interior.',
			'Dust-covered solar panels ended its mission in 2022. It remains at its landing site.'
		),
		story: '/story?mission=insight'
	},
	surface(
		'mars-2020-perseverance/ingenuity-mars-helicopter',
		'Ingenuity',
		'Mars',
		2021,
		'Helicopter',
		'Jezero Crater',
		18.4446,
		77.4509,
		'A brief flight became a new chapter of exploration. Ingenuity demonstrated powered, controlled flight on another planet.',
		'Arrival marker: Perseverance landing site. Final location: Valinor Hills, following rotor damage in 2024.'
	),
	...(
		[
			[
				11,
				1969,
				'Sea of Tranquility',
				0.67416,
				23.47314,
				'Eagle',
				'Early Apollo Scientific Experiments Package (EASEP), including a seismometer and laser retroreflector.'
			],
			[
				12,
				1969,
				'Ocean of Storms',
				-3.01239,
				-23.42157,
				'Intrepid',
				'ALSEP scientific instruments.'
			],
			[
				14,
				1971,
				'Fra Mauro',
				-3.6453,
				-17.47136,
				'Antares',
				'ALSEP scientific instruments and a laser retroreflector.'
			],
			[
				15,
				1971,
				'Hadley–Apennine',
				26.13222,
				3.63386,
				'Falcon',
				'Lunar Roving Vehicle, ALSEP instruments, and a laser retroreflector.'
			],
			[
				16,
				1972,
				'Descartes Highlands',
				-8.97301,
				15.50019,
				'Orion',
				'Lunar Roving Vehicle and ALSEP instruments.'
			],
			[
				17,
				1972,
				'Taurus–Littrow',
				20.1908,
				30.77168,
				'Challenger',
				'Lunar Roving Vehicle and ALSEP instruments.'
			]
		] as const
	).map(([n, year, site, lat, lon, module, equipment]) =>
		surface(
			`apollo-${n}`,
			`Apollo ${n}`,
			'Moon',
			year,
			'Crewed landing',
			site,
			lat,
			lon,
			`The ${module} lunar module carried explorers to ${site}. Its descent stage stayed behind when the crew lifted off for home.`,
			`${module} descent stage. ${equipment}`,
			'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html'
		)
	),
	...(
		[
			[1, 1966, 'Ocean of Storms', -2.46, -43.32],
			[3, 1967, 'Ocean of Storms', -3.016, -23.418],
			[5, 1967, 'Sea of Tranquility', 1.42, 23.2],
			[6, 1967, 'Sinus Medii', 0.473, -1.427],
			[7, 1968, 'Tycho Highlands', -40.97, -11.44]
		] as const
	).map(([n, year, site, lat, lon]) =>
		surface(
			`surveyor-${n}`,
			`Surveyor ${n}`,
			'Moon',
			year,
			'Robotic lander',
			site,
			lat,
			lon,
			`Surveyor ${n} helped reveal the lunar surface through a successful robotic soft landing, paving the way for exploration.`,
			n === 3
				? 'The lander remains near Apollo 12; astronauts returned selected parts to Earth.'
				: n === 6
					? 'The lander rests about 2.5 metres west of its first touchdown, following a short powered hop.'
					: 'The lander remains at its lunar landing site.'
		)
	),
	{
		id: 'dawn',
		name: 'Dawn',
		world: 'Ceres',
		year: 2015,
		kind: 'Orbiter',
		site: 'Orbit around Ceres',
		location: { type: 'orbit' },
		description:
			'After exploring Vesta, Dawn became the first spacecraft to orbit a dwarf planet, discovering a world of bright salt deposits and ancient change.',
		remains: 'Its fuel exhausted in 2018, Dawn remains in an unpowered orbit around Ceres.',
		source: nasa('dawn')
	},
	surface(
		'near-shoemaker',
		'NEAR Shoemaker',
		'Eros',
		2001,
		'Asteroid lander',
		'South of Himeros',
		-36,
		81,
		'An orbiter became a lander. NEAR Shoemaker made a gentle, unplanned-for touchdown on asteroid 433 Eros.',
		'It rests on Eros. Coordinates are the preliminary NASA PDS landing solution; the shape shown is illustrative.',
		'https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=NEAR-A-RSS-1%2F5-EROS%2FORBIT-V1.0'
	),
	{
		id: 'pioneer-10',
		name: 'Pioneer 10',
		world: 'Deep space',
		year: 1972,
		kind: 'Deep-space probe',
		site: 'Outbound solar-system trajectory',
		location: { type: 'trajectory' },
		description:
			'The first spacecraft to cross the asteroid belt and visit Jupiter continued onward into the dark, carrying a message from Earth.',
		remains: 'No longer communicating, Pioneer 10 continues outward on an escape trajectory.',
		source: nasa('pioneer-10')
	},
	{
		id: 'pioneer-11',
		name: 'Pioneer 11',
		world: 'Deep space',
		year: 1973,
		kind: 'Deep-space probe',
		site: 'Outbound solar-system trajectory',
		location: { type: 'trajectory' },
		description:
			'Pioneer 11 passed Jupiter and gave humanity its first close encounter with Saturn before heading outward.',
		remains: 'The silent spacecraft continues away from the Sun on an escape trajectory.',
		source: nasa('pioneer-11')
	},
	{
		id: 'kepler',
		name: 'Kepler',
		world: 'Deep space',
		year: 2009,
		kind: 'Space telescope',
		site: 'Earth-trailing heliocentric orbit',
		location: { type: 'orbit' },
		description: 'By watching distant stars dim, Kepler revealed a galaxy filled with planets.',
		remains:
			'Retired after running out of fuel in 2018, the telescope remains in orbit around the Sun, trailing Earth.',
		source: nasa('kepler')
	}
];
export const worlds: World[] = ['Mars', 'Moon', 'Ceres', 'Eros', 'Deep space'];
export function coordinates(m: Mission) {
	if (m.location.type !== 'surface')
		return m.location.type === 'orbit' ? 'Orbital location' : 'Outbound trajectory';
	const { lat, lon } = m.location;
	return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'} / ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
}
