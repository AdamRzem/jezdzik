<script lang="ts">
	import type { ViewerStatus } from '../ar/types';
	import type { StoryEngine } from './engine.svelte';
	import {
		FRESH_MS,
		objectiveLocations,
		projectRadar,
		separateMarkers,
		type MapMemory
	} from './minimap';

	let {
		engine,
		status,
		memory,
		now
	}: {
		engine: StoryEngine;
		status: ViewerStatus;
		memory: MapMemory;
		now: number;
	} = $props();
	let collapsed = $state(false);
	const locations = $derived(objectiveLocations(engine.steps, engine.completed, engine.target));
	const tracking = $derived(!status.pose || status.pose.q === 0 || status.trackingLost);
	const markers = $derived(
		separateMarkers(
			locations.flatMap((location) => {
				const item = memory.items[location.item];
				return item && memory.pose
					? [
							{
								...location,
								...projectRadar(item, memory.pose),
								stale: status.mode === 'live' && now - item.lastSeen > FRESH_MS
							}
						]
					: [];
			})
		)
	);
	const active = $derived(locations.find((location) => location.state === 'active'));
	const activeMarker = $derived(markers.find((marker) => marker.state === 'active'));
</script>

<section class="radar-panel" aria-label="Mission minimap">
	<button class="map-toggle" aria-expanded={!collapsed} onclick={() => (collapsed = !collapsed)}>
		<span>Mission radar</span><span aria-hidden="true">{collapsed ? '+' : '−'}</span>
	</button>
	{#if !collapsed}
		<div class="radar-content">
			<svg viewBox="0 0 224 224" role="img" aria-label="Heading-up mission radar, 3 metre radius">
				<title
					>Rover-centered mission radar. Up is forward. Numbered locations match the objective list.</title
				>
				<circle cx="112" cy="112" r="90" fill="#090e0b" stroke="currentColor" opacity=".65" />
				{#each [30, 60] as radius (radius)}<circle
						cx="112"
						cy="112"
						r={radius}
						fill="none"
						stroke="currentColor"
						opacity=".2"
					/>{/each}
				<path d="M112 22V202M22 112H202" stroke="currentColor" opacity=".15" />
				<text x="112" y="12" text-anchor="middle" class="axis">FORWARD</text>
				<text x="112" y="220" text-anchor="middle" class="axis">1 m rings · 3 m range</text>
				{#if memory.pose}
					<path d="m112 104 6 15-6-3-6 3Z" fill="currentColor" opacity={tracking ? 0.4 : 1}
						><title>Rover{tracking ? ' — last known position' : ''}</title></path
					>
				{/if}
				{#each markers as marker (marker.id)}
					<g
						class:active={marker.state === 'active'}
						class:completed={marker.state === 'completed'}
						class:stale={marker.stale}
						class="marker"
					>
						<title
							>{marker.number}. {marker.label}: {marker.state}, {marker.distance.toFixed(2)} m{marker.clipped
								? ', beyond radar range'
								: ''}{marker.stale ? ', last known position' : ''}</title
						>
						<line
							x1={marker.x}
							y1={marker.y}
							x2={marker.labelX}
							y2={marker.labelY}
							stroke="currentColor"
							opacity=".5"
						/>
						{#if marker.clipped}<path
								d="m0 -5 4 7-4-2-4 2Z"
								fill="currentColor"
								transform={`translate(${marker.x},${marker.y}) rotate(${marker.angle})`}
							/>{/if}
						<g transform={`translate(${marker.labelX},${marker.labelY})`}>
							{#if marker.state === 'active'}<circle
									r="12"
									fill="none"
									stroke="currentColor"
								/>{/if}
							{#if marker.kind === 'point'}<path
									d="M0-9 9 0 0 9-9 0Z"
									fill="#101711"
									stroke="currentColor"
								/>
							{:else}<circle r="8" fill="#101711" stroke="currentColor" />{/if}
							<text text-anchor="middle" dy="3" font-size="9" fill="currentColor"
								>{marker.state === 'completed' ? '✓' : marker.number}</text
							>
						</g>
					</g>
				{/each}
			</svg>
			<div class="map-details">
				{#if tracking}<p class="tracking" role="status">
						{memory.pose ? 'Tracking unavailable · last position' : 'Waiting for rover position'}
					</p>
				{:else if status.pose?.q === 1}<p class="tracking">Predicting position</p>{/if}
				<p class="target">
					{active
						? `${active.label} · ${activeMarker ? `${activeMarker.distance.toFixed(2)} m${activeMarker.stale || tracking ? ' (last known)' : ''}` : 'unlocated'}`
						: 'No active destination'}
				</p>
				<ol aria-label="Mission locations">
					{#each locations as location (location.id)}
						{@const item = memory.items[location.item]}
						<li
							class:active={location.state === 'active'}
							class:completed={location.state === 'completed'}
						>
							<span>{location.number}. {location.label}</span>
							<small
								>{location.state === 'completed' ? '✓ completed' : location.state}{!item
									? ' · unlocated'
									: status.mode === 'live' && now - item.lastSeen > FRESH_MS
										? ' · last known'
										: ''}</small
							>
						</li>
					{/each}
				</ol>
				<p class="legend">○ object · ◇ destination · edge arrow: beyond 3 m</p>
			</div>
		</div>
	{/if}
</section>

<style>
	.radar-panel {
		width: 248px;
		max-width: 100%;
		border: 1px solid #fbbf2466;
		border-radius: 8px;
		background: #000c;
		color: #fde68a;
		pointer-events: auto;
		backdrop-filter: blur(4px);
	}
	.map-toggle {
		display: flex;
		justify-content: space-between;
		width: 100%;
		padding: 10px 12px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		cursor: pointer;
	}
	.map-toggle:focus-visible {
		outline: 2px solid #fbbf24;
		outline-offset: -3px;
	}
	svg {
		display: block;
		width: 224px;
		height: 224px;
		margin: auto;
	}
	.axis {
		font-size: 8px;
		fill: currentColor;
		opacity: 0.65;
	}
	.marker {
		color: #c6bd94;
	}
	.active {
		color: #fbbf24;
		font-weight: bold;
	}
	.completed {
		color: #6ee7b7;
	}
	.stale {
		stroke-dasharray: 2 2;
		opacity: 0.65;
	}
	.map-details {
		padding: 0 12px 12px;
		font-size: 11px;
	}
	.target,
	.tracking {
		margin-bottom: 8px;
	}
	.tracking {
		color: #fcd34d;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 132px;
		overflow-y: auto;
	}
	li {
		margin-bottom: 6px;
	}
	small {
		display: block;
		font-size: 10px;
		opacity: 0.7;
	}
	.legend {
		margin-top: 8px;
		font-size: 9px;
		opacity: 0.6;
	}
	@media (max-width: 767px) {
		.radar-panel {
			width: 100%;
		}
		.radar-content {
			display: flex;
			align-items: flex-start;
		}
		svg {
			width: 160px;
			height: 160px;
			flex: 0 0 160px;
			margin: 0;
		}
		.map-details {
			min-width: 0;
			flex: 1;
			padding: 0 8px 8px;
		}
		ol {
			max-height: 85px;
		}
	}
</style>
