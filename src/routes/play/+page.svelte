<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { CAMERA, ITEM_TYPES } from '#lib/ar/config.js';
	import { Viewer, initialStatus } from '#lib/ar/main.js';
	import type { QualityOverride, ViewMode } from '#lib/ar/types.js';

	let status = $state(initialStatus());
	let view = $state<ViewMode>('objects');
	let quality = $state<QualityOverride>('auto');
	let canvas: HTMLCanvasElement;
	let video: HTMLVideoElement;
	let stage: HTMLDivElement;
	let resetDialog: HTMLDialogElement;
	let settingsDialog: HTMLDialogElement;
	let viewer: Viewer | undefined;
	let ready = $state(false);
	let fatal = $state('');
	let controlError = $state('');
	const degrees = (radians: number) => ((radians * 180) / Math.PI).toFixed(1);
	const formatFrame = (frame: number | null) =>
		frame === null ? '—' : String(frame).padStart(5, '0');
	const distance = (x: number, z: number) =>
		status.pose ? Math.hypot(x - status.pose.x, z - status.pose.z).toFixed(2) : '—';
	let tracking = $derived(
		status.trackingLost
			? 'Waiting for frames'
			: status.pose?.q === 0
				? 'Position lost'
				: status.pose?.q === 1
					? 'Predicting position'
					: 'Tracking'
	);
	let mapPath = $derived(
		status.path.map((p, i) => `${i ? 'L' : 'M'}${120 + p.x * 80},${132 + p.z * 80}`).join(' ')
	);

	onMount(() => {
		try {
			viewer = new Viewer(canvas, video, (next) => {
				status = next;
			});
			viewer.start(new URLSearchParams(location.search).get('mode') === 'live' ? 'live' : 'demo');
			ready = true;
		} catch (error) {
			fatal = error instanceof Error ? error.message : 'WebGL is unavailable in this browser.';
		}
		return () => viewer?.dispose();
	});
	function setView(next: ViewMode) {
		view = next;
		viewer?.setView(next);
	}
	function setMode(mode: 'demo' | 'live') {
		controlError = '';
		viewer?.start(mode);
		viewer?.setQuality(quality);
	}
	function setQuality(event: Event) {
		quality = (event.target as HTMLSelectElement).value as QualityOverride;
		viewer?.setQuality(quality);
	}
	async function fullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await stage.requestFullscreen();
		} catch {
			controlError = 'Fullscreen is unavailable in this browser.';
		}
	}
</script>

