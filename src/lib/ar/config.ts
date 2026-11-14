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
export const ITEM_TYPES = Array.from({ length: MARKER.count }, (_, id) => ({
	id,
	name: ['Basalt', 'Sandstone', 'Jade'][id % 3],
	color: ['#a1aab5', '#d2a768', '#71978c'][id % 3],
	// Set to a local /assets/*.glb to replace the bundled procedural rock.
	model: null as string | null
}));
