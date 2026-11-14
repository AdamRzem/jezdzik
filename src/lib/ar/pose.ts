import { angles } from './imu';
import type { ConnectionState, Observation, Pose } from './types';
export function isPose(value: unknown): value is Pose {
	if (!value || typeof value !== 'object') return false;
	const p = value as Record<string, unknown>;
	return (
		Number.isInteger(p.e) &&
		Number(p.e) >= 0 &&
		Number(p.e) < 2 ** 31 &&
		Number.isInteger(p.f) &&
		Number(p.f) >= 0 &&
		Number(p.f) <= 65535 &&
		typeof p.q === 'number' &&
		[0, 1, 2].includes(p.q) &&
		['x', 'z', 'yaw', 'pitch', 'roll'].every(
			(key) => typeof p[key] === 'number' && Number.isFinite(p[key])
		)
	);
}
export class PoseBuffer {
	epoch: number | null = null;
	private poses = new Map<number, Pose>();
	constructor(
		private onEpoch: (epoch: number) => void = () => {},
		private capacity = 120
	) {}
	push(pose: Pose) {
		if (pose.e !== this.epoch) {
			this.poses.clear();
			this.epoch = pose.e;
			this.onEpoch(pose.e);
		}
		this.poses.delete(pose.f);
		this.poses.set(pose.f, pose);
		if (this.poses.size > this.capacity) this.poses.delete(this.poses.keys().next().value!);
	}
	get(frame: number, epoch = this.epoch) {
		return epoch === this.epoch ? this.poses.get(frame) : undefined;
	}
	clear() {
		this.poses.clear();
		this.epoch = null;
	}
}
export class PoseClient {
	private socket: WebSocket | null = null;
	mode = '';
	private worker: Worker | null = null;
	private epoch = 0;
	private history: { time: number; q: number[] }[] = [];
	private offset = 0;
	private bestRtt = Infinity;
	private pingTimer: ReturnType<typeof setInterval> | undefined;
	private counter = 0;
	framePose(now: number): Pose | undefined {
		const target = now - this.offset - Number(localStorage.getItem('rover.videoDelayMs') || 0);
		const h = this.history;
		if (!h.length || target < h[0].time || target > h[h.length - 1].time + 50) return;
		let q = h[h.length - 1].q;
		for (let i = 1; i < h.length; i++)
			if (h[i].time >= target) {
				const a = h[i - 1],
					b = h[i],
					t = (target - a.time) / (b.time - a.time);
				const sign = a.q.reduce((v, x, j) => v + x * b.q[j], 0) < 0 ? -1 : 1;
				q = a.q.map((v, j) => v * (1 - t) + sign * b.q[j] * t);
				const n = Math.hypot(...q);
				q = q.map((v) => v / n);
				break;
			}
		return { e: this.epoch, f: this.counter++ % 65536, x: 0, z: 0, q: 0, ...angles(q) };
	}

	private timer: ReturnType<typeof setTimeout> | undefined;
	private stopped = true;
	private attempts = 0;
	constructor(
		private onPose: (pose: Pose) => void,
		private onState: (state: ConnectionState) => void,
		private onReset: () => void = () => {}
	) {}
	start() {
		this.stopped = false;
		this.connect();
	}
	private connect() {
		if (this.stopped) return;
		this.onState(this.attempts ? 'reconnecting' : 'connecting');
		const url = new URL('/ws', location.href);
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const socket = (this.socket = new WebSocket(url));
		socket.onopen = () => {
			this.attempts = 0;
			this.onState('connected');
			this.history = [];
			this.bestRtt = Infinity;
			const ping = () => socket.send(JSON.stringify({ cmd: 'ping', t: performance.now() }));
			ping();
			clearInterval(this.pingTimer);
			this.pingTimer = setInterval(ping, 2000);
		};
		socket.onmessage = ({ data }) => {
			if (this.stopped || socket !== this.socket) return;
			try {
				const message = JSON.parse(data);
				if (message.type === 'hello' && message.v === 2) {
					this.mode = message.mode;
					this.epoch = message.e;
					this.history = [];
					this.worker?.terminate();
					this.worker = null;
					this.onReset();
					if (this.mode === 'real') {
						this.worker = new Worker(new URL('./workers/imu.worker.ts', import.meta.url), {
							type: 'module'
						});
						this.worker.onmessage = ({ data }) => {
							if (data.e === this.epoch && data.clear) this.history = [];
							if (data.e === this.epoch)
								this.history = [...this.history, ...data.history].slice(-2400);
						};
						this.worker.postMessage(message);
					}
					return;
				}
				if (message.type === 'pong') {
					const now = performance.now(),
						rtt = now - message.t;
					if (rtt < this.bestRtt) {
						this.bestRtt = rtt;
						this.offset = (now + message.t) / 2 - message.us / 1000;
					}
					return;
				}
				if (message.type === 'imu') {
					this.worker?.postMessage(message);
					return;
				}
				const pose: unknown = message;
				if (isPose(pose)) this.onPose(pose);
			} catch {
				/* Ignore malformed messages. */
			}
		};
		socket.onclose = () => {
			if (this.stopped || socket !== this.socket) return;
			clearInterval(this.pingTimer);
			this.history = [];
			this.worker?.terminate();
			this.onReset();
			this.onState('reconnecting');
			this.timer = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.attempts++));
		};
		socket.onerror = () => socket.close();
	}
	send(command: { cmd: 'reset' } | Observation) {
		if (this.socket?.readyState !== WebSocket.OPEN) return false;
		this.socket.send(JSON.stringify(command));
		return true;
	}
	stop() {
		this.stopped = true;
		clearInterval(this.pingTimer);
		this.worker?.terminate();
		this.history = [];
		clearTimeout(this.timer);
		this.socket?.close();
		this.socket = null;
	}
}
