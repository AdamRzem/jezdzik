import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.AR_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
	...(process.env.AR_BROWSER_PATH || process.argv[2]
		? { executablePath: process.env.AR_BROWSER_PATH || process.argv[2] }
		: {}),
	args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
async function waitForFocusedPin() {
	await page.waitForFunction(() => {
		const pin = document.querySelector('.pin.chosen')?.getBoundingClientRect();
		const globe = document.querySelector('.globe canvas')?.getBoundingClientRect();
		return (
			pin &&
			globe &&
			Math.abs(pin.x + pin.width / 2 - globe.x - globe.width / 2) < 4 &&
			Math.abs(pin.y + pin.height / 2 - globe.y - globe.height / 2) < 4
		);
	});
}
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
	await page.goto(base);
	await page.getByRole('heading', { name: 'Sojourner', exact: true }).waitFor();
	await page.locator('.pin.chosen').waitFor();
	await waitForFocusedPin();
	await page.screenshot({ path: '/tmp/explorer-desktop.png', fullPage: true });
	assert.equal(await page.locator('.mission-button').count(), 8);
	// Every catalog item is selectable, and only Sojourner offers a playable route.
	const tabs = page.locator('.world-tabs button');
	let total = 0;
	for (let w = 0; w < (await tabs.count()); w++) {
		await tabs.nth(w).click();
		const buttons = page.locator('.mission-button');
		for (let i = 0; i < (await buttons.count()); i++) {
			const name = (await buttons.nth(i).locator('.mission-name').innerText()).split('\n')[0];
			await buttons.nth(i).click();
			await page.getByRole('heading', { name, exact: true }).waitFor();
			assert.equal(await page.locator('.play-button').count(), name === 'Sojourner' ? 1 : 0);
			if (name !== 'Sojourner')
				assert.match(await page.locator('.coming-soon').innerText(), /Coming soon/);
			total++;
		}
	}
	assert.equal(total, 24);
	await tabs.nth(0).click();
	await page.locator('.mission-button').nth(1).focus();
	await page.keyboard.press('Enter');
	await page.getByRole('heading', { name: 'Spirit', exact: true }).waitFor();
	await page.locator('.pin.chosen[aria-label="Select Spirit landing site"]').waitFor();
	assert.match(await page.locator('.pin.chosen').getAttribute('aria-label'), /Spirit/);
	await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
	await tabs.nth(0).click();
	await waitForFocusedPin();
	await page.screenshot({ path: '/tmp/explorer-mobile.png', fullPage: true });
	await page.getByRole('link', { name: 'Play now' }).click();
	await page.waitForURL('**/play');
	await page.waitForFunction(() =>
		document.querySelector('.frame-badge')?.textContent?.match(/F \d/)
	);
	await page.goto(`${base}/?mode=live`);
	await page.waitForURL('**/play?mode=live');
	await page.getByRole('button', { name: 'Connect rover', exact: true }).waitFor();
	const fallback = await browser.newPage();
	await fallback.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (type, ...args) {
			if (String(type).includes('webgl')) return null;
			return original.call(this, type, ...args);
		};
	});
	await fallback.goto(base);
	await fallback.getByText('3D view unavailable').waitFor();
	await fallback.locator('.mission-button').nth(1).click();
	await fallback.getByRole('heading', { name: 'Spirit', exact: true }).waitFor();
	await fallback.close();
	assert.deepEqual(errors, []);
	console.log(
		'Explorer passed: all 24 missions, keyboard selection, globe focus, zoom, mobile, play, legacy live redirect, WebGL fallback.'
	);
} finally {
	await browser.close();
}
