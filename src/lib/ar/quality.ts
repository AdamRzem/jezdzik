import { DEPTH } from './config';
import type { DepthTier, QualityOverride } from './types';

export class QualityController {
	tier: DepthTier = 'A';
	override: QualityOverride = 'auto';
	private samples: number[] = [];
	private measured = false;
	private slowSince: number | null = null;
	set(override: QualityOverride) {
		this.override = override;
		this.tier = override === 'auto' ? 'A' : override;
		this.samples = [];
		this.measured = false;
		this.slowSince = null;
	}
	observe(ms: number, now = performance.now()) {
		if (this.tier === 'C' || this.override !== 'auto') return this.tier;
		this.samples.push(ms);
		if (this.samples.length > 10) this.samples.shift();
		if (this.samples.length < 10) return this.tier;
		const mean = this.samples.reduce((sum, value) => sum + value, 0) / 10;
		if (mean <= DEPTH[this.tier].maxMs) {
			this.slowSince = null;
			this.measured = true;
			return this.tier;
		}
		if (!this.measured || (this.slowSince !== null && now - this.slowSince >= 5000)) {
			this.tier = this.tier === 'A' ? 'B' : 'C';
			this.samples = [];
			this.measured = false;
			this.slowSince = null;
		} else if (this.slowSince === null) this.slowSince = now;
		return this.tier;
	}
}
