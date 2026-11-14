<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { DEPTH } from '#lib/ar/config.js';
	import { DepthWorker } from '#lib/ar/depth.js';
	import { DemoSource } from '#lib/ar/demo.js';
	import { OcclusionProcessor } from '#lib/ar/occlusion.js';
	import type { Pose } from '#lib/ar/types.js';

	let supported = $state(false);
	let running = $state(false);
	let progress = $state('Ready when you are.');
	let error = $state('');
	let results = $state<{ tier: 'A' | 'B'; ms: number; fit: number }[]>([]);
	let preview: HTMLCanvasElement;
	let source = $state.raw<ImageBitmap | null>(null);
	let worker: DepthWorker | null = null;
	let disposed = false;
	let sourceName = $state('Simulated floor · mounted camera geometry');
	const pose: Pose = { e: 1, f: 0, x: 0, z: 0, yaw: 0, pitch: 0, roll: 0, q: 2 };
	let recommendation = $derived(
		results.length === 2 ? (results[0].ms <= 100 ? 'A' : results[1].ms <= 330 ? 'B' : 'C') : null
	);

	onMount(() => {
		supported = window.isSecureContext && 'gpu' in navigator;
		void (async () => {
			let demo: DemoSource | null = null;
			try {
				demo = new DemoSource();
				const capture = demo.capture(performance.now());
				const bitmap = await createImageBitmap(capture.canvas);
				if (disposed) bitmap.close();
				else {
					source = bitmap;
					preview.getContext('2d')!.drawImage(bitmap, 0, 0, 1280, 720);
				}
			} catch (cause) {
				error = String(cause);
			} finally {
				demo?.dispose();
			}
		})();
		return () => {
			disposed = true;
			worker?.dispose();
			source?.close();
		};
	});
	async function chooseFile(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const bitmap = await createImageBitmap(file);
			if (bitmap.width !== 1280 || bitmap.height !== 720) {
				bitmap.close();
				throw new Error('Use a 1280 × 720 still from the configured camera.');
			}
			source?.close();
			source = bitmap;
			sourceName = file.name;
			preview.getContext('2d')!.drawImage(bitmap, 0, 0);
			error = '';
			results = [];
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}
	async function run() {
		if (!source || running) return;
		running = true;
		results = [];
		error = '';
		const depth = (worker = new DepthWorker());
		try {
			progress = 'Loading the local depth model…';
			await depth.ready;
			for (const tier of ['A', 'B'] as const) {
				const occlusion = new OcclusionProcessor();
				const times: number[] = [],
					fits: number[] = [];
				for (let cycle = 0; cycle < 10; cycle++) {
					if (disposed) return;
					progress = `Tier ${tier} · full cycle ${cycle + 1} of 10`;
					const started = performance.now(),
						bitmap = await createImageBitmap(source);
					const result = await depth.infer(bitmap, pose.e, cycle, tier);
					const frame = occlusion.process(result, { ...pose, f: cycle }, []);
					times.push(performance.now() - started);
					fits.push(frame?.fit.ratio ?? 0);
				}
				results = [
					...results,
					{ tier, ms: times.reduce((a, b) => a + b) / 10, fit: fits.reduce((a, b) => a + b) / 10 }
				];
			}
			progress = 'Benchmark complete. Timings include resize, inference, readback and floor fit.';
		} catch (cause) {
			if (!disposed) {
				error = cause instanceof Error ? cause.message : String(cause);
				progress = 'Benchmark stopped.';
			}
		} finally {
			depth.dispose();
			worker = null;
			running = false;
		}
	}
</script>

<svelte:head
	><title>Depth benchmark — Rover</title><meta
		name="description"
		content="Measure the complete browser depth-processing cycle for Rover AR on this device."
	/></svelte:head
