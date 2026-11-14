import * as ort from 'onnxruntime-web/webgpu';
import { cachedBytes } from '../assetCache';
import { DEPTH } from '../config';

let session: ort.InferenceSession | null = null;
let busy = false;
const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext('2d', { willReadFrequently: true })!;

function halfToFloat(value: number) {
	const sign = value & 0x8000 ? -1 : 1,
		exponent = (value >>> 10) & 31,
		mantissa = value & 1023;
	return exponent === 0
		? (sign * 2 ** -14 * mantissa) / 1024
		: exponent === 31
			? mantissa
				? NaN
				: sign * Infinity
			: sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

self.onmessage = async ({ data: message }) => {
	if (message.type === 'init') {
		try {
			ort.env.wasm.numThreads = 1;
			ort.env.wasm.wasmPaths = new URL('/ort/', self.location.href).href;
			if (!('gpu' in navigator)) throw new Error('WebGPU is unavailable. Depth is off.');
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) throw new Error('No WebGPU adapter is available. Depth is off.');
			if (!adapter.features.has('shader-f16'))
				throw new Error('This GPU lacks shader-f16 for the fp16 depth model.');
			ort.env.webgpu.adapter = adapter;
			// The model (50 MB) and the runtime (29 MB) are kept in this browser after the
			// first visit, so a reload does not download them again.
			const started = performance.now();
			const [model, runtime] = await Promise.all([
				cachedBytes(DEPTH.model),
				cachedBytes(ort.env.wasm.wasmPaths + DEPTH.runtime).catch(() => null)
			]);
			// Without a stored runtime, ONNX Runtime downloads its own copy from wasmPaths.
			if (runtime) ort.env.wasm.wasmBinary = runtime.bytes;
			const fetched = performance.now();
			session = await ort.InferenceSession.create(new Uint8Array(model.bytes), {
				executionProviders: ['webgpu'],
				graphOptimizationLevel: 'all'
			});
			self.postMessage({
				type: 'ready',
				source: model.source,
				fetchMs: fetched - started,
				startMs: performance.now() - fetched
			});
		} catch (error) {
			self.postMessage({
				type: 'error',
				message: error instanceof Error ? error.message : String(error)
			});
		}
		return;
	}
	if (message.type !== 'frame') return;
	const bitmap = message.bitmap as ImageBitmap;
	if (!session || busy) {
		bitmap.close();
		return;
	}
	busy = true;
	const started = performance.now();
	let input: ort.Tensor | undefined;
	let outputs: ort.InferenceSession.ReturnType | undefined;
	try {
		const { width, height, e, f } = message;
		const metadata = session.inputMetadata[0];
		if (
			metadata.isTensor &&
			metadata.shape.some(
				(size, index) =>
					typeof size === 'number' && size > 0 && size !== [1, 3, height, width][index]
			)
		) {
			throw new Error(
				'The depth model has fixed input dimensions. Fetch the documented dynamic-shape model.'
			);
		}
		canvas.width = width;
		canvas.height = height;
		context.drawImage(bitmap, 0, 0, width, height);
		const rgba = context.getImageData(0, 0, width, height).data;
		const size = width * height,
			tensor = new Float32Array(3 * size),
			mean = [0.485, 0.456, 0.406],
			std = [0.229, 0.224, 0.225];
		for (let i = 0; i < size; i++)
			for (let channel = 0; channel < 3; channel++)
				tensor[channel * size + i] = (rgba[i * 4 + channel] / 255 - mean[channel]) / std[channel];
		input = new ort.Tensor('float32', tensor, [1, 3, height, width]);
		outputs = await session.run({ [session.inputNames[0]]: input });
		const output = outputs[session.outputNames[0]],
			values = await output.getData();
		const data =
			output.type === 'float16'
				? Float32Array.from(values as Uint16Array, halfToFloat)
				: Float32Array.from(values as Float32Array);
		const dims = output.dims,
			outWidth = dims[dims.length - 1],
			outHeight = dims[dims.length - 2];
		self.postMessage(
			{
				type: 'depth',
				e,
				f,
				width: outWidth,
				height: outHeight,
				data,
				ms: performance.now() - started
			},
			{ transfer: [data.buffer] }
		);
	} catch (error) {
		self.postMessage({
			type: 'error',
			message: error instanceof Error ? error.message : String(error)
		});
	} finally {
		bitmap.close();
		input?.dispose();
		if (outputs) for (const output of Object.values(outputs)) output.dispose();
		busy = false;
	}
};
