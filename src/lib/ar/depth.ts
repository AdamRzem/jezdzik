import { DEPTH } from './config';
import type { DepthResult } from './types';

/** One outstanding inference; the caller controls frame dropping and epoch checks. */
export class DepthWorker {
	private worker: Worker;
	private pending: {
		resolve: (result: DepthResult) => void;
		reject: (error: Error) => void;
	} | null = null;
	private readyResolve!: () => void;
	private readyReject!: (error: Error) => void;
	private timer: ReturnType<typeof setTimeout>;
	private inferenceTimer: ReturnType<typeof setTimeout> | undefined;
	private failed: Error | null = null;
	readonly ready: Promise<void>;
	constructor() {
		this.ready = new Promise((resolve, reject) => {
			this.readyResolve = resolve;
			this.readyReject = reject;
		});
		this.worker = new Worker(new URL('./workers/depth.worker.ts', import.meta.url), {
			type: 'module'
		});
		this.timer = setTimeout(
			() => this.fail(new Error('Depth model loading timed out. Run npm run assets first.')),
			60000
		);
		this.worker.onmessage = ({ data }) => {
			if (data.type === 'ready') {
				clearTimeout(this.timer);
				this.readyResolve();
			}
			if (data.type === 'depth') {
				clearTimeout(this.inferenceTimer);
				this.pending?.resolve(data);
				this.pending = null;
			}
			if (data.type === 'error') this.fail(new Error(data.message));
		};
		this.worker.onerror = (event) => this.fail(new Error(event.message || 'Depth worker failed'));
		this.worker.postMessage({ type: 'init' });
	}
	private fail(error: Error) {
		clearTimeout(this.timer);
		clearTimeout(this.inferenceTimer);
		this.failed = error;
		this.readyReject(error);
		this.pending?.reject(error);
		this.pending = null;
		this.worker.terminate();
	}
	async infer(bitmap: ImageBitmap, e: number, f: number, tier: 'A' | 'B') {
		try {
			await this.ready;
		} catch (error) {
			bitmap.close();
			throw error;
		}
		if (this.pending) {
			bitmap.close();
			throw new Error('An inference is already running');
		}
		if (this.failed) {
			bitmap.close();
			throw this.failed;
		}
		return new Promise<DepthResult>((resolve, reject) => {
			this.pending = { resolve, reject };
			this.inferenceTimer = setTimeout(
				() => this.fail(new Error('Depth inference timed out; select tier C.')),
				15000
			);
			this.worker.postMessage({ type: 'frame', bitmap, e, f, ...DEPTH[tier] }, [bitmap]);
		});
	}
	dispose() {
		this.fail(new Error('Depth worker stopped'));
		this.worker.terminate();
	}
}
