// InSight's playable story. Driving and carrying adapt a stationary lander's arm
// operations; result cards describe the actual mission.
// AI disclosure: narrative drafted with an AI assistant; NASA/JPL sources below.
import type { Step } from '../types';

const CHAPTER = 'InSight, 2018–2022';
const END_OF_MISSION =
	'https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science/';

export const steps: Step[] = [
	{
		id: 'arrival',
		kind: 'uplink',
		chapter: CHAPTER,
		date: '26 November 2018',
		title: 'A quiet place to listen',
		real: true,
		message:
			'InSight, this is Mission Control. Welcome to Elysium Planitia. A plain of dust and stones stretches around you. Our destination is beneath your feet: the inside of Mars.',
		result: {
			text: 'InSight landed on 26 November 2018. It was a stationary lander, with a robotic arm to place instruments on the ground. In this game, driving and carrying stand in for that arm; the real spacecraft never drove anywhere.',
			source: 'NASA, InSight',
			sourceUrl: 'https://science.nasa.gov/mission/insight/'
		}
	},
	{
		id: 'place-seismometer',
		kind: 'place',
		chapter: CHAPTER,
		date: '19 December 2018',
		title: 'An ear to the ground',
		real: false,
		object: 'seis',
		to: 'D',
		message:
			'Find the seismometer, SEIS. Pick it up and carry it to spot D. Set it down gently. This instrument will feel movements too small for us to see.',
		result: {
			text: 'On 19 December 2018, InSight used its robotic arm to lower SEIS onto the Martian surface. Ground contact allowed it to measure the vibrations that would reveal the planet’s interior.',
			source: 'NASA/JPL, InSight places first instrument on Mars',
			sourceUrl: 'https://www.jpl.nasa.gov/news/nasas-insight-places-first-instrument-on-mars/'
		}
	},
	{
		id: 'place-shield',
		kind: 'place',
		chapter: CHAPTER,
		date: '2 February 2019',
		title: 'Shelter from the wind',
		real: false,
		object: 'seis-shield',
		to: 'D',
		message:
			'Now find the wind and thermal shield. Carry it to spot D, where you left SEIS. Place the cover over our listening station. The planet’s faint signals need a quiet shelter.',
		result: {
			text: 'InSight placed its Wind and Thermal Shield over the seismometer on 2 February 2019. The instrument remained on the ground beneath the cover.',
			source: 'NASA, InSight deploys its Wind and Thermal Shield',
			sourceUrl: 'https://science.nasa.gov/resource/insight-deploys-its-wind-and-thermal-shield/'
		}
	},
	{
		id: 'place-heat-probe',
		kind: 'place',
		chapter: CHAPTER,
		date: '12 February 2019',
		title: 'Take the planet’s temperature',
		real: false,
		object: 'heat-probe',
		to: 'E',
		message:
			'Find the heat probe and carry it to spot E. Inside is a small hammering probe called the mole. Its job is to dig below the surface and help us measure heat escaping from Mars.',
		result: {
			text: 'The arm deployed the HP³ heat probe on 12 February 2019, about a metre from SEIS. Its mole was designed to reach as deep as five metres, pulling a tether fitted with temperature sensors behind it.',
			source: 'NASA/JPL, InSight prepares to take Mars’ temperature',
			sourceUrl: 'https://www.jpl.nasa.gov/news/nasas-insight-prepares-to-take-mars-temperature/'
		}
	},
	{
		id: 'first-marsquake',
		kind: 'goto',
		chapter: CHAPTER,
		date: '6 April 2019 · Sol 128',
		title: 'The first faint signal',
		real: false,
		point: 'F',
		message:
			'Drive to point F and stop. Instruments are in place. Let the dust settle. There: a faint tremor among the wind and the movements of our own arm. Listen to the recording sent home.',
		media: {
			kind: 'youtube',
			id: 'DLBP-5KoSCc',
			credit: 'NASA/JPL-Caltech/CNES/IPGP/Imperial College London',
			caption:
				'InSight’s first likely marsquake, recorded on 6 April 2019. This sonification includes wind, the seismic event and robotic-arm movement. The vibrations are sped up 60 times to make them audible; this is not a microphone recording.'
		}
	},
	{
		id: 'mole-stops',
		kind: 'uplink',
		chapter: CHAPTER,
		date: '14 January 2021',
		title: 'The soil will not cooperate',
		real: true,
		message:
			'InSight, we have tried pressing with the scoop and helping the mole grip the soil. It still cannot reach its target depth. We are ending the digging attempt. Keep listening with SEIS. There is more to learn here.',
		result: {
			text: 'The mole needed friction from surrounding soil to move down. The unexpectedly clumpy soil did not provide enough. After nearly two years of attempts, the team ended the effort in January 2021. The intended deep heat-flow experiment could not be completed.',
			source: 'NASA, InSight’s mole ends its journey on Mars',
			sourceUrl:
				'https://www.nasa.gov/centers-and-facilities/jpl/nasa-insights-mole-ends-its-journey-on-mars/'
		}
	},
	{
		id: 'signal-lost',
		kind: 'signal-lost',
		chapter: CHAPTER,
		date: 'December 2022',
		title: 'One last listening watch',
		real: true,
		message:
			'InSight, dust has dimmed your solar panels. We are keeping the seismometer on for as long as we can. If you can still hear us, send one more',
		result: {
			text: 'InSight last contacted Earth on 15 December 2022. NASA declared the mission over on 21 December after two missed contacts. Dust had reduced the lander’s available power; SEIS was its last operating science instrument.',
			source: 'NASA/JPL, InSight mission retirement',
			sourceUrl: END_OF_MISSION
		}
	},
	{
		id: 'what-remains',
		kind: 'uplink',
		chapter: 'The legacy',
		title: 'A planet heard from one place',
		real: true,
		message:
			'One landing site. Years of patient listening. The instruments have fallen silent, but the signals they sent home are still telling us about Mars.',
		result: {
			text: 'InSight detected 1,319 marsquakes during its mission. Those measurements gave scientists a way to investigate the crust, mantle and core from a single station on the surface.',
			source: 'NASA/JPL, InSight mission retirement',
			sourceUrl: END_OF_MISSION
		}
	},
	{
		id: 'still-there',
		kind: 'epilogue',
		chapter: 'The legacy',
		title: 'Still there',
		real: true,
		message:
			'InSight and its instruments remain in Elysium Planitia. There are no wheel tracks leading away. Its journey was into the planet beneath it, carried home as measurements. Abandoned, but not forgotten.'
	}
];
