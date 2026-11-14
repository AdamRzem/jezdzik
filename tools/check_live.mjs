import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// A browser-local publisher exercises the real WHEP/WebRTC and WebSocket clients.
// It exists only in this test; the application still labels hardware-free use Demo.
const browser = await chromium.launch({
	...(process.env.AR_BROWSER_PATH || process.argv[2]
		? { executablePath: process.env.AR_BROWSER_PATH || process.argv[2] }
		: {}),
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
let socket;
let sendPoses = true;
let epoch = 1234;
await page.exposeFunction('publishTestPose', (f) => {
	if (socket && sendPoses)
		socket.send(JSON.stringify({ e: epoch, f, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 }));
});
await page.routeWebSocket('**/ws', (client) => {
	socket = client;
	client.onMessage((message) => {
		if (JSON.parse(String(message)).cmd === 'reset') epoch++;
	});
});
await page.route('**/cam/whep', async (route) => {
	if (route.request().method() !== 'POST') {
		await route.fulfill({ status: 204 });
		return;
	}
	const sdp = await page.evaluate(async (offer) => {
		const canvas = document.createElement('canvas');
		canvas.width = 1280;
		canvas.height = 720;
		const ctx = canvas.getContext('2d');
		let f = 0;
		const draw = () => {
			ctx.fillStyle = '#9b967e';
			ctx.fillRect(0, 0, 1280, 720);
			let crc = 0;
			for (const byte of [f >>> 8, f & 255]) {
				crc ^= byte;
				for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 128 ? 7 : 0)) & 255;
			}
			const bits = [
				1,
				0,
				...Array.from({ length: 16 }, (_, i) => (f >>> (15 - i)) & 1),
				...Array.from({ length: 8 }, (_, i) => (crc >>> (7 - i)) & 1)
			];
			bits.forEach((bit, block) => {
				ctx.fillStyle = bit ? 'rgb(235,235,235)' : 'rgb(16,16,16)';
				ctx.fillRect(block * 16, 0, 16, 16);
			});
			void window.publishTestPose(f);
			f = (f + 1) & 65535;
		};
		draw();
		window.testFrameTimer = setInterval(draw, 1000 / 30);
		const publisher = (window.testPublisher = new RTCPeerConnection({ iceServers: [] }));
		const track = canvas.captureStream(30).getVideoTracks()[0];
		publisher.addTrack(track);
		await publisher.setRemoteDescription({ type: 'offer', sdp: offer });
		await publisher.setLocalDescription(await publisher.createAnswer());
		await new Promise((resolve) => {
			if (publisher.iceGatheringState === 'complete') resolve();
			else
				publisher.onicegatheringstatechange = () => {
					if (publisher.iceGatheringState === 'complete') resolve();
				};
		});
		return publisher.localDescription.sdp;
	}, route.request().postData());
	await route.fulfill({
		status: 201,
		headers: { 'Content-Type': 'application/sdp', Location: '/cam/session/test' },
		body: sdp
	});
});
await page.route('**/cam/session/test', (route) => route.fulfill({ status: 204 }));
try {
	await page.goto(
		`${process.env.AR_BASE_URL || process.argv[3] || 'http://127.0.0.1:5173'}/?mode=live`
	);
	await page.waitForFunction(
		() => document.querySelector('.tracking-badge')?.textContent?.trim() === 'Tracking',
		{ timeout: 30000 }
	);
	assert.equal(await page.locator('.mono').textContent(), '1234');
	assert.match(await page.locator('.frame-badge').textContent(), /F \d/);
	sendPoses = false;
	await page.waitForFunction(() =>
		document.querySelector('.tracking-badge')?.textContent?.includes('Waiting for frames')
	);
	await page.waitForFunction(
		() =>
			Number(
				document.querySelector('.telemetry>div:last-child strong')?.childNodes[0]?.textContent
			) >= 3
	);
	sendPoses = true;
	await page.waitForFunction(
		() => document.querySelector('.tracking-badge')?.textContent?.trim() === 'Tracking'
	);
	await page.getByRole('button', { name: 'Reset world frame' }).click();
	await page.getByRole('button', { name: 'Reset frame', exact: true }).click();
	await page.waitForFunction(() => document.querySelector('.mono')?.textContent === '1235');
	assert.deepEqual(failures, []);
	console.log(
		'Live-client check passed: WHEP negotiation, streamed CRC stamps, exact pose matching, sync-loss recovery and reset epoch.'
	);
} finally {
	await browser.close();
}
