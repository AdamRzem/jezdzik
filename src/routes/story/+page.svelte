<script lang="ts">
	// The story, full screen, on top of the AR viewer.
	//   /story            simulated camera (demo)
	//   /story?mode=live  the real rover
	// The viewer reports tracked items; this page turns them into story events.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { Viewer } from '#lib/ar/main.js';
	import type { ViewerStatus } from '#lib/ar/types.js';
	import { StoryEngine } from '../../lib/story/engine.svelte';
	import { storyFor } from '../../lib/story/missions';
	import { idOfItem, itemOf } from '../../lib/story/world';
	import Hud from '../../lib/story/Hud.svelte';

	const story = $derived(storyFor(page.url.searchParams.get('mission')));
	const engine = $derived(new StoryEngine(story.steps));
	const FRESH_MS = 1500; // an item counts as "in view" if seen this recently

	let canvas: HTMLCanvasElement;
	let video: HTMLVideoElement;
	let viewer: Viewer | undefined;
	let fatal = $state('');
	let live = $state(false);
	let waiting = $state(false);

	function switchMode() {
		const query = new SvelteURLSearchParams(location.search);
		if (live) query.delete('mode');
		else query.set('mode', 'live');
		location.search = query.toString();
	}

	// Simulation only: W A S D steer the simulated rover.
	const held: Record<string, boolean> = {};
	function steer(event: KeyboardEvent, down: boolean) {
		const key = event.key.toLowerCase();
		if (!'wasd'.includes(key) || key.length !== 1) return;
		held[key] = down;
		viewer?.drive((held.w ? 1 : 0) - (held.s ? 1 : 0), (held.a ? 1 : 0) - (held.d ? 1 : 0));
	}

	function feed(status: ViewerStatus) {
		waiting = status.mode === 'live' && status.frame === null;
		// Simulation only: a carried object travels with the rover.
		viewer?.carry(engine.carrying ? itemOf(engine.carrying) : null);
		const pose = status.pose;
		if (!pose) return;
		const now = performance.now();
		const inView: Record<string, { x: number; z: number }> = {};
		for (const item of status.items) {
			const id = idOfItem(item.id);
			if (!id) continue;
			if (now - item.lastSeen > FRESH_MS) {
				engine.lost(id);
				continue;
			}
			inView[id] = item;
			engine.seen(id, Math.hypot(item.x - pose.x, item.z - pose.z));
		}
		const step = engine.step;
		if (step.kind === 'place') {
			const object = inView[step.object];
			const spot = inView[step.to];
			if (object && spot)
				engine.near(step.object, step.to, Math.hypot(object.x - spot.x, object.z - spot.z));
		}
	}

	onMount(() => {
		live = new URLSearchParams(location.search).get('mode') === 'live';
		try {
			viewer = new Viewer(canvas, video, feed);
			viewer.start(live ? 'live' : 'demo', { course: true });
		} catch (error) {
			fatal =
				error instanceof Error ? error.message : 'The 3D view is unavailable in this browser.';
		}
		return () => viewer?.dispose();
	});
</script>

<svelte:window onkeydown={(e) => steer(e, true)} onkeyup={(e) => steer(e, false)} />

<svelte:head>
	<title>{story.name}: the story</title>
</svelte:head>

<div class="relative h-screen w-screen overflow-hidden bg-black">
	<!-- The video stays in the page under the canvas; hiding it can stop frame callbacks. -->
	<video
		bind:this={video}
		class:camera-flipped={live}
		muted
		autoplay
		playsinline
		class="absolute inset-0 h-full w-full object-contain"
	></video>
	<canvas
		bind:this={canvas}
		width="1280"
		height="720"
		class="absolute inset-0 h-full w-full bg-black object-contain"
	></canvas>

	{#if fatal}
		<p class="absolute inset-x-0 top-1/3 text-center font-mono text-red-300">{fatal}</p>
	{:else if waiting}
		<p class="absolute inset-x-0 top-1/3 text-center font-mono text-amber-200">
			Waiting for the rover’s camera…
		</p>
	{/if}

	<Hud {engine}>
		{#snippet controls()}
			<div
				class="pointer-events-auto mx-4 flex shrink-0 flex-col items-start gap-2 font-mono text-xs text-amber-100/70"
			>
				<button
					class="rounded bg-black/60 px-2 py-1 text-left hover:text-amber-100"
					onclick={switchMode}
				>
					{live ? 'LIVE ROVER · switch to simulation' : 'SIMULATION · connect the rover'}
				</button>
				{#if !live}<p class="rounded bg-black/60 px-2 py-1">W A S D: drive · G: grip</p>{/if}
			</div>
		{/snippet}
	</Hud>
</div>
