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
	private timer: ReturnType<typeof setTimeout> | undefined;
	private stopped = true;
	private attempts = 0;
	constructor(
		private onPose: (pose: Pose) => void,
		private onState: (state: ConnectionState) => void
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
		};
		socket.onmessage = ({ data }) => {
			if (this.stopped || socket !== this.socket) return;
			try {
				const pose: unknown = JSON.parse(data);
				if (isPose(pose)) this.onPose(pose);
			} catch {
				/* Ignore malformed messages. */
			}
		};
		socket.onclose = () => {
			if (this.stopped || socket !== this.socket) return;
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
		clearTimeout(this.timer);
		this.socket?.close();
		this.socket = null;
	}
}
