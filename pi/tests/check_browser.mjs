import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Real backend integration: do not intercept WHEP, video or WebSocket traffic.
const browser = await chromium.launch({
	...(process.env.AR_BROWSER_PATH ? { executablePath: process.env.AR_BROWSER_PATH } : {}),
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
try {
	const failures = [];
	const endpoint = `${process.env.AR_BASE_URL || 'http://127.0.0.1:5173'}/play?mode=live`;
	const openViewer = async () => {
		const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
		page.on('pageerror', (error) => failures.push(error.message));
		await page.goto(endpoint);
		await waitForTracking(page);
		await page.waitForFunction(
			() => Number(document.querySelector('.count-badge')?.textContent) >= 1
		);
		return page;
	};
	const waitForTracking = (page) =>
		page.waitForFunction(
			() => document.querySelector('.tracking-badge')?.textContent?.trim() === 'Tracking',
			undefined,
			{ timeout: 30000 }
		);
	const first = await openViewer();
	const second = await openViewer();
	assert.equal(await first.getByRole('button', { name: 'Pi mock', exact: true }).count(), 0);
	const epoch = await first.locator('.mono').textContent();
	assert.equal(await second.locator('.mono').textContent(), epoch);
	await first.getByRole('button', { name: 'Reset world frame' }).click();
	await first.getByRole('button', { name: 'Reset frame', exact: true }).click();
	for (const page of [first, second]) {
		await page.waitForFunction((old) => {
			const next = document.querySelector('.mono')?.textContent;
			return next && next !== '—' && next !== old;
		}, epoch);
		await waitForTracking(page);
		await page.waitForFunction(
			() => Number(document.querySelector('.count-badge')?.textContent) >= 1
		);
	}
	assert.equal(
		await first.locator('.mono').textContent(),
		await second.locator('.mono').textContent()
	);
	await first.screenshot({ path: '/tmp/rover-pipeline.png' });
	assert.deepEqual(failures, []);
	console.log(
		'Rover pipeline passed: two unchanged live viewers, WHEP/H.264, pixel CRC/pose sync, real markers and shared reset recovery.'
	);
} finally {
	await browser.close();
}
