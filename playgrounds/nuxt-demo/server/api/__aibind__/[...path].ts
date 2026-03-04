import { createStreamHandler } from '@aibind/nuxt/server';

const handler = createStreamHandler({
  get models() {
    return getModels();
  },
});

export default defineEventHandler(async (event) => {
  return handler(toWebRequest(event));
});
