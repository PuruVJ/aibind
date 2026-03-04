import { createStreamHandler } from '@aibind/svelte/server';
import { models } from './models.server';

export const handle = createStreamHandler({
	models,
});
