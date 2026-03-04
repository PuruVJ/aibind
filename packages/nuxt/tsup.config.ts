import { defineConfig } from 'tsup';

export default defineConfig([
	{
		entry: { index: 'src/index.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		clean: true,
		outDir: 'dist',
		external: ['vue', 'ai', '@standard-schema/spec', 'zod', 'zod/v4', '@valibot/to-json-schema'],
	},
	{
		entry: { 'composables/agent': 'src/composables/agent.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		outDir: 'dist',
		external: ['vue', 'ai'],
	},
	{
		entry: { 'server/index': 'src/server/index.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		outDir: 'dist',
		external: ['ai'],
	},
]);
