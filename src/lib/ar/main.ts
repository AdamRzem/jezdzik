import { CAMERA, MARKER } from './config';
import { DemoSource, DEMO_ITEMS } from './demo';
import { DepthWorker } from './depth';
import { decodeStamp } from './framestamp';
import { ItemStore, itemObservation, markerToItem } from './items';
import { OcclusionProcessor } from './occlusion';
import { PoseBuffer, PoseClient } from './pose';
import { QualityController } from './quality';
import { ARScene } from './scene';
import { FrameSync } from './sync';
import { WhepClient } from './whep';
import type { MarkerResult, Pose, QualityOverride, ViewerStatus, ViewMode } from './types';

export function initialStatus(): ViewerStatus {
	return {
		mode: 'demo',
		video: 'idle',
		socket: 'idle',
		pose: null,
		fps: 0,
		frame: null,
		unknown: 0,
		trackingLost: true,
		tier: 'C',
		depthMs: null,
		fit: 0,
		markers: 'Off',
		depth: 'Off',
		items: [],
		path: [],
		error: null
	};
}

export class Viewer {
	private scene: ARScene;
	private state = initialStatus();
	private items = new ItemStore();
	private sync = new FrameSync();
	private occlusion = new OcclusionProcessor();
	private quality = new QualityController();
	private poses = new PoseBuffer(() => this.resetWorld());
	private socket: PoseClient | null = null;
	private whep: WhepClient | null = null;
	private demo: DemoSource | null = null;
	private marker: Worker | null = null;
	private markerReady = false;
	private markerRequest: Pose | null = null;
	private markerLoadingTimer: ReturnType<typeof setTimeout> | undefined;
	private depth: DepthWorker | null = null;
	private depthReady = false;
	private depthBusy = false;
	private nextDepth = 0;
	private generation = 0;
	private raf = 0;
	private callback = 0;
	private capturing = false;
	private stopped = false;
	private readback = document.createElement('canvas');
	private readbackContext: CanvasRenderingContext2D;
	private lastMatched = 0;
	private fpsStarted = performance.now();
	private frames = 0;
	private published = 0;
	private timer: ReturnType<typeof setInterval>;
	constructor(
		canvas: HTMLCanvasElement,
		private video: HTMLVideoElement,
		private onStatus: (status: ViewerStatus) => void
	) {
		this.scene = new ARScene(canvas);
		this.readback.width = 416;
		this.readback.height = 16;
		this.readbackContext = this.readback.getContext('2d', { willReadFrequently: true })!;
		this.timer = setInterval(() => {
			const now = performance.now();
			if (now - this.fpsStarted >= 1000) {
				this.state.fps = (this.frames * 1000) / (now - this.fpsStarted);
				this.frames = 0;
				this.fpsStarted = now;
			}
			if (
				this.lastMatched &&
				performance.now() - this.lastMatched >= 100 &&
				!this.state.trackingLost
			) {
				this.state.trackingLost = true;
				this.scene.hideObjects();
			}
			this.publish();
		}, 50);
	}
	start(mode: 'demo' | 'live') {
		this.stopSources();
		this.stopped = false;
		this.state = { ...initialStatus(), mode };
		this.resetWorld();
		this.poses.clear();
		this.sync.unknown = 0;
		this.lastMatched = 0;
		this.fpsStarted = performance.now();
		this.frames = 0;
		this.nextDepth = 0;
		const generation = this.generation;
		if (mode === 'demo') {
			this.demo = new DemoSource();
			this.state.video = this.state.socket = 'connected';
			this.state.markers = 'Simulated';
			this.state.depth = 'Simulated geometry';
			this.state.tier = 'B';
			let last = 0;
			const tick = (now: number) => {
				if (this.stopped || generation !== this.generation) return;
				this.raf = requestAnimationFrame(tick);
				if (now - last < 1000 / CAMERA.fps || this.capturing) return;
				last = now;
				const capture = this.demo!.capture(now);
				this.poses.push(capture.pose);
				for (const item of DEMO_ITEMS)
					this.items.update(item, Math.hypot(item.x - capture.pose.x, item.z - capture.pose.z));
				void this.capture(capture.canvas, generation);
			};
			this.raf = requestAnimationFrame(tick);
		} else {
			this.socket = new PoseClient(
				(pose) => this.poses.push(pose),
				(state) => {
					this.state.socket = state;
				}
			);
			this.socket.start();
			this.whep = new WhepClient(this.video, (state, error) => {
				this.state.video = state;
				if (error) this.state.error = error;
				if (state === 'connected') this.state.error = null;
				this.publish(true);
			});
			this.whep.start();
			this.startMarkers();
			this.startDepth();
			if ('requestVideoFrameCallback' in this.video) {
				const tick = () => {
					if (this.stopped || generation !== this.generation) return;
					this.callback = this.video.requestVideoFrameCallback(tick);
					if (!this.capturing) void this.capture(this.video, generation);
				};
				this.callback = this.video.requestVideoFrameCallback(tick);
			} else {
				let lastTime = -1;
				const tick = () => {
					if (this.stopped || generation !== this.generation) return;
					this.raf = requestAnimationFrame(tick);
					if (
						this.video.readyState >= 2 &&
						this.video.currentTime !== lastTime &&
						!this.capturing
					) {
						lastTime = this.video.currentTime;
						void this.capture(this.video, generation);
					}
				};
				this.raf = requestAnimationFrame(tick);
			}
		}
		this.publish(true);
	}
	private resetWorld() {
		this.items.clear();
		this.sync.reset();
		this.occlusion.clear();
		this.scene.clear();
		this.markerRequest = null;
		this.state.pose = null;
		this.state.frame = null;
		this.state.items = [];
		this.state.path = [];
		this.state.trackingLost = true;
		this.state.fit = 0;
		this.scene.hideObjects();
	}
	private async capture(source: HTMLVideoElement | HTMLCanvasElement, generation: number) {
		this.capturing = true;
		let bitmap: ImageBitmap | null = null;
		const epoch = this.poses.epoch;
		try {
			if (
				source instanceof HTMLVideoElement &&
				(source.videoWidth !== CAMERA.width || source.videoHeight !== CAMERA.height)
			) {
				throw new Error(
					`Camera must publish ${CAMERA.width} × ${CAMERA.height}; received ${source.videoWidth} × ${source.videoHeight}.`
				);
			}
			if (source instanceof HTMLVideoElement && typeof VideoFrame !== 'undefined') {
				let frame: VideoFrame | null = null;
				try {
					frame = new VideoFrame(source);
					bitmap = await createImageBitmap(frame);
				} catch {
					bitmap = await createImageBitmap(source);
				} finally {
					frame?.close();
				}
			} else bitmap = await createImageBitmap(source);
			if (this.stopped || generation !== this.generation || epoch !== this.poses.epoch) return;
			this.readbackContext.drawImage(bitmap, 0, 0, 416, 16, 0, 0, 416, 16);
			const frame = decodeStamp(this.readbackContext.getImageData(0, 0, 416, 16));
			const pose = frame === null ? undefined : this.poses.get(frame, epoch);
			const decision = this.sync.decide(frame, pose);
			this.state.unknown = this.sync.unknown;
			if (decision === 'hold' || decision === 'repeat') return;
			if (decision === 'video-only') {
				this.scene.draw(bitmap, undefined, false);
				this.frames++;
				this.state.trackingLost = true;
				return;
			}
			if (!pose) return;
			this.lastMatched = performance.now();
			this.state.trackingLost = false;
			this.state.pose = pose;
			this.state.frame = frame;
			this.state.items = this.items.values();
			this.scene.setItems(this.state.items);
			if (pose.f % 10 === 0) {
				this.state.path.push({ x: pose.x, z: pose.z });
				if (this.state.path.length > 300) this.state.path.shift();
				this.scene.setPath(this.state.path);
			}
			const now = performance.now();
			if (this.demo && now >= this.nextDepth && this.quality.override !== 'C') {
				const started = performance.now(),
					result = this.demo.depth(pose);
				const depth = this.occlusion.process(result, pose, this.state.items);
				this.scene.setDepth(depth);
				this.state.fit = depth?.fit.ratio ?? 0;
				this.state.depthMs = performance.now() - started;
				this.nextDepth = now + 150;
			} else if (!this.demo) this.runWorkers(bitmap, pose, generation);
			this.scene.draw(bitmap, pose, true);
			this.frames++;
		} catch (error) {
			if (generation === this.generation)
				this.state.error = error instanceof Error ? error.message : String(error);
		} finally {
			bitmap?.close();
			if (generation === this.generation) this.capturing = false;
		}
	}
	private startMarkers() {
		const worker = (this.marker = new Worker('/workers/markers.worker.js'));
		this.state.markers = 'Loading OpenCV…';
		const fail = (message: string) => {
			clearTimeout(this.markerLoadingTimer);
			worker.terminate();
			this.marker = null;
			this.markerReady = false;
			this.markerRequest = null;
			this.state.markers = message;
		};
		this.markerLoadingTimer = setTimeout(() => fail('Unavailable · run npm run assets'), 30000);
		worker.onmessage = ({ data }) => {
			if (data.type === 'ready') {
				clearTimeout(this.markerLoadingTimer);
				this.markerReady = true;
				this.state.markers = 'Ready';
			} else if (data.type === 'error') fail(`Unavailable · ${data.message}`);
			else if (data.type === 'markers') this.acceptMarkers(data);
		};
		worker.onerror = () => fail('Unavailable · run npm run assets');
		const d = CAMERA.distortion;
		worker.postMessage({
			type: 'init',
			config: { ...CAMERA, markerSide: MARKER.sideM, distortion: [d.k1, d.k2, d.p1, d.p2, d.k3] }
		});
	}
	private acceptMarkers(result: MarkerResult) {
		const pose = this.markerRequest;
		// An old worker result must not release a newer epoch's outstanding request.
		if (!pose || result.e !== pose.e || result.f !== pose.f) return;
		this.markerRequest = null;
		if (result.e !== this.poses.epoch) return;
		const seen = new Set<number>();
		for (const detection of result.detections) {
			const item = markerToItem(detection, pose);
			if (!item || seen.has(item.id)) continue;
			seen.add(item.id);
			const distance = Math.hypot(item.x - pose.x, item.z - pose.z);
			this.items.update(item, distance);
			this.socket?.send(itemObservation(item, pose));
		}
	}
	private startDepth() {
		if (this.quality.override === 'C') {
			this.state.tier = 'C';
			this.state.depth = 'Off · selected manually';
			return;
		}
		if (!('gpu' in navigator) || !window.isSecureContext) {
			this.state.tier = 'C';
			this.state.depth = 'Off · WebGPU unavailable';
			return;
		}
		this.state.depth = 'Loading depth model…';
		this.quality.set(this.quality.override);
		const depth = (this.depth = new DepthWorker());
		void depth.ready
			.then(() => {
				if (depth === this.depth) {
					this.depthReady = true;
					this.state.depth = 'Ready';
					this.state.tier = this.quality.tier;
				}
			})
			.catch((error) => {
				if (depth === this.depth) {
					this.state.tier = 'C';
					this.state.depth = `Off · ${error instanceof Error ? error.message : 'Depth initialization failed'}`;
					depth.dispose();
					this.depth = null;
				}
			});
	}
	private runWorkers(bitmap: ImageBitmap, pose: Pose, generation: number) {
		const phone = matchMedia('(pointer: coarse)').matches;
		if (this.marker && this.markerReady && !this.markerRequest && (!phone || pose.f % 2 === 0)) {
			const worker = this.marker;
			this.markerRequest = pose;
			void createImageBitmap(bitmap)
				.then((copy) => {
					if (
						generation !== this.generation ||
						pose.e !== this.poses.epoch ||
						worker !== this.marker
					) {
						copy.close();
						return;
					}
					worker.postMessage({ type: 'frame', bitmap: copy, e: pose.e, f: pose.f }, [copy]);
				})
				.catch(() => {
					this.markerRequest = null;
				});
		}
		if (
			this.depth &&
			this.depthReady &&
			!this.depthBusy &&
			this.quality.tier !== 'C' &&
			performance.now() >= this.nextDepth
		) {
			const depth = this.depth,
				tier = this.quality.tier,
				started = performance.now();
			this.depthBusy = true;
			void createImageBitmap(bitmap)
				.then(async (copy) => {
					if (generation !== this.generation || pose.e !== this.poses.epoch) {
						copy.close();
						return;
					}
					const result = await depth.infer(copy, pose.e, pose.f, tier);
					if (generation !== this.generation || result.e !== this.poses.epoch) return;
					const frame = this.occlusion.process(result, pose, this.items.values());
					this.scene.setDepth(frame);
					this.state.fit = frame?.fit.ratio ?? 0;
					this.state.depthMs = performance.now() - started;
					this.state.tier = this.quality.observe(this.state.depthMs);
					this.state.depth =
						this.state.tier === 'C'
							? 'Off · device too slow'
							: frame
								? 'Active'
								: 'Waiting for floor fit';
					if (this.state.tier === 'C') this.scene.setDepth(null);
					this.nextDepth = started + (this.state.tier === 'A' ? 100 : 330);
				})
				.catch((error) => {
					if (generation !== this.generation) return;
					this.state.depth = `Off · ${error instanceof Error ? error.message : 'Inference failed'}`;
					this.state.tier = 'C';
					this.quality.tier = 'C';
					this.scene.setDepth(null);
				})
				.finally(() => {
					if (generation === this.generation) this.depthBusy = false;
				});
		}
	}
	setView(view: ViewMode) {
		this.scene.setView(view);
	}
	setQuality(override: QualityOverride) {
		this.quality.set(override);
		this.nextDepth = 0;
		if (override === 'C') {
			this.scene.setDepth(null);
			this.state.tier = 'C';
			this.state.depth = 'Off · selected manually';
		} else if (this.demo) {
			this.state.tier = override === 'auto' ? 'B' : override;
			this.state.depth = 'Simulated geometry';
		} else if (!this.depth) this.startDepth();
		else {
			this.state.tier = this.quality.tier;
			this.state.depth = 'Ready';
		}
		this.publish(true);
	}
	reset() {
		if (this.demo) this.demo.reset();
		else if (!this.socket?.send({ cmd: 'reset' })) {
			this.state.error = 'Connect the pose channel before resetting.';
			this.publish(true);
		}
	}
	private publish(force = false) {
		if (!force && performance.now() - this.published < 200) return;
		this.published = performance.now();
		this.onStatus({ ...this.state, items: this.items.values(), path: [...this.state.path] });
	}
	private stopSources() {
		this.generation++;
		cancelAnimationFrame(this.raf);
		if (this.callback && 'cancelVideoFrameCallback' in this.video)
			this.video.cancelVideoFrameCallback(this.callback);
		this.callback = 0;
		this.capturing = false;
		this.socket?.stop();
		this.whep?.stop();
		this.demo?.dispose();
		this.marker?.terminate();
		this.depth?.dispose();
		clearTimeout(this.markerLoadingTimer);
		this.socket = this.whep = this.demo = this.marker = this.depth = null;
		this.markerReady = this.depthReady = this.depthBusy = false;
		this.markerRequest = null;
	}
	dispose() {
		this.stopped = true;
		clearInterval(this.timer);
		this.stopSources();
		this.scene.dispose();
	}
}
