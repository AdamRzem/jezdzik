<script lang="ts">
	// Everything the viewer reads on top of the rover's view: Mission Control's messages,
	// the current goal, the analyse timer, NASA media, result cards and the mission log.
	//
	// Keys: Space or Enter continues, R restarts, left and right arrows step through the story.
	import { onMount, type Snippet } from 'svelte';
	import { StoryEngine } from './engine.svelte';
	import type { Photo, Reading } from './types';

	let { engine, controls }: { engine: StoryEngine; controls?: Snippet } = $props();

	const step = $derived(engine.step);
	const missions = $derived(
		engine.steps.filter((s) => ['goto', 'analyse', 'place'].includes(s.kind))
	);

	// The real photo of this step, and the album picture opened at the end.
	const memory = $derived(StoryEngine.photoOf(step));
	let opened = $state<Photo | null>(null);
	$effect(() => {
		if (engine.stage !== 'done') opened = null;
	});
	const byline = (photo: Photo) =>
		[
			photo.by === 'sojourner'
				? 'Taken by Sojourner’s own camera'
				: photo.by === 'lander'
					? 'Taken by the lander’s camera'
					: '',
			photo.nasaId ? `NASA image ${photo.nasaId}` : '',
			`Credit: ${photo.credit}`
		]
			.filter(Boolean)
			.join(' · ');

	// Typewriter for Mission Control's message
	let shown = $state(0);
	const typing = $derived(engine.stage === 'message' && shown < step.message.length);
	const signalLost = $derived(step.kind === 'signal-lost' && engine.stage === 'message' && !typing);

	$effect(() => {
		void engine.index;
		const length = engine.step.message.length;
		shown = 0;
		const timer = setInterval(() => {
			shown = Math.min(length, shown + 2);
			if (shown >= length) clearInterval(timer);
		}, 28);
		return () => clearInterval(timer);
	});

	function next() {
		if (typing) shown = step.message.length;
		else engine.advance();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			next();
		} else if (event.key === 'r' || event.key === 'R') engine.restart();
		else if (event.key === 'ArrowRight') engine.goTo(engine.index + 1);
		else if (event.key === 'ArrowLeft') engine.goTo(engine.index - 1);
		else if (event.key === 'g' || event.key === 'G') engine.grabbed();
	}

	onMount(() => {
		let last = performance.now();
		let frame = requestAnimationFrame(function loop(now) {
			engine.tick((now - last) / 1000);
			last = now;
			frame = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(frame);
	});

	const panel =
		'pointer-events-auto rounded-lg border border-amber-400/40 bg-black/75 backdrop-blur-sm';
	const button = 'rounded bg-amber-400 px-4 py-2 text-base font-bold text-black hover:bg-amber-300';
</script>

<svelte:window {onkeydown} />

{#snippet tag(real: boolean)}
	<span
		class="rounded px-2 py-0.5 text-xs font-bold tracking-widest {real
			? 'bg-emerald-400 text-black'
			: 'bg-fuchsia-500 text-white'}"
		title={real ? 'This happened.' : 'Part of the game. The result card says what really happened.'}
	>
		{real ? 'REAL' : 'IMAGINED'}
	</span>
{/snippet}

{#snippet credit(photo: Photo)}
	<!-- An external archive link, so there is no app route to resolve. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	{#if photo.page}
		<a class="underline" href={photo.page} target="_blank" rel="noreferrer">{byline(photo)}</a>
	{:else}
		{byline(photo)}
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

<!-- The spectrometer's real reading. `progress` (0 to 1) grows the bars while analysing. -->
{#snippet chart(reading: Reading, progress: number)}
	{@const full = Math.max(...reading.values.flatMap((value) => [value.percent, value.soil]))}
	<div class="text-sm">
		<div class="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100/70">
			<span class="tracking-widest text-amber-300/80 uppercase"
				>Spectrometer reading · sample {reading.sample}</span
			>
			<span>
				<span class="mr-1 inline-block h-2 w-4 rounded-sm bg-emerald-400 align-middle"></span>this
				rock
				<span class="mr-1 ml-3 inline-block h-3 w-0.5 bg-amber-100 align-middle"></span>soil nearby
				({reading.soilSample})
			</span>
		</div>
		{#each reading.values as value (value.formula)}
			<div class="flex items-center gap-2 leading-5">
				<span class="w-12 shrink-0 font-bold">{value.formula}</span>
				<span class="hidden w-24 shrink-0 text-xs text-amber-100/60 sm:block">{value.name}</span>
				<div class="relative h-2.5 flex-1 rounded-sm bg-amber-100/15">
					<div
						class="h-full rounded-sm bg-emerald-400"
						style="width: {(value.percent / full) * progress * 100}%"
					></div>
					<div
						class="absolute -top-0.5 h-3.5 w-0.5 bg-amber-100"
						style="left: {(value.soil / full) * 100}%"
					></div>
				</div>
				<span class="w-14 shrink-0 text-right tabular-nums">
					{progress >= 1 ? `${value.percent.toFixed(1)}%` : '···'}
				</span>
			</div>
		{/each}
	</div>
{/snippet}

<div class="pointer-events-none absolute inset-0 flex flex-col font-mono text-amber-100">
	<!-- Top bar -->
	<header
		class="flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-4"
	>
		<div>
			<div class="text-xs tracking-widest text-amber-300/80 uppercase">
				{step.chapter}
			</div>
			<div class="text-lg font-bold">{step.title}{step.date ? ` · ${step.date}` : ''}</div>
		</div>
		{@render tag(step.real)}
	</header>
	{@render controls?.()}

	<div class="flex min-h-0 flex-1 items-start justify-end p-4">
		<!-- Mission log -->
		<aside class="{panel} hidden w-56 p-3 text-sm md:block">
			<div class="mb-2 text-xs tracking-widest text-amber-300/80 uppercase">Mission log</div>
			<ul class="space-y-1">
				{#each missions as mission (mission.id)}
					{@const done = engine.completed.includes(mission.id)}
					<li
						class={mission.id === step.id
							? 'font-bold text-amber-300'
							: done
								? 'text-amber-100/60'
								: 'text-amber-100/40'}
					>
						{done ? '✔' : mission.id === step.id ? '▶' : '·'}
						{mission.title}
					</li>
				{/each}
			</ul>
		</aside>
	</div>

	<!-- Bottom area -->
	<footer
		class="flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 to-transparent p-4"
	>
		{#if engine.stage === 'done'}
			<section class="{panel} w-full max-w-3xl p-6 text-center">
				<p class="text-2xl font-bold text-amber-300">Abandoned, but not forgotten.</p>
				{#if engine.memories.length}
					<p class="mt-3 text-xs tracking-widest text-amber-300/80 uppercase">
						Sojourner’s memories · real photos from the mission
					</p>
					{#if opened}
						<img src={opened.url} alt={opened.caption} class="mx-auto mt-3 max-h-[24vh] rounded" />
						<p class="mt-2 text-left text-sm leading-relaxed">{opened.caption}</p>
						<p class="mt-1 text-left text-xs text-amber-100/60">{@render credit(opened)}</p>
					{/if}
					<div class="mt-3 flex flex-wrap justify-center gap-2">
						{#each engine.memories as item (item.photo.url)}
							<button
								class="overflow-hidden rounded border-2 {opened === item.photo
									? 'border-amber-300'
									: 'border-transparent hover:border-amber-300/60'}"
								title={item.title}
								onclick={() => (opened = opened === item.photo ? null : item.photo)}
							>
								<img src={item.photo.url} alt={item.title} class="h-12 w-20 object-cover" />
							</button>
						{/each}
					</div>
				{/if}
				<button class="{button} mt-4" onclick={() => engine.restart()}>Start again</button>
			</section>
		{:else if engine.stage === 'message'}
			<section class="{panel} w-full max-w-3xl p-5 {signalLost ? 'border-red-500/70' : ''}">
				<div
					class="mb-2 flex items-center gap-2 text-xs tracking-widest text-amber-300/80 uppercase"
				>
					<span
						class="inline-block h-2 w-2 rounded-full {signalLost
							? 'bg-red-500'
							: 'animate-pulse bg-emerald-400'}"
					></span>
					{step.kind === 'epilogue' ? 'Present day' : 'Mission Control, Pasadena'}
				</div>
				{#if memory && !('result' in step && step.result) && step.kind !== 'goto'}
					<img src={memory.url} alt={memory.caption} class="mx-auto mb-2 max-h-[26vh] rounded" />
					<p class="mb-3 text-xs text-amber-100/60">
						{memory.caption}
						{@render credit(memory)}
					</p>
				{/if}
				<p class="min-h-[4.5rem] text-lg leading-relaxed">
					{step.message.slice(0, shown)}{#if typing}<span class="animate-pulse">▌</span
						>{/if}{#if signalLost}<span class="text-red-400">▒▒▒▒▒▒▒▒</span>{/if}
				</p>
				{#if signalLost}
					<p class="mt-2 text-center text-2xl font-bold tracking-[0.3em] text-red-500">NO SIGNAL</p>
				{/if}
				<div class="mt-3 flex justify-end">
					<button class={button} onclick={next}>{typing ? 'Skip' : 'Continue'}</button>
				</div>
			</section>
		{:else if engine.stage === 'media' && step.kind === 'goto'}
			<section class="{panel} w-full max-w-3xl p-5">
				<div class="mb-3 flex items-center gap-2">
					{@render tag(true)}
					<span class="text-xs tracking-widest text-amber-300/80 uppercase"
						>From NASA’s archive</span
					>
				</div>
				{#if step.media.kind === 'image'}
					<img src={step.media.url} alt={step.media.caption} class="mx-auto max-h-[42vh] rounded" />
				{:else}
					<iframe
						class="aspect-video w-full rounded"
						src="https://www.youtube-nocookie.com/embed/{step.media.id}"
						title={step.media.caption}
						allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					></iframe>
				{/if}
				<p class="mt-3 text-base leading-relaxed">{step.media.caption}</p>
				<div class="mt-3 flex items-center justify-between gap-3">
					<span class="text-xs text-amber-100/60">
						{#if step.media.kind === 'image'}{@render credit(step.media)}{:else}Credit: {step.media
								.credit}{/if}
					</span>
					<button class={button} onclick={next}>Continue</button>
				</div>
			</section>
		{:else if engine.stage === 'result' && 'result' in step && step.result}
			<section class="{panel} max-h-[78vh] w-full max-w-3xl overflow-y-auto p-5">
				<div class="mb-3 flex items-center gap-2">
					{@render tag(true)}
					<span class="text-xs tracking-widest text-amber-300/80 uppercase"
						>What really happened</span
					>
				</div>
				<div class="flex flex-col gap-4 md:flex-row md:items-start">
					{#if memory}
						<figure class="shrink-0 md:w-72">
							<img
								src={memory.url}
								alt={memory.caption}
								class="max-h-[24vh] w-full rounded object-contain"
							/>
							<figcaption class="mt-1 text-xs leading-snug text-amber-100/70">
								{memory.caption}
								<span class="mt-1 block text-amber-100/50">{@render credit(memory)}</span>
							</figcaption>
						</figure>
					{/if}
					<p class="text-lg leading-relaxed">{step.result.text}</p>
				</div>
				{#if engine.reading}
					<div class="mt-4 border-t border-amber-400/30 pt-3">
						{@render chart(engine.reading, 1)}
						<p class="mt-2 text-sm text-amber-100/80">{engine.reading.note}</p>
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="text-xs text-amber-100/60 underline"
							href={engine.reading.sourceUrl}
							target="_blank"
							rel="noreferrer">Measured values: {engine.reading.source}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>
				{/if}
				<div class="mt-3 flex items-center justify-between gap-3">
					<!-- An external source link, so there is no app route to resolve. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class="text-xs text-amber-100/60 underline"
						href={step.result.sourceUrl}
						target="_blank"
						rel="noreferrer"
					>
						Source: {step.result.source}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<button class={button} onclick={next}>Continue</button>
				</div>
			</section>
		{:else}
			<!-- Driving: keep the view clear, show only the goal -->
			<section class="{panel} w-full max-w-3xl p-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<div class="text-xs tracking-widest text-amber-300/80 uppercase">
							Goal{engine.placeStage ? ` · step ${engine.placeStage} of ${engine.placeStages}` : ''}
						</div>
						<div class="text-xl font-bold">{engine.goal}</div>
					</div>
					<div class="text-right text-lg">
						{#if engine.stage === 'scan'}
							{Math.floor(engine.scan * engine.scanHours)} h of {engine.scanHours} h
						{:else if engine.distance !== null}
							{engine.distance.toFixed(2)} m away
						{:else if engine.stage === 'grab'}
							<span class="text-amber-100/60">press G when gripped</span>
						{:else}
							<span class="text-amber-100/60">look around for it</span>
						{/if}
					</div>
				</div>
				{#if engine.stage === 'scan'}
					<div class="mt-3 h-3 overflow-hidden rounded bg-amber-100/20">
						<div class="h-full bg-emerald-400" style="width: {engine.scan * 100}%"></div>
					</div>
					<div class="mt-1 text-xs text-amber-100/60">
						One second here stands for one hour on Mars.
					</div>
					{#if engine.reading}
						<div class="mt-3 border-t border-amber-400/30 pt-3">
							{@render chart(engine.reading, engine.scan)}
						</div>
					{/if}
				{/if}
			</section>
		{/if}
		<div class="text-xs text-amber-100/50">
			Space: continue · R: restart · ← →: jump between steps
		</div>
	</footer>
</div>
