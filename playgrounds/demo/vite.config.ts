import { sveltekit } from '@sveltejs/kit/vite';
import { svai } from 'svai/plugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svai(), sveltekit()]
});
