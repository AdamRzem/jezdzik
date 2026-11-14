/* Classic worker: the pinned OpenCV build includes ArUco + solvePnP. */
let cvReady;
let config;
let detector;
let camera;
let distortion;
let objectPoints;
const canvas = new OffscreenCanvas(1280, 720);
const context = canvas.getContext('2d', { willReadFrequently: true });

async function initialize(settings) {
	config = settings;
	importScripts('/vendor/opencv.js');
	// This pinned Emscripten module is a self-resolving thenable. Awaiting it loops
	// forever; wait for runtime initialization without resolving with the module.
	const cv = self.cv;
	if (!cv.Mat)
		await new Promise((resolve) => {
			cv.onRuntimeInitialized = resolve;
		});
	const dictionary = cv.getPredefinedDictionary(cv[config.dictionary]);
	if (!cv.aruco_ArucoDetector)
		throw new Error('OpenCV build is missing ArUco. Run npm run assets.');
	const parameters = new cv.aruco_DetectorParameters();
	const refine = new cv.aruco_RefineParameters(10, 3, true);
	detector = new cv.aruco_ArucoDetector(dictionary, parameters, refine);
	dictionary.delete();
	parameters.delete();
	refine.delete();
	camera = cv.matFromArray(3, 3, cv.CV_64F, [
		config.fx,
		0,
		config.cx,
		0,
		config.fy,
		config.cy,
		0,
		0,
		1
	]);
	distortion = cv.matFromArray(1, 5, cv.CV_64F, config.distortion);
	const h = config.markerSide / 2;
	objectPoints = cv.matFromArray(4, 3, cv.CV_64F, [-h, h, 0, h, h, 0, h, -h, 0, -h, -h, 0]);
}

self.onmessage = async ({ data }) => {
	if (data.type === 'init') {
		cvReady = initialize(data.config);
		try {
			await cvReady;
			self.postMessage({ type: 'ready' });
		} catch (error) {
			self.postMessage({ type: 'error', message: String(error) });
		}
		return;
	}
	if (data.type !== 'frame') return;
	const bitmap = data.bitmap;
	const allocated = [];
	const keep = (mat) => {
		allocated.push(mat);
		return mat;
	};
	try {
		await cvReady;
		const cv = self.cv;
		context.drawImage(bitmap, 0, 0);
		const src = keep(cv.matFromImageData(context.getImageData(0, 0, 1280, 720)));
		const gray = keep(new cv.Mat());
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
		const corners = keep(new cv.MatVector()),
			ids = keep(new cv.Mat()),
			rejected = keep(new cv.MatVector());
		detector.detectMarkers(gray, corners, ids, rejected);
		const detections = [];
		for (let index = 0; index < ids.rows; index++) {
			const markerCorners = corners.get(index);
			const imagePoints = cv.matFromArray(4, 2, cv.CV_64F, Array.from(markerCorners.data32F));
			const rvec = new cv.Mat(),
				tvec = new cv.Mat(),
				rotation = new cv.Mat();
			try {
				if (
					cv.solvePnP(
						objectPoints,
						imagePoints,
						camera,
						distortion,
						rvec,
						tvec,
						false,
						cv.SOLVEPNP_IPPE_SQUARE
					)
				) {
					cv.Rodrigues(rvec, rotation);
					detections.push({
						id: ids.data32S[index],
						rotation: Array.from(rotation.data64F),
						translation: Array.from(tvec.data64F)
					});
				}
			} finally {
				markerCorners.delete();
				imagePoints.delete();
				rvec.delete();
				tvec.delete();
				rotation.delete();
			}
		}
		self.postMessage({ type: 'markers', e: data.e, f: data.f, detections });
	} catch (error) {
		self.postMessage({ type: 'error', message: String(error) });
	} finally {
		bitmap.close();
		for (const mat of allocated.reverse()) mat.delete();
	}
};
