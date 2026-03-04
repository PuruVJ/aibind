import { createStreamHandler } from '@aibind/solidstart/server';
import { models } from '~/lib/models.server';

const handler = createStreamHandler({
  models,
});

export async function POST({ request }: { request: Request }) {
  return handler(request);
}
