/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type UserConfig } from 'vite';
import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
	const env = loadEnv(mode, process.cwd(), '');
	const pi = env.PI_ORIGIN || 'http://127.0.0.1:8765';
	// Storybook reads host network interfaces on import. Load it only for its own test mode.
	const storybook =
		mode === 'storybook' ? await import('@storybook/addon-vitest/vitest-plugin') : null;
	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter({ fallback: 'index.html' })
			})
		],
		worker: { format: 'es' },
		optimizeDeps: { exclude: ['onnxruntime-web'] },
		server: {
			proxy: {
				'/cam': {
					target: env.MEDIA_ORIGIN || env.PI_ORIGIN || 'http://127.0.0.1:8889',
					secure: false
				},
				'/ws': { target: pi, ws: true, secure: false }
			}
		},
		test: {
			projects: [
				{
					extends: true,
					test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' }
				},
				...(storybook
					? [
							{
								extends: true,
								plugins: [storybook.storybookTest({ configDir: path.resolve('.storybook') })],
								test: {
									name: 'storybook',
									browser: {
										enabled: true,
										headless: true,
										provider: playwright({}),
										instances: [{ browser: 'chromium' as const }]
									}
								}
							}
						]
					: [])
			]
		}
	};
});