<svelte:head>
	<title>Rover — Spatial viewer</title>
	<meta
		name="description"
		content="A local AR view from your rover. Frame-matched video, floor-anchored objects and real-world occlusion."
	/>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<a class="brand" href="/" aria-label="Rover home">
			<span class="brand-mark"><Icon name="cube" size={24} /></span>
			<strong>rover<span class="brand-period">.</span></strong>
			<span class="brand-divider"></span><span class="brand-caption">SPATIAL VIEWER</span>
		</a>
		<div class="header-actions">
			<span class="local-label"><span class="tiny-dot"></span> Local workspace</span>
			<a
				class="icon-button bench-link"
				href="/bench"
				aria-label="Open depth benchmark"
				title="Depth benchmark"><Icon name="bolt" /></a
			>
			<button
				class="icon-button"
				onclick={() => settingsDialog.showModal()}
				aria-label="Viewer settings"><Icon name="settings" /></button
			>
		</div>
	</header>

	<main>
		<div class="page-heading">
			<div>
				<div class="eyebrow">ROVER / CAMERA 01</div>
				<h1>A different view of the floor<span>.</span></h1>
				<p>Real surroundings. A little more possibility.</p>
			</div>
			<div class="source-switch" aria-label="Video source">
				<button
					class:active={status.mode === 'demo'}
					onclick={() => setMode('demo')}
					disabled={!ready}><Icon name="play" size={14} /> Demo</button
				>
				<button
					class:active={status.mode === 'live'}
					onclick={() => setMode('live')}
					disabled={!ready}><Icon name="link" size={15} /> Connect rover</button
				>
			</div>
		</div>

		<div class="workspace">
			<section class="viewer-panel" aria-label="Camera viewer">
				<div class="viewer-toolbar">
					<div class="camera-title">
						<Icon name="camera" size={16} /><span>Floor view</span><span
							class="source-badge"
							class:live={status.mode === 'live'}
							>{status.mode === 'demo' ? 'SIMULATED' : 'LIVE'}</span
						>
					</div>
					<div class="viewer-specs">1280 × 720 <span>·</span> 30 FPS</div>
				</div>
				<div class="video-stage" bind:this={stage}>
					<video
						bind:this={video}
						class:camera-flipped={status.mode === 'live'}
						muted
						autoplay
						playsinline
						aria-label="Raw rover camera stream"
					></video>
					<canvas
						bind:this={canvas}
						width="1280"
						height="720"
						aria-label="Rectified camera frame with augmented reality objects"
					></canvas>
					<div class="stage-top">
						<span class="tracking-badge" class:warning={status.trackingLost || status.pose?.q === 0}
							><span class="tiny-dot"></span>{tracking}</span
						><span class="frame-badge">F {formatFrame(status.frame)}</span>
					</div>
					<div class="reticle" aria-hidden="true"><span></span><span></span></div>
					{#if fatal}<div class="stage-message">
							<Icon name="info" size={24} />
							<h2>Viewer unavailable</h2>
							<p>{fatal}</p>
						</div>
					{:else if status.mode === 'live' && status.frame === null}
						<div class="stage-message">
							<span class="connection-ring"></span>
							<h2>Waiting for the rover</h2>
							<p>
								{status.socket === 'connected'
									? 'Pose channel connected. Waiting for stamped video.'
									: 'Connecting to the camera and pose channel…'}
							</p>
							<button class="text-button" onclick={() => setMode('demo')}
								>Explore the demo <Icon name="arrow" size={16} /></button
							>
						</div>
					{/if}
					<div class="stage-bottom">
						<span class="orientation-label">Y ↑ <span>−Z FORWARD</span></span><button
							class="stage-expand"
							onclick={fullscreen}
							aria-label="Toggle fullscreen"><Icon name="expand" size={17} /></button
						>
					</div>
				</div>
				<div class="view-controls">
					<div class="layer-tabs" aria-label="Overlay view">
						{#each [{ id: 'objects', name: 'Objects', icon: 'cube' }, { id: 'grid', name: 'Floor grid', icon: 'grid' }, { id: 'depth', name: 'Depth', icon: 'depth' }] as tab}
							<button
								class:selected={view === tab.id}
								aria-pressed={view === tab.id}
								onclick={() => setView(tab.id as ViewMode)}
								><Icon name={tab.icon} size={16} />{tab.name}</button
							>
						{/each}
					</div>
					<span class="view-hint"
						><span class="tiny-dot"></span>
						{status.mode === 'demo' ? 'Local simulation' : 'Frame-matched overlay'}</span
					>
				</div>
				<div class="telemetry" aria-label="Frame telemetry">
					<div>
						<span class="metric-label">FRAME RATE</span><strong
							>{status.fps ? status.fps.toFixed(0) : '—'}<small>fps</small></strong
						><span class="metric-note">Rendered frames</span>
					</div>
					<div>
						<span class="metric-label">POSITION</span><strong
							>{status.pose ? status.pose.x.toFixed(2) : '—'}<small>/</small>{status.pose
								? status.pose.z.toFixed(2)
								: '—'}<small>m</small></strong
						><span class="metric-note">X / Z on the floor</span>
					</div>
					<div>
						<span class="metric-label">HEADING</span><strong
							>{status.pose ? degrees(status.pose.yaw) : '—'}<small>°</small></strong
						><span class="metric-note">Relative to reset</span>
					</div>
					<div>
						<span class="metric-label">UNKNOWN FRAMES</span><strong
							class:metric-warning={status.unknown > 0}
							>{status.unknown}<small>frames</small></strong
						><span class="metric-note">Never estimated</span>
					</div>
				</div>
				{#if status.error || controlError}<div class="notice error-notice" role="status">
						<Icon name="info" size={16} /><span>{status.error || controlError}</span>
						{#if status.error}<button onclick={() => setMode('live')} class="text-button"
								>Retry</button
							>
						{:else}<button
								onclick={() => {
									controlError = '';
								}}
								class="text-button">Dismiss</button
							>{/if}
					</div>{/if}
			</section>

			<aside class="session-panel" aria-label="Session information">
				<div class="panel-heading">
					<span class="eyebrow">SESSION</span><span class="session-number">01</span>
				</div>
				<div class="session-status">
					<span class="status-orbit" class:waiting={status.trackingLost}
						><Icon name="crosshair" size={21} /></span
					>
					<div>
						<strong>{status.mode === 'demo' ? 'Demo environment' : 'Rover connection'}</strong><span
							>{status.mode === 'demo'
								? 'Explore without hardware'
								: status.socket === 'connected'
									? 'Pose channel connected'
									: 'Connecting to local rover'}</span
						>
					</div>
				</div>
				<div class="session-details">
					<div>
						<span>Camera</span><span class:positive={status.video === 'connected'}
							><span class="tiny-dot"></span>{status.video === 'connected'
								? status.mode === 'demo'
									? 'Simulated'
									: 'Connected'
								: 'Waiting'}</span
						>
					</div>
					<div>
						<span>Depth</span><span
							>{quality === 'C'
								? 'Off'
								: status.mode === 'demo'
									? 'Simulated'
									: `Tier ${status.tier}`}</span
						>
					</div>
					<div><span>Alignment</span><span>{status.alignment}</span></div>
					<div><span>World frame</span><span class="mono">{status.pose?.e ?? '—'}</span></div>
				</div>
				<div class="section-divider"></div>
				<div class="items-heading">
					<span class="eyebrow">FLOOR OBJECTS</span><span class="count-badge"
						>{String(status.items.length).padStart(2, '0')}</span
					>
				</div>
				<div class="object-list">
					{#each status.items as item (item.id)}
						<div class="object-row">
							<span class="object-thumbnail" style={`--rock-color:${ITEM_TYPES[item.id].color}`}
								><svg viewBox="0 0 48 48" aria-hidden="true"
									><path d="m6 34 4-17 12-7 15 7 6 16-12 7-18-1Z" fill="currentColor" /><path
										d="m10 17 12 8 15-8-15-7Z"
										fill="#fff"
										opacity=".19"
									/><path d="m22 25 9 15 12-7-6-16Z" fill="#000" opacity=".19" /></svg
								></span
							>
							<div>
								<strong>{ITEM_TYPES[item.id].name}</strong><span
									>ITEM {String(item.id).padStart(2, '0')} <span class="item-dot">·</span> floor anchored</span
								>
							</div>
							<span class="item-distance">{distance(item.x, item.z)}<small> m</small></span>
						</div>
					{:else}<div class="empty-items">
							<Icon name="cube" size={24} />
							<p>Objects appear here when<br />their markers are detected.</p>
						</div>{/each}
				</div>
				<div class="map-heading"><span class="eyebrow">LOCAL MAP</span><span>1 m grid</span></div>
				<div class="local-map">
					<svg viewBox="0 0 240 155" aria-label="Top-down map of rover and objects" role="img"
						><defs
							><pattern
								id="map-grid"
								width="80"
								height="80"
								patternUnits="userSpaceOnUse"
								x="40"
								y="52"
								><path d="M80 0H0V80" fill="none" stroke="#343c35" stroke-width=".6" /><circle
									cx="0"
									cy="0"
									r="1.3"
									fill="#59634e"
								/></pattern
							></defs
						><rect width="240" height="155" fill="url(#map-grid)" /><path
							d={mapPath}
							fill="none"
							stroke="#9dbb68"
							stroke-width="1.5"
						/>{#each status.items as item (item.id)}<circle
								cx={120 + item.x * 80}
								cy={132 + item.z * 80}
								r="4"
								fill={ITEM_TYPES[item.id].color}
							/>{/each}<g
							transform={`translate(${120 + (status.pose?.x ?? 0) * 80},${132 + (status.pose?.z ?? 0) * 80}) rotate(${-Number(degrees(status.pose?.yaw ?? 0))})`}
							><path d="M0 0-22-50Q0-58 22-50Z" fill="#c0e58a" opacity=".06" /><circle
								r="10"
								fill="#c0e58a"
								opacity=".10"
							/><path d="m0-7 5 12-5-2-5 2Z" fill="#c0e58a" /></g
						><text x="14" y="20" fill="#737f6e" font-size="9" font-family="monospace">−Z</text><text
							x="219"
							y="142"
							fill="#737f6e"
							font-size="9"
							font-family="monospace">+X</text
						></svg
					>
					<div class="map-caption">
						<span class="tiny-dot"></span> Rover
						<span class="map-origin">Origin at last reset</span>
					</div>
				</div>
				<button class="reset-button" onclick={() => resetDialog.showModal()} disabled={!ready}
					><Icon name="reset" size={16} /><span>Reset world frame</span><Icon
						name="chevron"
						size={14}
					/></button
				>
			</aside>
		</div>
		<div class="workspace-note">
			<span
				><Icon name="info" size={15} />{status.mode === 'demo'
					? 'This is a simulation. Connect your rover to see the real world.'
					: 'Calibration is pending. Measure the camera before assessing overlay accuracy.'}</span
			><a href="/bench">Check device performance <Icon name="arrow" size={14} /></a>
		</div>
	</main>
	<footer>
		<span>MADE TO EXPLORE</span><span
			>Y UP <span> / </span> METRES <span> / </span> RIGHT-HANDED</span
		><span class="footer-version">ROVER AR <span>v0.1</span></span>
	</footer>
</div>

<dialog bind:this={resetDialog} class="modal">
	<div class="modal-heading">
		<span class="modal-icon"><Icon name="reset" size={24} /></span><button
			class="icon-button"
			onclick={() => resetDialog.close()}
			aria-label="Close reset dialog"><Icon name="close" /></button
		>
	</div>
	<h2>Start a new world frame?</h2>
	<p>
		{status.mode === 'demo'
			? 'This resets the simulated rover and clears its objects. They will be detected again in the new world.'
			: 'Keep the rover still. This zeroes its pose, recalibrates the gyro and clears objects for every connected viewer.'}
	</p>
	<div class="modal-actions">
		<button class="secondary-button" onclick={() => resetDialog.close()}>Keep exploring</button
		><button
			class="primary-button"
			onclick={() => {
				viewer?.reset();
				resetDialog.close();
			}}>Reset frame <Icon name="arrow" size={16} /></button
		>
	</div>
</dialog>

<dialog bind:this={settingsDialog} class="modal settings-modal">
	<div class="modal-heading">
		<span class="eyebrow">VIEWER SETTINGS</span><button
			class="icon-button"
			onclick={() => settingsDialog.close()}
			aria-label="Close settings"><Icon name="close" /></button
		>
	</div>
	<h2>Your view, your device.</h2>
	<label class="setting-label" for="depth-quality">Occlusion quality</label><select
		id="depth-quality"
		value={quality}
		onchange={setQuality}
		><option value="auto">Automatic · match this device</option><option value="A"
			>Tier A · 518 × 294, target 10 Hz</option
		><option value="B">Tier B · 322 × 182, target 3 Hz</option><option value="C"
			>Off · video and objects only</option
		></select
	>
	<p class="setting-help">
		Automatic quality measures ten full cycles, then steps down if needed. It never steps up on its
		own.
	</p>
	<div class="diagnostics">
		<div><span>Marker detector</span><strong>{status.markers}</strong></div>
		<div><span>Depth pipeline</span><strong>{status.depth}</strong></div>
		<div>
			<span>Full depth cycle</span><strong
				>{status.depthMs === null ? '—' : `${status.depthMs.toFixed(1)} ms`}</strong
			>
		</div>
		<div><span>Floor-fit inliers</span><strong>{(status.fit * 100).toFixed(0)}%</strong></div>
		<div><span>Camera geometry</span><strong>{CAMERA.heightM} m / 10°</strong></div>
	</div>
	<a class="benchmark-button" href="/bench">Run depth benchmark <Icon name="arrow" size={16} /></a>
	<p class="calibration-note">
		Intrinsics and distortion are provisional. Calibration lives in <code>src/lib/ar/config.ts</code
		>.
	</p>
</dialog>