>
<div class="bench-shell">
	<header>
		<a class="back-link" href="/"><Icon name="arrow" size={16} /> Back to viewer</a><span
			class="eyebrow">DEVICE BENCHMARK</span
		>
	</header>
	<div class="eyebrow">MEASURE FIRST. EXPLORE SECOND.</div>
	<h1>Find your depth<span>.</span></h1>
	<p class="intro">
		Ten full cycles at each resolution. A useful measure of what your device can do.
	</p>
	<div class="bench-layout">
		<section class="bench-image">
			<canvas bind:this={preview} width="1280" height="720" aria-label="Benchmark camera still"
			></canvas>
			<div>
				<span>{sourceName}</span><label class="file-button"
					>Choose camera still<input
						type="file"
						accept="image/*"
						onchange={chooseFile}
						disabled={running}
					/></label
				>
			</div>
		</section>
		<section class="bench-controls">
			<Icon name="depth" size={28} />
			<h2>All processing stays here.</h2>
			<p>
				Uses the locally installed Depth Anything V2 Small model on this device's GPU. The test
				assumes a stationary camera at 0.127 m and a 10° downward tilt.
			</p>
			<button class="primary-button" onclick={run} disabled={!supported || running}
				>{running ? 'Measuring…' : 'Run benchmark'}<Icon name="arrow" size={16} /></button
			><span class="bench-progress" role="status"
				>{supported
					? progress
					: 'WebGPU is unavailable. Use a supported browser over HTTPS or localhost. Tier C keeps video and objects.'}</span
			>{#if error}<p class="bench-error" role="alert">
					{error} Check that <code>npm run assets</code> has completed.
				</p>{/if}
		</section>
	</div>
	<div class="result-table">
		<div class="result-heading">
			<span>TIER / INPUT SIZE</span><span>MEAN FULL CYCLE</span><span>FLOOR INLIERS</span><span
				>TARGET</span
			>
		</div>
		{#each ['A', 'B'] as tier}{@const result = results.find((entry) => entry.tier === tier)}
			<div>
				<span><strong>{tier}</strong>{tier === 'A' ? '518 × 294' : '322 × 182'}</span><span
					>{result ? `${result.ms.toFixed(1)} ms` : '—'}</span
				><span>{result ? `${(result.fit * 100).toFixed(0)}%` : '—'}</span><span
					class:passed={result && result.ms <= DEPTH[tier as 'A' | 'B'].maxMs}
					>≤ {DEPTH[tier as 'A' | 'B'].maxMs} ms</span
				>
			</div>{/each}
	</div>
	{#if recommendation}<div class="recommendation">
			<Icon name="check" /><span
				>Recommended: <strong>Tier {recommendation}</strong>{recommendation === 'C'
					? ' · depth off, video and objects remain available.'
					: recommendation === 'A'
						? ' · 10 Hz depth at 518 × 294.'
						: ' · 3 Hz depth at 322 × 182.'}</span
			>
		</div>{/if}
	<p class="bench-note">
		The simulated still is for device timing. Use real hall stills for the Phase 0 accuracy gate;
		timing results alone do not validate occlusion or calibration.
	</p>
</div>

<style>
	.bench-shell {
		max-width: 1100px;
		margin: auto;
		padding: 0 32px 40px;
	}
	.bench-shell header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		padding: 28px 0;
		margin-bottom: 54px;
	}
	.back-link {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 12px;
		color: #becbad;
	}
	.back-link :global(svg) {
		transform: rotate(180deg);
	}
	h1 {
		font-size: 44px;
		letter-spacing: -1.7px;
		font-weight: 400;
		margin: 14px 0 10px;
	}
	h1 > span {
		color: var(--accent);
	}
	.intro {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.7;
		margin: 0 0 32px;
	}
	.bench-layout {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 30px;
	}
	.bench-image {
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		background: #1a2116;
		align-self: start;
	}
	.bench-image canvas {
		display: block;
		width: 100%;
		aspect-ratio: 16/9;
	}
	.bench-image > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 9px;
		color: #95a184;
		padding: 14px;
		gap: 12px;
	}
	.file-button {
		color: var(--accent);
		cursor: pointer;
		white-space: nowrap;
	}
	.file-button input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.file-button:focus-within {
		outline: 1px solid var(--accent);
	}
	.bench-controls {
		padding: 10px 0;
	}
	.bench-controls > :global(svg) {
		color: var(--accent);
	}
	h2 {
		font-size: 22px;
		font-weight: 400;
		letter-spacing: -0.5px;
		margin: 19px 0 13px;
	}
	.bench-controls p {
		color: #9ba78c;
		font-size: 12px;
		line-height: 1.8;
		margin: 0 0 22px;
	}
	.bench-controls button {
		width: 100%;
	}
	.bench-progress {
		display: block;
		margin-top: 14px;
		font-size: 10px;
		line-height: 1.8;
		color: #a4b491;
	}
	.bench-controls .bench-error {
		color: #e3bd87;
		font-size: 11px;
		margin-top: 13px;
	}
	.result-table {
		margin-top: 38px;
		border: 1px solid var(--border);
		border-radius: 7px;
		overflow: hidden;
	}
	.result-table > div {
		display: grid;
		grid-template-columns: 1.2fr 1fr 1fr 0.7fr;
		align-items: center;
		gap: 15px;
		padding: 18px 22px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		font-family: monospace;
		color: #c5d0b6;
	}
	.result-table > div:first-child {
		border: 0;
		background: #1c2417;
		font-family: inherit;
		font-size: 8px;
		letter-spacing: 1px;
		color: #8f9f7c;
	}
	.result-table strong {
		display: inline-flex;
		padding: 5px 8px;
		border: 1px solid #4d5d3e;
		border-radius: 4px;
		font-size: 11px;
		color: var(--accent);
		margin-right: 15px;
		font-weight: 400;
	}
	.result-table .passed {
		color: var(--accent);
	}
	.recommendation {
		display: flex;
		align-items: center;
		gap: 12px;
		border: 1px solid #4c6236;
		background: #27351c;
		color: #b9d99b;
		padding: 19px;
		font-size: 12px;
		border-radius: 6px;
		margin-top: 18px;
	}
	.bench-note {
		font-size: 10px;
		line-height: 1.9;
		color: #7c8e68;
		margin-top: 24px;
		max-width: 750px;
	}
	@media (max-width: 700px) {
		.bench-shell {
			padding: 0 18px 30px;
		}
		.bench-shell header {
			margin-bottom: 32px;
			padding: 22px 0;
		}
		.bench-layout {
			grid-template-columns: 1fr;
			gap: 18px;
		}
		h1 {
			font-size: 34px;
		}
		.intro {
			font-size: 12px;
		}
		.bench-controls {
			padding-top: 5px;
		}
		.result-table > div {
			padding: 15px 12px;
			font-size: 10px;
			gap: 8px;
			grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr;
		}
		.result-table > div:first-child {
			font-size: 6px;
			letter-spacing: 0.4px;
		}
		.result-table strong {
			margin-right: 6px;
			padding: 3px 5px;
		}
		.bench-image > div {
			font-size: 8px;
		}
		.recommendation {
			font-size: 11px;
			line-height: 1.8;
		}
	}
</style>
