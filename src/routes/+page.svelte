<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Globe from '#lib/explorer/Globe.svelte';
	import {
		missions,
		worlds,
		coordinates,
		type World,
		type Mission
	} from '#lib/explorer/missions.js';
	let world = $state<World>('Mars');
	let selected = $state<Mission>(missions[0]);
	let entries = $derived(missions.filter((m) => m.world === world));
	function chooseWorld(next: World) {
		world = next;
		selected = missions.find((m) => m.world === next)!;
	}
	function select(m: Mission) {
		selected = m;
	}
	onMount(() => {
		if (new URLSearchParams(location.search).get('mode') === 'live')
			void goto('/play?mode=live', { replaceState: true });
	});
</script>

<svelte:head
	><title>Rover — Stories left among the stars</title><meta
		name="description"
		content="Explore the landing sites and stories of NASA’s retired spacecraft. Discover 24 missions across the Moon, Mars, and beyond. Play the Sojourner experience."
	/></svelte:head
>
<div class="explorer-page">
	<header class="explorer-header">
		<a href="/" class="wordmark" aria-label="Rover home"
			><span class="logo-orbit">✳</span> rover<span class="period">.</span><span class="brand-tag"
				>THE MISSION ARCHIVE</span
			></a
		><a class="header-link" href="#missions">Explore missions <span>↗</span></a>
	</header>
	<main class="explorer-main">
		<section class="intro">
			<div class="intro-copy">
				<p class="eyeline"><span></span> LEFT BEHIND. NOT FORGOTTEN.</p>
				<h1>Their missions ended.<br />Their stories <em>remain.</em></h1>
				<p class="intro-description">
					Across distant worlds, our explorers are still out there.<br class="desktop-break" /> Find where
					they landed. Discover what they left behind.
				</p>
			</div>
			<div class="intro-aside">
				<span class="orbit-symbol" aria-hidden="true">◎</span>
				<p>A new perspective on<br />the things we leave behind.</p>
				<span class="archive-index">EST. 1966 — STILL OUT THERE</span>
			</div>
		</section>
		<section id="missions" class="mission-explorer" aria-label="Mission explorer">
			<div class="explorer-top">
				<div class="world-tabs" aria-label="Choose a destination">
					{#each worlds as destination}<button
							class:active={world === destination}
							aria-pressed={world === destination}
							onclick={() => chooseWorld(destination)}
							><span class="world-dot" class:mars={destination === 'Mars'}
							></span>{destination}<small
								>{missions
									.filter((m) => m.world === destination)
									.length.toString()
									.padStart(2, '0')}</small
							></button
						>{/each}
				</div>
				<span class="live-key"><i></i> 1 EXPERIENCE AVAILABLE</span>
			</div>
			<div class="explorer-body">
				<aside class="mission-list">
					<div class="list-heading">
						<span>SELECT A MISSION</span><span>{entries.length.toString().padStart(2, '0')}</span>
					</div>
					<div class="mission-buttons">
						{#each entries as m}<button
								class="mission-button"
								class:active={selected.id === m.id}
								aria-pressed={selected.id === m.id}
								onclick={() => select(m)}
								><span class="mission-icon" aria-hidden="true"
									>{m.kind === 'Rover'
										? '⊞'
										: m.kind === 'Helicopter'
											? '✣'
											: m.location.type === 'surface'
												? '⌁'
												: '↗'}</span
								><span class="mission-name">{m.name}<small>{m.kind} <b>·</b> {m.year}</small></span
								><span class="mission-status" class:available={!!m.play}>{m.play ? '●' : '↗'}</span
								></button
							>{/each}
					</div>
					<p class="list-foot">Different journeys.<br />A shared place in our story.</p>
				</aside>
				<div class="world-stage">
					<div class="world-caption">
						<span>DESTINATION / {String(worlds.indexOf(world) + 1).padStart(2, '0')}</span>
						<h2>{world === 'Moon' ? 'The Moon' : world}</h2>
						<p>
							{world === 'Mars'
								? 'THE RED PLANET'
								: world === 'Moon'
									? 'OUR NEAREST NEIGHBOR'
									: world === 'Ceres'
										? 'THE DWARF PLANET'
										: world === 'Eros'
											? 'ASTEROID 433'
											: 'BEYOND THE HORIZON'}
						</p>
					</div>
					{#if world === 'Deep space'}<div class="space-diagram">
							<svg
								viewBox="0 0 500 400"
								role="img"
								aria-label="Schematic of Kepler’s solar orbit and Pioneer outbound trajectories, not to scale"
								><defs
									><radialGradient id="sun-glow"
										><stop stop-color="#e5c88a" stop-opacity=".25" /><stop
											offset="1"
											stop-color="#e5c88a"
											stop-opacity="0"
										/></radialGradient
									></defs
								><circle cx="230" cy="225" r="115" fill="url(#sun-glow)" /><g
									fill="none"
									stroke="#78816e"
									stroke-width=".7"
									><ellipse cx="230" cy="225" rx="90" ry="57" /><ellipse
										cx="230"
										cy="225"
										rx="150"
										ry="97"
									/><ellipse cx="230" cy="225" rx="205" ry="135" stroke-dasharray="3 7" /><path
										d="M230 225 Q320 170 422 62"
									/><path d="M230 225 Q115 250 60 90" /></g
								><circle cx="230" cy="225" r="12" fill="#d8bd82" /><text
									x="230"
									y="257"
									fill="#9f9f8b"
									text-anchor="middle"
									font-size="10">SUN</text
								><circle cx="310" cy="199" r="4" fill="#92a5ae" /><text
									x="320"
									y="195"
									fill="#9fa9aa"
									font-size="9">EARTH</text
								></svg
							><button
								class="space-pin pioneer10"
								class:chosen={selected.id === 'pioneer-10'}
								onclick={() => select(entries[0])}>↗ Pioneer 10</button
							><button
								class="space-pin pioneer11"
								class:chosen={selected.id === 'pioneer-11'}
								onclick={() => select(entries[1])}>↖ Pioneer 11</button
							><button
								class="space-pin kepler"
								class:chosen={selected.id === 'kepler'}
								onclick={() => select(entries[2])}>◇ Kepler</button
							>
						</div>{:else}{#key world}<Globe
								{world}
								missions={entries}
								{selected}
								onselect={select}
							/>{/key}{/if}
					<div class="world-bottom">
						<span
							>{world === 'Deep space'
								? 'SCHEMATIC · NOT TO SCALE'
								: world === 'Ceres'
									? 'ILLUSTRATIVE GLOBE · SCHEMATIC ORBIT'
									: world === 'Eros'
										? 'ILLUSTRATIVE SHAPE · APPROXIMATE SITE'
										: 'ORIGINAL LANDING SITES'}</span
						><small
							>{world === 'Deep space'
								? 'Illustrated trajectories, not current positions'
								: '↔ Drag to rotate · + / − to zoom'}</small
						>
					</div>
				</div>
				<section class="mission-detail" aria-label="Selected mission" aria-live="polite">
					<div class="detail-top">
						<span class="detail-label">MISSION FILE</span><span class="file-number"
							>{String(missions.findIndex((m) => m.id === selected.id) + 1).padStart(3, '0')} / 024</span
						>
					</div>
					<span class="availability" class:playable={!!(selected.play || selected.story)}
						>{selected.play || selected.story ? '● READY TO EXPLORE' : '◷ COMING SOON'}</span
					>
					<h2>{selected.name}</h2>
					<p class="mission-type">{selected.kind} <span> / </span> {selected.year}</p>
					<p class="mission-description">{selected.description}</p>
					<dl>
						<div>
							<dt>{selected.location.type === 'surface' ? 'LANDING SITE' : 'LOCATION'}</dt>
							<dd>{selected.site}</dd>
						</div>
						<div>
							<dt>{selected.location.type === 'surface' ? 'COORDINATES' : 'ENVIRONMENT'}</dt>
							<dd class="coordinate-value">{coordinates(selected)}</dd>
						</div>
					</dl>
					<div class="remains">
						<span>STILL OUT THERE</span>
						<p>{selected.remains}</p>
					</div>
					{#if selected.play}
						<a class="play-button" href={selected.play}>Play now <span>↗</span></a>
						<p class="play-caption" class:tight={selected.story}>Step into the rover experience</p>
					{/if}
					{#if selected.story}
						<a class="play-button" class:story-button={!!selected.play} href={selected.story}
							>Play story <span>↗</span></a
						>
						<p class="play-caption">Follow the mission story</p>
					{/if}
					{#if !selected.play && !selected.story}
						<div class="coming-soon">Coming soon <span>◷</span></div>
						<p class="play-caption">This story is waiting to be explored</p>
					{/if}
					<a class="source-link" href={selected.source} target="_blank" rel="noreferrer"
						>NASA mission record <span>↗</span></a
					>
				</section>
			</div>
		</section>
		<section class="closing">
			<span class="closing-icon" aria-hidden="true">✧</span>
			<div>
				<h2>Exploration leaves a trace.</h2>
				<p>A wheel track. A silent instrument. A story worth telling.</p>
			</div>
			<span class="closing-number">24 <small>MISSIONS. COUNTLESS STORIES.</small></span>
		</section>
	</main>
	<footer class="explorer-footer">
		<span>rover. <small>A tribute to the explorers that stayed.</small></span>
		<details>
			<summary>Sources & credits</summary>
			<p>
				Mission research: NASA, JPL and NSSDCA. Mars and Moon textures: <a
					href="https://www.solarsystemscope.com/textures/"
					target="_blank"
					rel="noreferrer">Solar System Scope</a
				>,
				<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer"
					>CC BY 4.0</a
				>. Ceres, Eros and trajectory views are illustrative. Independent project; not affiliated
				with NASA.
			</p>
		</details>
		<a
			href="https://www.spaceappschallenge.org/2026/challenges/nasas-discarded-equipment-storytelling/?tab=resources"
			target="_blank"
			rel="noreferrer">INSPIRED BY NASA SPACE APPS ↗</a
		>
	</footer>
</div>

<style>
	.explorer-page {
		--line: #30382e;
		--soft: #8f998a;
		color: #e7eadf;
		background: #101510;
		min-height: 100vh;
		font-family: Inter, 'Segoe UI', Arial, sans-serif;
	}
	.explorer-header {
		height: 88px;
		max-width: 1480px;
		margin: auto;
		padding: 0 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #293126;
	}
	.wordmark {
		display: flex;
		align-items: center;
		font-size: 29px;
		font-weight: 700;
		letter-spacing: -1.3px;
	}
	.logo-orbit {
		font-size: 35px;
		color: #c1e58b;
		margin-right: 10px;
		font-weight: 400;
	}
	.period {
		color: #c1e58b;
	}
	.brand-tag {
		font-size: 9px;
		font-weight: 400;
		letter-spacing: 1.8px;
		color: #a4ad9b;
		margin-left: 25px;
		padding-left: 25px;
		border-left: 1px solid #3a4234;
	}
	.header-link {
		font-size: 12px;
		color: #c9cebf;
	}
	.header-link span {
		margin-left: 24px;
		color: #c1e58b;
	}
	.explorer-main {
		max-width: 1480px;
		margin: auto;
		padding: 0 56px;
	}
	.intro {
		display: flex;
		justify-content: space-between;
		padding: 57px 0 44px;
		align-items: center;
	}
	.eyeline {
		font-size: 9px;
		letter-spacing: 2px;
		color: #b3c29f;
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 23px;
	}
	.eyeline > span {
		width: 5px;
		height: 5px;
		border-radius: 100%;
		background: #c1e58b;
	}
	h1 {
		font-weight: 400;
		font-size: clamp(34px, 3.8vw, 57px);
		line-height: 1.13;
		letter-spacing: -2.4px;
		margin: 0;
	}
	h1 em {
		font-family: Georgia, serif;
		color: #c1e58b;
		font-weight: 400;
	}
	.intro-description {
		color: #a0a898;
		font-size: 13px;
		line-height: 1.9;
		margin: 23px 0 0;
	}
	.intro-aside {
		text-align: right;
		padding-top: 20px;
	}
	.orbit-symbol {
		font-size: 54px;
		font-weight: 200;
		color: #859775;
	}
	.intro-aside p {
		font-size: 12px;
		line-height: 1.7;
		color: #a7b09f;
		margin: 10px 0 20px;
	}
	.archive-index {
		font-family: monospace;
		font-size: 8px;
		letter-spacing: 1.5px;
		color: #6f7e64;
	}
	.mission-explorer {
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		scroll-margin-top: 20px;
	}
	.explorer-top {
		height: 65px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 24px;
		border-bottom: 1px solid var(--line);
		background: #171d15;
	}
	.world-tabs {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.world-tabs button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 13px;
		font-size: 11px;
		color: #a2ad96;
		background: none;
		border-radius: 5px;
		border: 1px solid transparent;
		white-space: nowrap;
	}
	.world-tabs button.active {
		background: #293321;
		color: #dbedc1;
		border-color: #45513a;
	}
	.world-tabs small {
		font-family: monospace;
		font-size: 8px;
		color: #8d9b7f;
	}
	.world-dot {
		width: 9px;
		height: 9px;
		border-radius: 100%;
		background: linear-gradient(120deg, #a3a69b, #444a3f);
		box-shadow: inset -2px -1px 2px #0007;
	}
	.world-dot.mars {
		background: linear-gradient(120deg, #d19871, #7d4e34);
	}
	.live-key {
		font-size: 8px;
		letter-spacing: 1px;
		color: #9fad91;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.live-key i {
		width: 4px;
		height: 4px;
		background: #c1e58b;
		border-radius: 50%;
	}
	.explorer-body {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr) 300px;
		min-height: 590px;
	}
	.mission-list {
		padding: 25px 15px 18px;
		border-right: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		background: #141a12;
	}
	.list-heading {
		display: flex;
		justify-content: space-between;
		color: #9aa78d;
		font-size: 8px;
		letter-spacing: 1.2px;
		margin: 0 10px 20px;
	}
	.mission-buttons {
		max-height: 456px;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: #45543b transparent;
		padding: 1px;
	}
	.mission-button {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		padding: 13px 10px;
		background: none;
		color: #c5cdbd;
		text-align: left;
		border: 1px solid transparent;
		border-radius: 5px;
		margin-bottom: 4px;
	}
	.mission-button.active {
		background: #25321d;
		border-color: #465a34;
		color: #e6efd9;
	}
	.mission-icon {
		font-size: 19px;
		color: #8f9b80;
		width: 21px;
		text-align: center;
	}
	.mission-button.active .mission-icon {
		color: #c1e58b;
	}
	.mission-name {
		font-size: 11px;
		flex: 1;
	}
	.mission-name small {
		display: block;
		font-size: 9px;
		color: #98a28c;
		margin-top: 5px;
	}
	.mission-name b {
		font-weight: 400;
		margin: 0 3px;
		color: #637059;
	}
	.mission-status {
		font-size: 13px;
		color: #76856a;
	}
	.mission-status.available {
		color: #c1e58b;
		font-size: 7px;
	}
	.list-foot {
		font-size: 10px;
		line-height: 1.7;
		color: #7b8971;
		margin: 20px 10px 0;
		padding-top: 10px;
	}
	.world-stage {
		min-width: 0;
		position: relative;
		min-height: 590px;
		overflow: hidden;
		background:
			radial-gradient(ellipse at 45% 44%, #29322144, transparent 65%),
			radial-gradient(circle at 12% 28%, #c6d4ac66 0 0.7px, transparent 1px),
			radial-gradient(circle at 72% 63%, #c6d4ac44 0 0.7px, transparent 1px), #10160f;
		background-size:
			auto,
			117px 137px,
			173px 197px,
			auto;
	}
	.world-stage :global(.globe) {
		position: absolute;
		inset: 0;
		top: 30px;
		height: calc(100% - 75px);
	}
	.world-caption {
		position: absolute;
		top: 27px;
		left: 27px;
		z-index: 4;
		pointer-events: none;
	}
	.world-caption > span {
		font-size: 7px;
		letter-spacing: 1.7px;
		color: #7f8f71;
	}
	.world-caption h2 {
		font-size: 24px;
		font-weight: 400;
		letter-spacing: -0.8px;
		margin: 8px 0 7px;
	}
	.world-caption p {
		font-size: 7px;
		letter-spacing: 1.6px;
		color: #8e9b81;
		margin: 0;
	}
	.world-bottom {
		position: absolute;
		bottom: 23px;
		left: 27px;
		right: 27px;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.world-bottom > span {
		font-size: 7px;
		letter-spacing: 1.2px;
		color: #9caa8d;
	}
	.world-bottom small {
		font-size: 9px;
		color: #77866c;
	}
	.mission-detail {
		padding: 26px 25px 22px;
		border-left: 1px solid var(--line);
		background: #171e14;
		display: flex;
		flex-direction: column;
	}
	.detail-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 27px;
	}
	.detail-label,
	.file-number {
		font-size: 8px;
		letter-spacing: 1.4px;
		color: #a6b197;
	}
	.file-number {
		font-family: monospace;
		font-size: 8px;
		color: #6c7b60;
	}
	.availability {
		align-self: flex-start;
		font-size: 7px;
		letter-spacing: 1px;
		color: #b4b9a7;
		border: 1px solid #47503c;
		padding: 6px 8px;
		border-radius: 3px;
	}
	.availability.playable {
		color: #c1e58b;
		background: #25331d;
		border-color: #445c31;
	}
	.mission-detail h2 {
		font-size: 31px;
		font-weight: 400;
		letter-spacing: -1px;
		margin: 18px 0 7px;
	}
	.mission-type {
		font-size: 10px;
		color: #a5b196;
		margin: 0;
	}
	.mission-type span {
		color: #58654c;
		padding: 0 6px;
	}
	.mission-description {
		font-size: 11px;
		line-height: 1.9;
		color: #b0baa4;
		margin: 20px 0;
	}
	dl {
		margin: 0;
		display: grid;
		gap: 17px;
		padding: 20px 0;
		border-top: 1px solid #303c27;
		border-bottom: 1px solid #303c27;
	}
	dt {
		font-size: 7px;
		letter-spacing: 1.3px;
		color: #8a9a7a;
		margin-bottom: 7px;
	}
	dd {
		margin: 0;
		color: #d8dfce;
		font-size: 11px;
	}
	.coordinate-value {
		font-family: monospace;
		font-size: 10px;
		color: #b5c6a1;
	}
	.remains {
		margin: 17px 0 20px;
	}
	.remains > span {
		font-size: 7px;
		letter-spacing: 1.3px;
		color: #9bad89;
	}
	.remains p {
		font-size: 10px;
		line-height: 1.7;
		color: #a2af94;
		margin: 7px 0 0;
	}
	.play-button,
	.coming-soon {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 15px;
		border-radius: 4px;
		font-size: 12px;
		margin-top: auto;
	}
	.play-button {
		background: #c1e58b;
		color: #1a2810;
		font-weight: 600;
	}
	.play-button:hover {
		background: #d3f0aa;
	}
	.play-caption.tight {
		margin-bottom: 12px;
	}
	.play-button.story-button {
		margin-top: 0;
	}
	.coming-soon {
		background: #283022;
		color: #a7b59a;
		border: 1px solid #3e4a33;
	}
	.play-caption {
		font-size: 8px;
		text-align: center;
		color: #8a9a7a;
		margin: 10px 0 18px;
	}
	.source-link {
		font-size: 8px;
		color: #94a582;
		display: flex;
		justify-content: space-between;
	}
	.closing {
		display: flex;
		align-items: center;
		padding: 33px 0 35px;
		gap: 16px;
	}
	.closing-icon {
		font-size: 29px;
		color: #92a77c;
	}
	.closing h2 {
		font-size: 14px;
		font-weight: 400;
		margin: 0 0 7px;
	}
	.closing p {
		font-size: 10px;
		color: #8e9a81;
		margin: 0;
	}
	.closing-number {
		font-size: 30px;
		color: #c1d4aa;
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 15px;
	}
	.closing-number small {
		max-width: 110px;
		font-size: 7px;
		line-height: 1.8;
		letter-spacing: 1.3px;
		color: #94a481;
	}
	.explorer-footer {
		max-width: 1368px;
		margin: auto;
		border-top: 1px solid #2c3526;
		padding: 24px 0 30px;
		display: flex;
		align-items: flex-start;
		gap: 25px;
		justify-content: space-between;
		color: #a8b49a;
		font-size: 15px;
	}
	.explorer-footer small {
		font-size: 9px;
		color: #7f8c72;
		margin-left: 15px;
	}
	.explorer-footer > a {
		font-size: 7px;
		letter-spacing: 1px;
		color: #859677;
		padding-top: 5px;
	}
	.explorer-footer details {
		font-size: 9px;
		color: #849479;
		max-width: 350px;
		line-height: 1.7;
	}
	.explorer-footer summary {
		cursor: pointer;
	}
	.explorer-footer details a {
		text-decoration: underline;
	}
	.space-diagram {
		position: absolute;
		inset: 100px 0 60px;
	}
	.space-diagram svg {
		width: 100%;
		height: 100%;
	}
	.space-pin {
		position: absolute;
		padding: 9px;
		border: 1px solid #566448;
		background: #141d10;
		color: #b8c4aa;
		border-radius: 4px;
		font-size: 10px;
	}
	.space-pin.chosen {
		border-color: #c1e58b;
		color: #d9f2ba;
		background: #2a3a1e;
	}
	.pioneer10 {
		right: 6%;
		top: 14%;
	}
	.pioneer11 {
		left: 4%;
		top: 21%;
	}
	.kepler {
		left: 51%;
		top: 64%;
	}
	@media (min-width: 1500px) {
		.explorer-body {
			grid-template-columns: 235px minmax(0, 1fr) 320px;
		}
		.world-stage {
			min-height: 620px;
		}
	}
	@media (max-width: 1150px) {
		.explorer-header {
			padding: 0 28px;
		}
		.explorer-main {
			padding: 0 28px;
		}
		.explorer-body {
			grid-template-columns: 180px minmax(0, 1fr) 270px;
		}
		.mission-detail {
			padding: 24px 19px;
		}
		.mission-list {
			padding: 24px 8px;
		}
		.live-key {
			display: none;
		}
		.explorer-footer {
			margin: 0 28px;
		}
		.world-stage {
			min-height: 620px;
		}
		.world-caption {
			left: 20px;
		}
		.world-bottom {
			left: 20px;
		}
		.mission-name {
			font-size: 10px;
		}
	}
	@media (max-width: 850px) {
		.explorer-body {
			grid-template-columns: 190px minmax(0, 1fr);
		}
		.mission-detail {
			grid-column: 1/-1;
			border-left: 0;
			border-top: 1px solid var(--line);
			display: block;
		}
		.world-stage {
			min-height: 490px;
		}
		.mission-list {
			max-height: 490px;
		}
		.detail-top {
			margin-bottom: 16px;
		}
		.availability {
			display: inline-block;
		}
		.mission-detail h2 {
			margin-top: 13px;
		}
		.mission-description {
			max-width: 600px;
		}
		dl {
			grid-template-columns: 1fr 1fr;
		}
		.intro-aside {
			display: none;
		}
		.intro {
			padding-top: 42px;
		}
		h1 {
			font-size: 46px;
		}
		.explorer-footer {
			flex-wrap: wrap;
		}
		.play-button,
		.coming-soon {
			max-width: 100%;
		}
		.source-link {
			justify-content: flex-start;
			gap: 12px;
		}
		.mission-list .list-foot {
			display: none;
		}
	}
	@media (max-width: 560px) {
		.explorer-header {
			height: 70px;
			padding: 0 20px;
		}
		.wordmark {
			font-size: 25px;
		}
		.logo-orbit {
			font-size: 29px;
		}
		.brand-tag {
			display: none;
		}
		.header-link {
			font-size: 10px;
		}
		.header-link span {
			margin-left: 8px;
		}
		.explorer-main {
			padding: 0 16px;
		}
		.intro {
			padding: 34px 4px 30px;
		}
		.eyeline {
			font-size: 7px;
			letter-spacing: 1.5px;
			margin-bottom: 19px;
		}
		h1 {
			font-size: 36px;
			letter-spacing: -1.7px;
		}
		.intro-description {
			font-size: 11px;
			line-height: 1.9;
			margin-top: 18px;
		}
		.explorer-top {
			padding: 0 10px;
			height: 57px;
			overflow-x: auto;
		}
		.world-tabs {
			gap: 2px;
		}
		.world-tabs button {
			padding: 9px 10px;
			font-size: 10px;
		}
		.world-tabs small {
			display: none;
		}
		.world-dot {
			width: 7px;
			height: 7px;
		}
		.explorer-body {
			display: flex;
			flex-direction: column;
		}
		.world-stage {
			order: 0;
			height: 390px;
			min-height: 390px;
		}
		.mission-list {
			order: 1;
			border-right: 0;
			border-top: 1px solid var(--line);
			padding: 18px 12px 12px;
		}
		.list-heading {
			margin-bottom: 12px;
		}
		.mission-buttons {
			display: grid;
			grid-template-columns: 1fr 1fr;
			max-height: 220px;
			gap: 2px;
		}
		.mission-button {
			padding: 10px 6px;
			gap: 6px;
		}
		.mission-name {
			font-size: 10px;
		}
		.mission-name small {
			font-size: 8px;
		}
		.mission-icon {
			font-size: 17px;
			width: 18px;
		}
		.mission-detail {
			order: 2;
			padding: 24px;
		}
		.world-caption {
			top: 20px;
		}
		.world-caption h2 {
			font-size: 22px;
		}
		.world-bottom {
			bottom: 17px;
		}
		.closing {
			padding: 25px 4px;
			gap: 12px;
		}
		.closing h2 {
			font-size: 12px;
		}
		.closing p {
			font-size: 9px;
			max-width: 240px;
			line-height: 1.6;
		}
		.closing-number {
			display: none;
		}
		.explorer-footer {
			margin: 0 20px;
			gap: 18px;
			flex-direction: column;
		}
		.explorer-footer small {
			font-size: 8px;
		}
		.space-diagram {
			inset: 70px 0 50px;
		}
	}
</style>
