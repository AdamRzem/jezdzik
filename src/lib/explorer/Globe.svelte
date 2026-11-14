<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { surfacePoint } from './geometry';
	import type { Mission, World } from './missions';
	let {
		world,
		missions,
		selected,
		onselect
	}: { world: World; missions: Mission[]; selected: Mission; onselect: (m: Mission) => void } =
		$props();
	let host: HTMLDivElement;
	let failed = $state(false);
	let labels = $state<
		{ mission: Mission; x: number; y: number; visible: boolean; flipped: boolean }[]
	>([]);
	let focusMission: ((m: Mission) => void) | undefined;
	let zoom: ((factor: number) => void) | undefined;
	$effect(() => {
		const mission = selected;
		focusMission?.(mission);
	});
	onMount(() => {
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		} catch {
			failed = true;
			return;
		}
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		host.prepend(renderer.domElement);
		renderer.domElement.setAttribute('aria-label', `${world} interactive globe`);
		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
		camera.position.set(0, 0, 3.6);
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enablePan = false;
		controls.minDistance = 2.5;
		controls.maxDistance = 5.5;
		controls.enableDamping = true;
		controls.dampingFactor = 0.09;
		controls.rotateSpeed = 0.65;
		controls.enableZoom = false;
		const light = new THREE.DirectionalLight(0xffeadb, 2.7);
		light.position.set(-3, 4, 5);
		scene.add(light);
		scene.add(new THREE.AmbientLight(0xffffff, 1.25));
		const geometry = new THREE.SphereGeometry(1, 96, 64);
		if (world === 'Eros') {
			const p = geometry.attributes.position;
			for (let i = 0; i < p.count; i++) {
				const x = p.getX(i),
					y = p.getY(i),
					z = p.getZ(i);
				const f = 1 + 0.1 * Math.sin(x * 7 + y * 3) * Math.cos(z * 5);
				p.setXYZ(i, x * 1.25 * f, y * 0.55 * f, z * 0.65 * f);
			}
			geometry.computeVertexNormals();
		}
		const material = new THREE.MeshStandardMaterial({
			color: world === 'Mars' ? 0xffffff : world === 'Eros' ? 0xa89a86 : 0xcacac5,
			roughness: 1
		});
		const mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);
		let disposed = false;
		let texture: THREE.Texture | undefined;
		if (world === 'Mars' || world === 'Moon') {
			texture = new THREE.TextureLoader().load(`/explorer/${world.toLowerCase()}.jpg`, (t) => {
				if (disposed) t.dispose();
				else {
					t.colorSpace = THREE.SRGBColorSpace;
					material.map = t;
					material.needsUpdate = true;
				}
			});
		}
		// Ceres and Eros are explicitly labelled illustrative, not surveyed shape models.
		if (world === 'Ceres') {
			const grid = new THREE.LineSegments(
				new THREE.WireframeGeometry(new THREE.SphereGeometry(1.003, 24, 12)),
				new THREE.LineBasicMaterial({ color: 0x6e786b, transparent: true, opacity: 0.18 })
			);
			scene.add(grid);
			const orbit = new THREE.EllipseCurve(0, 0, 1.4, 1.15, 0, Math.PI * 2, false, 0).getPoints(
				160
			);
			const line = new THREE.LineLoop(
				new THREE.BufferGeometry().setFromPoints(orbit.map((p) => new THREE.Vector3(p.x, p.y, 0))),
				new THREE.LineBasicMaterial({ color: 0xa5b88b, transparent: true, opacity: 0.65 })
			);
			scene.add(line);
		}
		const markers = missions.map((m) => {
			let position: THREE.Vector3;
			if (m.location.type === 'surface') {
				position = new THREE.Vector3(...surfacePoint(m.location.lat, m.location.lon, 1.012));
				if (world === 'Eros') {
					const p = position.clone().normalize();
					const f = 1 + 0.1 * Math.sin(p.x * 7 + p.y * 3) * Math.cos(p.z * 5);
					position.set(position.x * 1.25 * f, position.y * 0.55 * f, position.z * 0.65 * f);
				}
			} else position = new THREE.Vector3(1.2, 0.59, 0.1);
			return { mission: m, position };
		});
		let target: THREE.Vector3 | undefined;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		focusMission = (m) => {
			const marker = markers.find((p) => p.mission.id === m.id);
			if (!marker) return;
			target = marker.position.clone().normalize().multiplyScalar(camera.position.length());
			if (world === 'Ceres') target = new THREE.Vector3(0, 0, 3.8);
			if (reduced.matches) {
				camera.position.copy(target);
				target = undefined;
				controls.update();
			}
		};
		focusMission(selected);
		const stopFocus = () => {
			target = undefined;
		};
		controls.addEventListener('start', stopFocus);
		zoom = (factor) => {
			target = undefined;
			camera.position.multiplyScalar(factor).clampLength(2.5, 5.5);
			controls.update();
		};
		const resize = new ResizeObserver(() => {
			const { width, height } = host.getBoundingClientRect();
			renderer.setSize(width, height);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
		});
		resize.observe(host);
		const contextLost = (e: Event) => {
			e.preventDefault();
			failed = true;
		};
		renderer.domElement.addEventListener('webglcontextlost', contextLost);
		let frame = 0;
		function render() {
			frame = requestAnimationFrame(render);
			if (target) {
				camera.position.lerp(target, 0.09).setLength(target.length());
				if (camera.position.distanceTo(target) < 0.005) target = undefined;
			}
			controls.update();
			camera.updateMatrixWorld();
			const width = host.clientWidth,
				height = host.clientHeight;
			labels = markers.map(({ mission, position }) => {
				const p = position.clone().project(camera);
				return {
					mission,
					x: (p.x * 0.5 + 0.5) * width,
					y: (-0.5 * p.y + 0.5) * height,
					flipped: (p.x * 0.5 + 0.5) * width > width - 190,
					visible:
						(mission.location.type !== 'surface' ||
							position.dot(camera.position) > position.lengthSq()) &&
						p.z < 1 &&
						Math.abs(p.x) < 0.95 &&
						Math.abs(p.y) < 0.93
				};
			});
			renderer.render(scene, camera);
		}
		render();
		return () => {
			disposed = true;
			cancelAnimationFrame(frame);
			resize.disconnect();
			controls.dispose();
			scene.traverse((o) => {
				if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
					o.geometry.dispose();
					const ms = Array.isArray(o.material) ? o.material : [o.material];
					ms.forEach((m) => m.dispose());
				}
			});
			texture?.dispose();
			renderer.dispose();
			renderer.domElement.remove();
			focusMission = undefined;
			zoom = undefined;
		};
	});
