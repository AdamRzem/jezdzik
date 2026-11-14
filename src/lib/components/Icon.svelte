<script lang="ts">
	let { name, size = 18 }: { name: string; size?: number } = $props();
	const paths: Record<string, string> = {
		cube: 'm12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9M7.5 5.5l9 5',
		grid: 'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',
		depth: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
		arrow: 'M5 12h14m-6-6 6 6-6 6',
		expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
		settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
		reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
		chevron: 'm9 5 7 7-7 7',
		close: 'm6 6 12 12M6 18 18 6',
		check: 'm5 12 4 4L19 6',
		info: 'M12 8h.01M12 11v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
		camera: 'M3 6h12v12H3V6Zm12 4 6-3v10l-6-3',
		link: 'm10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0m4 1 2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0',
		crosshair: 'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
		bolt: 'm13 2-9 12h7l-1 8 10-13h-8l1-7',
		pause: 'M8 5v14M16 5v14',
		play: 'm8 4 12 8-12 8V4Z'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={paths[name] || paths.cube} />
</svg>
