import { STAMP } from './config';

/** CRC-8/SMBUS, polynomial 0x07, init 0, two bytes in network order. */
export function crc8(frame: number): number {
	let crc = 0;
	for (const byte of [frame >>> 8, frame & 255]) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 128 ? 7 : 0)) & 255;
	}
	return crc;
}
export function stampBits(frame: number): number[] {
	frame &= 0xffff;
	return [
		1,
		0,
		...Array.from({ length: 16 }, (_, i) => (frame >>> (15 - i)) & 1),
		...Array.from({ length: 8 }, (_, i) => (crc8(frame) >>> (7 - i)) & 1)
	];
}
export function drawStamp(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	frame: number
) {
	stampBits(frame).forEach((bit, index) => {
		const luma = bit ? STAMP.white : STAMP.black;
		context.fillStyle = `rgb(${luma},${luma},${luma})`;
		context.fillRect(index * STAMP.size, 0, STAMP.size, STAMP.size);
	});
}
export function decodeStamp(image: Pick<ImageData, 'data' | 'width' | 'height'>): number | null {
	if (image.width < STAMP.blocks * STAMP.size || image.height < STAMP.size) return null;
	const levels = Array.from({ length: STAMP.blocks }, (_, block) => {
		let sum = 0;
		for (let y = 6; y < 10; y++)
			for (let x = 6; x < 10; x++) {
				const i = (y * image.width + block * STAMP.size + x) * 4;
				sum += image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
			}
		return sum / 16;
	});
	if (levels[0] - levels[1] < 100) return null;
	const threshold = (levels[0] + levels[1]) / 2;
	const bits = levels.slice(2).map((level) => Number(level > threshold));
	const frame = bits.slice(0, 16).reduce((value, bit) => (value << 1) | bit, 0);
	const checksum = bits.slice(16).reduce((value, bit) => (value << 1) | bit, 0);
	return crc8(frame) === checksum ? frame : null;
}
/** A large discontinuity requires a second CRC-valid frame; never invent numbers. */
export class StampSequence {
	private last: number | null = null;
	private candidate: number | null = null;
	reset() {
		this.last = this.candidate = null;
	}
	invalidate() {
		this.candidate = null;
	}
	accept(frame: number): 'valid' | 'repeat' | 'unknown' {
		if (this.last === null) {
			this.last = frame;
			return 'valid';
		}
		const delta = (frame - this.last + 65536) & 0xffff;
		if (delta === 0) return 'repeat';
		const jump = this.candidate === null ? 0 : (frame - this.candidate + 65536) & 0xffff;
		if (delta <= 90 || (jump >= 1 && jump <= 3)) {
			this.last = frame;
			this.candidate = null;
			return 'valid';
		}
		this.candidate = frame;
		return 'unknown';
	}
}
