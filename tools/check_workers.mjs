import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
	...(process.env.AR_BROWSER_PATH || process.argv[2]
		? { executablePath: process.env.AR_BROWSER_PATH || process.argv[2] }
		: {}),
	args: [
		'--use-gl=angle',
		'--use-angle=swiftshader',
		'--enable-unsafe-swiftshader',
		'--enable-unsafe-webgpu'
	]
});
const page = await browser.newPage();
try {
	await page.goto(process.env.AR_BASE_URL || 'http://127.0.0.1:5173/bench');
	const marker = await page.evaluate(async () => {
		const lens = {
			fx: 1653.8,
			fy: 1662.4,
			cx: 640,
			cy: 360,
			markerSide: 0.08,
			distortion: [0, 0, 0, 0, 0]
		};
		const worker = new Worker('/workers/markers.worker.js');
		const receive = (target) =>
			new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('Marker worker timed out')), 30000);
				target.onmessage = ({ data }) => {
					clearTimeout(timeout);
					data.type === 'error' ? reject(new Error(data.message)) : resolve(data);
				};
				target.onerror = (error) => {
					clearTimeout(timeout);
					reject(new Error(error.message));
				};
			});
		const ready = receive(worker);
		worker.postMessage({ type: 'init', config: lens });
		await ready;
		const url = new URL('/vendor/opencv.js', location.href).href;
		const code = `self.onmessage = async () => { try {
 importScripts(${JSON.stringify(url)}); const cv = self.cv;
 if(!cv.Mat) await new Promise(resolve=>{cv.onRuntimeInitialized=resolve;});
 const dictionary=cv.getPredefinedDictionary(cv.DICT_4X4_50), marker=new cv.Mat();
 cv.generateImageMarker(dictionary, 0, 132, marker, 1);
 const canvas=new OffscreenCanvas(1280,720), ctx=canvas.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,1280,720);
 for(let y=0;y<132;y++)for(let x=0;x<132;x++){ctx.fillStyle=marker.data[y*132+x]?'white':'black';ctx.fillRect(574+x,294+y,1,1);}
 const bitmap=canvas.transferToImageBitmap(); marker.delete();dictionary.delete();
 self.postMessage({bitmap},[bitmap]);
 }catch(error){self.postMessage({type:'error',message:String(error)});} };`;
		const blob = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
		const generator = new Worker(blob);
		try {
			const generated = receive(generator);
			generator.postMessage({});
			const { bitmap } = await generated;
			const detected = receive(worker);
			worker.postMessage({ type: 'frame', bitmap, e: 42, f: 7 }, [bitmap]);
			return await detected;
		} finally {
			worker.terminate();
			generator.terminate();
			URL.revokeObjectURL(blob);
		}
	});
	assert.equal(marker.e, 42);
	assert.equal(marker.f, 7);
	assert.equal(marker.detections.length, 1);
	assert.equal(marker.detections[0].id, 0);
	assert.ok(Math.abs(marker.detections[0].translation[2] - 1) < 0.05);
	console.log('OpenCV worker passed: ArUco 4×4_50 detection, solvePnP and epoch/frame tags.');
	const depth = await page.evaluate(async () => {
		if (!('gpu' in navigator) || !(await navigator.gpu.requestAdapter()))
			return { skipped: 'No WebGPU adapter available' };
		if (!(await navigator.gpu.requestAdapter()).features.has('shader-f16'))
			return {
				skipped: 'The available adapter lacks shader-f16, required by the fp16 depth model'
			};
		// This integration check targets a Vite dev server; smoke_browser also tests static builds.
		const moduleURL = performance
			.getEntriesByType('resource')
			.map((entry) => entry.name)
			.find((url) => /\/depth\.(ts|js)(\?|$)/.test(url));
		if (!moduleURL) throw new Error('Depth module URL not found; run this check against Vite dev.');
		const { DepthWorker } = await import(moduleURL);
		const worker = new DepthWorker();
		try {
			await worker.ready;
			const canvas = document.querySelector('canvas');
			const bitmap = await createImageBitmap(canvas);
			const result = await worker.infer(bitmap, 42, 7, 'B');
			return {
				width: result.width,
				height: result.height,
				e: result.e,
				f: result.f,
				finite: result.data.every(Number.isFinite),
				ms: result.ms
			};
		} finally {
			worker.dispose();
		}
	});
	if (depth.skipped)
		console.log(`Depth inference skipped: ${depth.skipped}. Tier C fallback remains available.`);
	else {
		assert.equal(depth.e, 42);
		assert.equal(depth.f, 7);
		assert.equal(depth.finite, true);
		assert.ok(depth.width > 0 && depth.height > 0);
		console.log('Depth worker passed:', depth);
	}
} finally {
	await browser.close();
}
