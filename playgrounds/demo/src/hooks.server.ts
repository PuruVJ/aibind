import { createStreamHandler } from 'svai/server';
import { models } from './models.server';

export const handle = createStreamHandler({
	models,
});
