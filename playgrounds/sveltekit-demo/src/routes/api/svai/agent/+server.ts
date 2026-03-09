import { ServerAgent } from "@aibind/sveltekit/agent";
import { stepCountIs } from "ai";
import { models } from "../../../../models.server";
import { toolsets } from "../../../../toolsets.server";

const agent = new ServerAgent({
  model: models.gpt,
  system:
    "You are a helpful assistant with access to tools. Use them when the user asks about weather or time. Be concise.",
  toolsets,
  toolset: "assistant",
  stopWhen: stepCountIs(5),
});

export const POST = ({ request }: { request: Request }): Promise<Response> =>
  agent.handle(request);
