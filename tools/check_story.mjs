import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.AR_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
	...(process.env.AR_BROWSER_PATH ? { executablePath: process.env.AR_BROWSER_PATH } : {}),
	args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
	await page.goto(base);
	await page.locator('.mission-button').filter({ hasText: 'InSight' }).click();
	await page.getByRole('link', { name: 'Play story' }).click();
	await page.waitForURL('**/story?mission=insight');
	await page.waitForFunction(() => document.title === 'InSight: the story');
	await page.getByText('A quiet place to listen · 26 November 2018', { exact: true }).waitFor();
	assert.equal(await page.locator('aside li').count(), 4);
	await page.getByRole('button', { name: /SIMULATION/ }).click();
	await page.waitForURL('**/story?mission=insight&mode=live');
	await page.waitForFunction(() => document.title === 'InSight: the story');
	await page.getByRole('button', { name: /LIVE ROVER/ }).click();
	await page.waitForURL('**/story?mission=insight');

	// Rehearsal controls exercise each rendered stage. Tracking transitions are unit-tested.
	for (let step = 0; step < 9; step++) {
		const skip = page.getByRole('button', { name: 'Skip', exact: true });
		if (await skip.count()) await skip.click();
		await page.getByRole('button', { name: 'Continue', exact: true }).click();
		if (step >= 1 && step <= 3) {
			await page.keyboard.press('Space'); // arrive
			await page.keyboard.press('g'); // grip
			await page.keyboard.press('Space'); // deliver
		} else if (step === 4) {
			await page.keyboard.press('Space');
			await page.locator('iframe[src*="DLBP-5KoSCc"]').waitFor();
		}
		if (step < 8) await page.getByRole('button', { name: 'Continue', exact: true }).click();
	}
	await page.getByRole('button', { name: 'Start again' }).waitFor();
	await page.screenshot({ path: '/tmp/insight-story-complete.png' });
	await page.getByRole('button', { name: 'Start again' }).click();
	await page.getByText('A quiet place to listen · 26 November 2018', { exact: true }).waitFor();
	await page.setViewportSize({ width: 390, height: 844 });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
	const heading = await page.locator('header').boundingBox();
	const modeSwitch = await page.getByRole('button', { name: /SIMULATION/ }).boundingBox();
	assert.ok(
		modeSwitch.y >= heading.y + heading.height,
		'Mode switch must sit below the wrapped heading'
	);
	await page.screenshot({ path: '/tmp/insight-story-mobile.png' });
	await page.goto(`${base}/story`);
	await page.waitForFunction(() => document.title === 'Sojourner: the story');
	await page.getByText('Briefing · December 1996', { exact: true }).waitFor();
	assert.deepEqual(errors, []);
	console.log(
		'Story passed: explorer entry, mission-preserving mode switch, all InSight stages, completion, restart, mobile width and legacy Sojourner.'
	);
} finally {
	await browser.close();
}
