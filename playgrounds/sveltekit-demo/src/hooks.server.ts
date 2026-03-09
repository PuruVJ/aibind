import { createStreamHandler } from "@aibind/sveltekit/server";
import { models } from "./models.server";
import { toolsets } from "./toolsets.server";

export const handle = createStreamHandler({
  models,
  resumable: true,
  toolsets,
});
