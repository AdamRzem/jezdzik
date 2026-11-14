import { describe, expect, it } from 'vitest';
import { sameVersion } from './assetCache';

describe('stored asset versions', () => {
	const stored = {
		etag: 'W/"49642442-1"',
		modified: 'Sat, 14 Nov 2026 21:17:34 GMT',
		length: '49642442'
	};
	it('reuses the stored file while the server still has the same one', () => {
		expect(sameVersion(stored, { ...stored })).toBe(true);
	});
	it('downloads again when the file on the server changed', () => {
		expect(sameVersion(stored, { ...stored, etag: 'W/"49642442-2"' })).toBe(false);
	});
	it('falls back to date and size for servers without an ETag', () => {
		const plain = { ...stored, etag: null };
		expect(sameVersion(plain, { ...plain })).toBe(true);
		expect(sameVersion(plain, { ...plain, length: '1' })).toBe(false);
	});
	it('never trusts a copy whose version cannot be compared', () => {
		const unknown = { etag: null, modified: null, length: null };
		expect(sameVersion(unknown, unknown)).toBe(false);
	});
});
