export class Fusion {
	q = [1, 0, 0, 0];
	bias = [0, 0, 0];
	calibration: number[][] = [];
	window: number[] = [];
	previous = 0;
	sequence = -1;
	ready = false;
	constructor(
		public settings: { axis_mapping: number[][]; bias_seconds: number; delay_ns: number }
	) {}
	sample(s: number[]) {
		const [seq, us, ...raw] = s;
		if (s.length !== 8 || !s.every(Number.isFinite) || seq <= this.sequence) return null;
		const time = us / 1000 - this.settings.delay_ns / 1e6;
		const dt = (time - this.previous) / 1000;
		if (this.sequence >= 0 && (seq !== this.sequence + 1 || dt <= 0 || dt >= 0.1)) {
			this.ready = false;
			this.calibration = [];
			this.q = [1, 0, 0, 0];
			this.window = [];
		}
		this.sequence = seq;
		this.previous = time;
		const accel = this.settings.axis_mapping.map((row) =>
			row.reduce((v, a, j) => v + (a * raw[j]) / 16384, 0)
		);
		const gyro = this.settings.axis_mapping.map((row) =>
			row.reduce((v, a, j) => v + (a * raw[j + 3]) / 65.5, 0)
		);
		const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
		const std = (a: number[]) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
		if (!this.ready) {
			this.calibration.push(gyro);
			if (this.calibration.length >= Math.round(this.settings.bias_seconds * 200)) {
				const axes = [0, 1, 2].map((i) => this.calibration.map((g) => g[i]));
				if (Math.max(...axes.map(std)) <= 0.2) {
					this.bias = axes.map(mean);
					this.ready = true;
				}
				this.calibration = [];
			}
			return null;
		}
		let omega = gyro.map((g, i) => ((g - this.bias[i]) * Math.PI) / 180);
		const magnitude = Math.hypot(...accel);
		this.window.push(magnitude);
		if (this.window.length > 100) this.window.shift();
		const [w, x, y, z] = this.q;
		if (
			this.window.length === 100 &&
			std(this.window) < 0.01 &&
			Math.abs(magnitude - 1) < 0.05 &&
			(Math.hypot(...omega) * 180) / Math.PI < 0.5
		) {
			const a = accel.map((v) => v / magnitude),
				b = [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)];
			const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
			omega = omega.map((v, i) => v + c[i]);
			this.bias = this.bias.map((v, i) => 0.9999 * v + 0.0001 * gyro[i]);
		}
		const [i, j, k] = omega,
			d = [
				-x * i - y * j - z * k,
				w * i + y * k - z * j,
				w * j - x * k + z * i,
				w * k + x * j - y * i
			];
		const q = this.q.map((v, i) => v + 0.5 * dt * d[i]),
			norm = Math.hypot(...q);
		this.q = q.map((v) => v / norm);
		return { time, q: this.q };
	}
}
export function angles(q: number[]) {
	const [w, x, y, z] = q;
	return {
		yaw: Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)),
		pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z)))),
		roll: Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z))
	};
}
