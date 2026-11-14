export const CAMERA = {
	width: 1280,
	height: 720,
	fps: 30,
	fx: 1653.8,
	fy: 1662.4,
	cx: 640,
	cy: 360,
	heightM: 0.127,
	tilt: (10 * Math.PI) / 180,
	near: 0.05,
	far: 50,
	// cx/cy and distortion still require calibration on the final sensor mode.
	calibrated: false,
	distortion: { k1: 0, k2: 0, p1: 0, p2: 0, k3: 0 }
} as const;
export const STAMP = { blocks: 26, size: 16, white: 235, black: 16 } as const;
export const MARKER = { sideM: 0.08, cubeM: 0.1, dictionary: 'DICT_4X4_50', count: 12 };
export const DEPTH = {
	model: '/models/depth-anything-v2-small-fp16.onnx',
	A: { width: 518, height: 294, maxMs: 100 },
	B: { width: 322, height: 182, maxMs: 330 },
	samples: 600,
	iterations: 200,
	minInliers: 0.4,
	tolerance: 0.05
};
// Models stylised to hide a 10 cm cube (origin on the floor, centred).
// The order is the item number and must match src/lib/story/world.ts:
// 0-3 are story objects, 4-9 are waypoints A-F, 10-11 are spare rocks.
const COVER_ROCKS = [
	['barnacle-bill', 'Barnacle Bill'],
	['yogi', 'Yogi'],
	['seis', 'Seismometer'],
	['heat-probe', 'Heat probe'],
	['beacon-a', 'Point A'],
	['beacon-b', 'Point B'],
	['beacon-c', 'Point C'],
	['beacon-d', 'Spot D'],
	['beacon-e', 'Spot E'],
	['beacon-f', 'Point F'],
	['shark', 'Shark'],
	['wedge', 'Wedge']
] as const;
export const ITEM_TYPES = Array.from({ length: MARKER.count }, (_, id) => {
	const [file, name] = COVER_ROCKS[id % COVER_ROCKS.length];
	return {
		id,
		name,
		color: ['#a1aab5', '#d2a768', '#71978c'][id % 3],
		// The procedural rock is shown until this loads, and kept if it fails.
		model: `/assets/models/cover/${file}.glb` as string | null
	};
});
