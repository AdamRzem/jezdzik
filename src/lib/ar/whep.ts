import type { ConnectionState } from './types';

export class WhepClient {
	private peer: RTCPeerConnection | null = null;
	private resource: string | null = null;
	private abort: AbortController | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private stopped = true;
	private attempts = 0;
	constructor(
		private video: HTMLVideoElement,
		private onState: (state: ConnectionState, error?: string) => void
	) {}
	start() {
		this.stopped = false;
		void this.connect();
	}
	private async connect() {
		if (this.stopped) return;
		this.onState(this.attempts ? 'reconnecting' : 'connecting');
		const peer = (this.peer = new RTCPeerConnection({ iceServers: [] }));
		const abort = (this.abort = new AbortController());
		const timeout = setTimeout(() => abort.abort(), 12000);
		peer.addTransceiver('video', { direction: 'recvonly' });
		peer.ontrack = ({ track }) => {
			if (this.stopped || peer !== this.peer) return;
			this.video.srcObject = new MediaStream([track]);
			void this.video
				.play()
				.catch(() => this.onState('error', 'Tap Connect again to allow video playback.'));
			const receiver = peer.getReceivers()[0] as RTCRtpReceiver & { jitterBufferTarget?: number };
			if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
		};
		peer.onconnectionstatechange = () => {
			if (this.stopped || peer !== this.peer) return;
			if (peer.connectionState === 'connected') {
				this.attempts = 0;
				this.onState('connected');
			}
			if (['failed', 'disconnected'].includes(peer.connectionState)) this.retry();
		};
		try {
			await peer.setLocalDescription(await peer.createOffer());
			if (this.stopped || peer !== this.peer || abort.signal.aborted) return;
			// Complete ICE gathering so no PATCH/trickle-ICE implementation is needed.
			await new Promise<void>((resolve, reject) => {
				if (abort.signal.aborted) {
					reject(new Error('Connection cancelled'));
					return;
				}
				if (peer.iceGatheringState === 'complete') {
					resolve();
					return;
				}
				peer.addEventListener('icegatheringstatechange', () => {
					if (peer.iceGatheringState === 'complete') resolve();
				});
				abort.signal.addEventListener('abort', () => reject(new Error('Connection timed out')), {
					once: true
				});
			});
			const endpoint = new URL('/cam/whep', location.href);
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/sdp' },
				body: peer.localDescription!.sdp,
				signal: abort.signal
			});
			if (!response.ok)
				throw new Error(`Video endpoint returned ${response.status}. Check MediaMTX on the Pi.`);
			const resource = response.headers.get('Location');
			if (this.stopped || peer !== this.peer) {
				if (resource) void fetch(new URL(resource, endpoint), { method: 'DELETE' }).catch(() => {});
				return;
			}
			this.resource = resource ? new URL(resource, endpoint).href : null;
			await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
		} catch (error) {
			if (!this.stopped && peer === this.peer) {
				this.onState('error', error instanceof Error ? error.message : 'Video connection failed');
				this.retry();
			}
		} finally {
			clearTimeout(timeout);
		}
	}
	private release() {
		const peer = this.peer;
		this.peer = null;
		this.abort?.abort();
		if (peer) {
			peer.onconnectionstatechange = null;
			peer.ontrack = null;
			peer.close();
		}
		if (this.resource) {
			void fetch(this.resource, { method: 'DELETE', keepalive: true }).catch(() => {});
			this.resource = null;
		}
		const stream = this.video.srcObject;
		if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
		this.video.srcObject = null;
	}
	private retry() {
		if (this.stopped || this.timer) return;
		this.release();
		this.onState('reconnecting');
		this.timer = setTimeout(
			() => {
				this.timer = undefined;
				void this.connect();
			},
			Math.min(8000, 500 * 2 ** this.attempts++)
		);
	}
	stop() {
		this.stopped = true;
		clearTimeout(this.timer);
		this.timer = undefined;
		this.release();
	}
}
