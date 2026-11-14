import { StampSequence } from './framestamp';
import type { Pose } from './types';
export class FrameSync {
	readonly sequence = new StampSequence();
	unknown = 0;
	consecutiveUnknown = 0;
	lastDrawn: number | null = null;
	reset() {
		this.sequence.reset();
		this.consecutiveUnknown = 0;
		this.lastDrawn = null;
	}
	decide(
		frame: number | null,
		pose: Pose | undefined
	): 'matched' | 'hold' | 'video-only' | 'repeat' {
		if (frame === null) this.sequence.invalidate();
		const sequence = frame === null ? 'unknown' : this.sequence.accept(frame);
		if (sequence === 'repeat' && frame === this.lastDrawn) return 'repeat';
		if (sequence !== 'unknown' && pose && pose.f === frame) {
			this.consecutiveUnknown = 0;
			this.lastDrawn = frame;
			return 'matched';
		}
		this.unknown++;
		this.consecutiveUnknown++;
		return this.consecutiveUnknown >= 3 ? 'video-only' : 'hold';
	}
}