</script>

<div class="globe" bind:this={host}>
	{#if failed}<div class="fallback">
			<span>◎</span>
			<p>3D view unavailable</p>
			<small>Choose a mission from the list to explore its story.</small>
		</div>{:else}
		{#each labels as label (label.mission.id)}
			{#if label.visible}<button
					class="pin"
					class:chosen={label.mission.id === selected.id}
					style:left={`${label.x}px`}
					style:top={`${label.y}px`}
					aria-label={`Select ${label.mission.name} ${label.mission.location.type === 'surface' ? 'landing site' : 'orbital location'}`}
					aria-pressed={label.mission.id === selected.id}
					onclick={() => onselect(label.mission)}
					><i></i>{#if label.mission.id === selected.id}<span class:flipped={label.flipped}
							>{label.mission.name}<small
								>{label.mission.play ? 'AVAILABLE TO EXPLORE' : 'MISSION SITE'}</small
							></span
						>{/if}</button
				>{/if}
		{/each}
		<div class="zoom">
			<button aria-label="Zoom in" onclick={() => zoom?.(0.88)}>+</button><button
				aria-label="Zoom out"
				onclick={() => zoom?.(1.14)}>−</button
			>
		</div>
	{/if}
</div>

<style>
	.globe {
		height: 100%;
		width: 100%;
		position: relative;
		isolation: isolate;
	}
	.globe :global(canvas) {
		display: block;
		touch-action: none;
	}
	.pin {
		position: absolute;
		transform: translate(-50%, -50%);
		background: none;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		padding: 0;
		color: #e9efdf;
		z-index: 2;
	}
	.pin i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #e3e8d7;
		box-shadow: 0 0 0 4px #111a1699;
	}
	.pin.chosen {
		z-index: 3;
	}
	.pin.chosen i {
		background: #d0f49a;
		box-shadow:
			0 0 0 6px #c1e58b26,
			0 0 0 7px #c1e58b88,
			0 0 22px #c1e58b;
	}
	.pin span {
		position: absolute;
		left: 34px;
		top: 0;
		text-align: left;
		white-space: nowrap;
		font-size: 13px;
		text-shadow: 0 1px 5px #000;
		background: #0b100ce6;
		padding: 9px 12px;
		border: 1px solid #bacba130;
		border-radius: 4px;
		pointer-events: none;
	}
	.pin span.flipped {
		left: auto;
		right: 34px;
	}
	.pin small {
		display: block;
		font-size: 7px;
		letter-spacing: 1.1px;
		color: #b9d58e;
		margin-top: 5px;
	}
	.zoom {
		position: absolute;
		right: 18px;
		bottom: 24px;
		display: flex;
		gap: 6px;
	}
	.zoom button {
		background: #141b16;
		border: 1px solid #384137;
		border-radius: 4px;
		width: 34px;
		height: 34px;
		font-size: 20px;
	}
	.fallback {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #a5afa0;
		text-align: center;
		padding: 30px;
	}
	.fallback > span {
		font-size: 90px;
		color: #56674b;
	}
	.fallback p {
		font-size: 18px;
	}
	.fallback small {
		max-width: 220px;
		line-height: 1.7;
	}
</style>
