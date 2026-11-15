<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

	type Model = {
		id: string;
		group: string;
		cover?: boolean;
		label: string;
		file: string;
		triangles: number;
		note: string;
	};

	const BASE = '/assets/models/';
	// Height of the rover's camera lens above the floor, from the implementation plan.
	const CAMERA_HEIGHT = 0.119;

	let canvas = $state<HTMLCanvasElement>();
	let models = $state<Model[]>([]);
	let groups = $state<{ id: string; title: string }[]>([]);
	let selected = $state<Model | null>(null);
	let showCube = $state(false);
	let error = $state('');

	let renderer: THREE.WebGLRenderer | undefined;
	let camera: THREE.PerspectiveCamera | undefined;
	let controls: OrbitControls | undefined;
	let current: THREE.Object3D | undefined;
	let extent = 1;
	const scene = new THREE.Scene();
	const loader = new GLTFLoader();
	const cube = new THREE.Mesh(
		new THREE.BoxGeometry(0.1, 0.1, 0.1),
		new THREE.MeshBasicMaterial({ color: 0x22dd66 })
	);
	const floor = new THREE.Mesh(
		new THREE.CircleGeometry(40, 64),
		new THREE.MeshStandardMaterial({ color: 0xb9743f, roughness: 1 })
	);

	function frame(rover = false) {
		if (!camera || !controls || !current) return;
		const box = new THREE.Box3().setFromObject(current);
		const centre = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());
		extent = Math.max(size.x, size.y, size.z);
		if (rover) {
			// What the rover's camera sees from 60 cm away.
			controls.target.set(centre.x, 0.05, centre.z);
			camera.position.set(centre.x, CAMERA_HEIGHT, centre.z + size.z / 2 + 0.6);
		} else {
			controls.target.copy(centre);
			camera.position.set(
				centre.x + extent * 0.9,
				centre.y + extent * 0.7,
				centre.z + extent * 1.3
			);
		}
		camera.near = extent / 200;
		camera.far = extent * 40;
		camera.updateProjectionMatrix();
		controls.update();
	}

	function applyCube() {
		const on = showCube && selected?.cover === true;
		cube.visible = on;
		current?.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (!mesh.isMesh) return;
			const material = mesh.material as THREE.MeshStandardMaterial;
			if (material.name === 'ghost') return;
			material.transparent = on;
			material.opacity = on ? 0.4 : 1;
			material.depthWrite = !on;
			material.needsUpdate = true;
		});
	}

	// Links such as /models?model=cover-yogi&cube&view=rover open a model directly.
	async function select(model: Model, rover = false) {
		selected = model;
		error = '';
		try {
			const gltf = await loader.loadAsync(BASE + model.file);
			if (selected !== model) return;
			if (current) scene.remove(current);
			current = gltf.scene;
			scene.add(current);
			floor.visible = !/ares-vallis|elysium|ground/.test(model.id);
			applyCube();
			frame(rover);
		} catch (e) {
			error = `Could not load ${model.file}: ${e instanceof Error ? e.message : e}`;
		}
	}

	$effect(() => {
		// Re-run when the checkbox or the selection changes.
		void showCube;
		void selected;
		applyCube();
	});

	onMount(() => {
		if (!canvas) return;
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		scene.background = new THREE.Color(0xd9b38c);
		scene.add(new THREE.HemisphereLight(0xffe1c4, 0x7a4a2c, 1.4));
		const sun = new THREE.DirectionalLight(0xfff1e0, 2.4);
		sun.position.set(3, 5, 2);
		scene.add(sun);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = -0.0005;
		scene.add(floor);
		cube.position.y = 0.05;
		cube.visible = false;
		scene.add(cube);

		camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
		controls = new OrbitControls(camera, canvas);
		controls.enableDamping = true;
		controls.maxPolarAngle = Math.PI / 2 - 0.01;

		const resize = () => {
			if (!canvas || !renderer || !camera) return;
			const { clientWidth: w, clientHeight: h } = canvas;
			renderer.setSize(w, h, false);
			camera.aspect = w / Math.max(h, 1);
			camera.updateProjectionMatrix();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();
		renderer.setAnimationLoop(() => {
			controls?.update();
			if (renderer && camera) renderer.render(scene, camera);
		});

		fetch(BASE + 'layout.json')
			.then((r) => r.json())
			.then((layout) => {
				models = layout.models;
				groups = layout.groups;
				const params = new URLSearchParams(location.search);
				const wanted = params.get('model') ?? 'cover-barnacle-bill';
				showCube = params.has('cube');
				const first = models.find((m) => m.id === wanted) ?? models[0];
				if (first) select(first, params.get('view') === 'rover');
			})
			.catch(() => {
				error = 'No models found. Run "npm run models" first.';
			});

		return () => {
			observer.disconnect();
			renderer?.setAnimationLoop(null);
			controls?.dispose();
			renderer?.dispose();
		};
	});
</script>

<svelte:head>
	<title>Models</title>
</svelte:head>

<div class="flex h-screen flex-col bg-stone-900 text-stone-100 md:flex-row">
	<aside
		class="max-h-[40vh] w-full shrink-0 overflow-y-auto border-stone-700 p-4 md:max-h-none md:w-72 md:border-r"
	>
		<h1 class="text-lg font-semibold">Mars models</h1>
		{#each groups as { id: group, title } (group)}
			<h2 class="mt-4 mb-1 text-xs tracking-wide text-stone-400 uppercase">{title}</h2>
			<ul>
				{#each models.filter((m) => m.group === group) as model (model.id)}
					<li>
						<button
							class="w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-700 {selected?.id ===
							model.id
								? 'bg-stone-700 font-medium'
								: ''}"
							onclick={() => select(model)}
						>
							{model.label}
						</button>
					</li>
				{/each}
			</ul>
		{/each}
	</aside>

	<main class="relative min-h-0 flex-1">
		<canvas bind:this={canvas} class="block h-full w-full"></canvas>
		<div class="absolute top-3 left-3 max-w-md rounded bg-stone-900/80 p-3 text-sm">
			{#if error}
				<p class="text-red-300">{error}</p>
			{:else if selected}
				<p class="font-medium">{selected.label}</p>
				<p class="mt-1 text-stone-300">{selected.note}</p>
				<p class="mt-1 text-xs text-stone-400">{selected.triangles.toLocaleString()} triangles</p>
				<div class="mt-2 flex flex-wrap items-center gap-3">
					<button class="rounded bg-stone-700 px-2 py-1 hover:bg-stone-600" onclick={() => frame()}>
						Reset view
					</button>
					{#if selected.cover}
						<button
							class="rounded bg-stone-700 px-2 py-1 hover:bg-stone-600"
							onclick={() => frame(true)}
						>
							Rover's view
						</button>
						<label class="flex items-center gap-1">
							<input type="checkbox" bind:checked={showCube} />
							Show the real cube inside
						</label>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>
