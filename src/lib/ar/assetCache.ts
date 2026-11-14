// Keeps big downloads (the depth model, the ONNX runtime) in the browser's IndexedDB.
//
// The HTTP cache cannot be relied on here: the dev server answers "no-cache", and
// Chrome stores nothing for a site whose certificate warning was clicked through,
// which is how the rover's own address is usually opened. IndexedDB works in both
// cases, so after the first visit a reload reads the files from disk.

const DATABASE = 'rover-assets';
const STORE = 'files';

export interface Version {
	etag: string | null;
	modified: string | null;
	length: string | null;
}
interface Entry extends Version {
	bytes: ArrayBuffer;
}
export interface Loaded {
	bytes: ArrayBuffer;
	/** 'stored' came from this browser, 'network' was downloaded now. */
	source: 'stored' | 'network';
}

/** True when the server's copy is the one already stored. Unknown versions never match. */
export function sameVersion(stored: Version, server: Version) {
	if (server.etag || stored.etag) return server.etag === stored.etag;
	if (server.modified || stored.modified)
		return server.modified === stored.modified && server.length === stored.length;
	return false;
}

function versionOf(response: Response): Version {
	return {
		etag: response.headers.get('etag'),
		modified: response.headers.get('last-modified'),
		length: response.headers.get('content-length')
	};
}
function request<T>(action: IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		action.onsuccess = () => resolve(action.result);
		action.onerror = () => reject(action.error);
	});
}
function open() {
	const opening = indexedDB.open(DATABASE, 1);
	opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
	return request(opening);
}

/**
 * The bytes of `url`, from this browser's store when it still matches the server.
 * A quick HEAD request checks for a newer file; if the server cannot be reached,
 * the stored copy is used. Any storage failure falls back to a plain download.
 */
export async function cachedBytes(url: string): Promise<Loaded> {
	let database: IDBDatabase | null = null;
	let stored: Entry | undefined;
	try {
		database = await open();
		stored = await request<Entry | undefined>(
			database.transaction(STORE).objectStore(STORE).get(url)
		);
	} catch {
		/* No usable storage (private window, quota): download as before. */
	}
	if (stored) {
		try {
			const head = await fetch(url, {
				method: 'HEAD',
				cache: 'no-store',
				signal: AbortSignal.timeout(3000)
			});
			if (head.ok && sameVersion(stored, versionOf(head))) {
				database?.close();
				return { bytes: stored.bytes, source: 'stored' };
			}
			if (!head.ok && head.status !== 404) throw new Error(String(head.status));
		} catch {
			// Server unreachable or slow: the stored copy is the best there is.
			database?.close();
			return { bytes: stored.bytes, source: 'stored' };
		}
	}
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) throw new Error(`Could not download ${url} (${response.status})`);
	const bytes = await response.arrayBuffer();
	try {
		if (database) {
			const entry: Entry = { ...versionOf(response), bytes };
			const transaction = database.transaction(STORE, 'readwrite');
			transaction.objectStore(STORE).put(entry, url);
			await new Promise<void>((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onerror = transaction.onabort = () => reject(transaction.error);
			});
		}
	} catch {
		/* Storing is a bonus; the download itself succeeded. */
	} finally {
		database?.close();
	}
	return { bytes, source: 'network' };
}
