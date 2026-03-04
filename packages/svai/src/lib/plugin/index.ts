import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { SvaiPluginOptions } from '../types.js';

const STREAM_ENDPOINT = `import { streamText } from 'ai';
import { getServerModel } from 'svai/server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { prompt, model: modelId, system } = await request.json();
	const model = getServerModel(modelId);
	const result = streamText({ model, prompt, system });
	return result.toTextStreamResponse();
};
`;

const STRUCTURED_ENDPOINT = `import { streamText, Output } from 'ai';
import { getServerModel } from 'svai/server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { prompt, model: modelId, system } = await request.json();
	const model = getServerModel(modelId);
	const result = streamText({
		model,
		prompt,
		system,
		output: Output.json()
	});
	return result.toTextStreamResponse();
};
`;

/**
 * Vite plugin that auto-generates streaming API endpoints for SvelteKit.
 * Creates /api/svai/stream and /api/svai/structured +server.ts files.
 */
export function svai(options: SvaiPluginOptions = {}): Plugin {
	const routePrefix = options.routePrefix ?? '/api/svai';

	return {
		name: 'svai',

		configResolved(config) {
			if (options.skipRouteGeneration) return;

			const root = config.root;
			const routesDir = join(root, 'src', 'routes');
			const apiDir = join(routesDir, ...routePrefix.split('/').filter(Boolean));

			// Create stream endpoint
			const streamDir = join(apiDir, 'stream');
			const streamFile = join(streamDir, '+server.ts');
			if (!existsSync(streamFile)) {
				mkdirSync(streamDir, { recursive: true });
				writeFileSync(streamFile, STREAM_ENDPOINT);
			}

			// Create structured endpoint
			const structuredDir = join(apiDir, 'structured');
			const structuredFile = join(structuredDir, '+server.ts');
			if (!existsSync(structuredFile)) {
				mkdirSync(structuredDir, { recursive: true });
				writeFileSync(structuredFile, STRUCTURED_ENDPOINT);
			}
		}
	};
}

export { createStreamHandler } from './handler.js';
export type { SvaiPluginOptions } from '../types.js';
