import { describe, expect, it } from 'vitest';
import { crc8, decodeStamp, stampBits, StampSequence } from './framestamp';

function stamp(frame: number, flip = -1) {
	const width = 416,
		height = 16,
		data = new Uint8ClampedArray(width * height * 4);
	const bits = stampBits(frame);
	if (flip >= 0) bits[flip] ^= 1;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4,
				level = bits[Math.floor(x / 16)] ? 235 : 16;
			data[i] = data[i + 1] = data[i + 2] = level;
			data[i + 3] = 255;
		}
	return { width, height, data };
}

describe('frame stamp', () => {
	it.each([0, 1, 255, 256, 12345, 32768, 65535])('decodes frame %i', (frame) =>
		expect(decodeStamp(stamp(frame))).toBe(frame)
	);
	it('agrees with the independent CRC-8 vector for bytes 0x12, 0x34', () =>
		expect(crc8(0x1234)).toBe(0xf1));
	it('rejects every single corrupted data/checksum block', () => {
		for (let block = 2; block < 26; block++) expect(decodeStamp(stamp(12345, block))).toBeNull();
	});
	it('rejects low reference contrast and incomplete images', () => {
		const image = stamp(5);
		image.data.fill(100);
		expect(decodeStamp(image)).toBeNull();
		expect(decodeStamp({ data: new Uint8ClampedArray(), width: 1, height: 1 })).toBeNull();
	});
	it('accepts wrapping, skips repeats and confirms discontinuities', () => {
		const sequence = new StampSequence();
		expect(sequence.accept(65535)).toBe('valid');
		expect(sequence.accept(0)).toBe('valid');
		expect(sequence.accept(0)).toBe('repeat');
		expect(sequence.accept(91)).toBe('unknown');
		expect(sequence.accept(93)).toBe('valid');
		expect(sequence.accept(3)).toBe('unknown');
		sequence.reset();
		expect(sequence.accept(3)).toBe('valid');
	});
	it('requires consecutive valid stamps to confirm a large jump', () => {
		const sequence = new StampSequence();
		sequence.accept(0);
		sequence.accept(1000);
		sequence.invalidate();
		expect(sequence.accept(1001)).toBe('unknown');
		expect(sequence.accept(1002)).toBe('valid');
	});
});
