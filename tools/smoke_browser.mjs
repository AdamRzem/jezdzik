import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.AR_BASE_URL || process.argv[3] || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
	...(process.env.AR_BROWSER_PATH || process.argv[2]
		? { executablePath: process.env.AR_BROWSER_PATH || process.argv[2] }
		: {}),
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
	if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (response) => {
	if (response.status() >= 400) console.log(`HTTP ${response.status()} ${response.url()}`);
});
try {
	await page.goto(base);
	await page.waitForFunction(() =>
		document.querySelector('.frame-badge')?.textContent?.match(/F \d/)
	);
	assert.equal(await page.locator('.object-row').count(), 3);
	await page.getByRole('button', { name: 'Floor grid', exact: true }).click();
	assert.equal(
		await page
			.getByRole('button', { name: 'Floor grid', exact: true })
			.getAttribute('aria-pressed'),
		'true'
	);
	await page.getByRole('button', { name: 'Depth', exact: true }).click();
	await page.getByRole('button', { name: 'Objects', exact: true }).click();
	const before = await page.locator('.mono').textContent();
	await page.getByRole('button', { name: 'Reset world frame' }).click();
	assert.equal(await page.locator('dialog[open]').count(), 1);
	await page.getByRole('button', { name: 'Reset frame', exact: true }).click();
	await page.waitForFunction(
		(epoch) => document.querySelector('.mono')?.textContent !== epoch,
		before
	);
	await page.getByRole('button', { name: 'Viewer settings' }).click();
	await page.getByLabel('Occlusion quality').selectOption('C');
	await page.getByRole('button', { name: 'Close settings' }).click();
	await page.screenshot({ path: '/tmp/rover-desktop.png', fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
	await page.screenshot({ path: '/tmp/rover-mobile.png', fullPage: true });
	await page.goto(`${base}/bench`);
	await page.getByRole('heading', { name: 'Find your depth.' }).waitFor();
	await page.waitForFunction(() => document.querySelector('.bench-image canvas'));
	assert.equal(await page.locator('.result-table>div').count(), 3);
	assert.deepEqual(errors, []);
	console.log(
		'Browser checks passed: demo, objects, layers, reset, settings, mobile layout and benchmark.'
	);
} finally {
	await browser.close();
}
