import { ServerAgent, AgentGraph } from "@aibind/sveltekit/agent";
import { models } from "../../../../models.server";
import { toolsets } from "../../../../toolsets.server";

/**
 * Research pipeline graph:
 *
 *   __start__
 *       │
 *    [research] ──(has findings?)──> [analyze] ──> [summarize] ──> __end__
 *                                        │
 *                              (no findings) ──> [summarize] ──> __end__
 *
 * - research: gathers raw facts using tools (weather, time) or general knowledge
 * - analyze:  extracts structure and patterns from the research output
 * - summarize: distills everything into a clear, actionable answer
 */
const graph = new AgentGraph()
  .addNode("research", {
    system:
      "You are a meticulous research assistant. Your job is to gather specific, concrete facts about the user's question. Use available tools when relevant (weather, time). Be thorough but concise — bullet points preferred. End your response with a line that says 'FINDINGS: <one sentence summary of what you found>'.",
    tools: toolsets.assistant,
    // If the research output is substantive (>80 chars), route to analyze.
    // Short or empty outputs go straight to summarize.
    extractContext: ({ text }) => ({ hasFindings: text.trim().length > 80 }),
  })
  .addNode("analyze", {
    system:
      "You are an analytical assistant. You receive research findings and extract key patterns, implications, and structure. Identify what's most important, what's uncertain, and what actions or conclusions follow. Write in clear numbered points.",
  })
  .addNode("summarize", {
    system:
      "You are a concise writing assistant. Synthesize everything from the conversation into a single, polished, direct answer to the original user question. Write as if answering the user for the first time — no meta-commentary about the process. 2–4 sentences max.",
  })
  .addEdge("__start__", "research")
  .addConditionalEdges("research", (ctx) =>
    ctx.hasFindings ? "analyze" : "summarize",
  )
  .addEdge("analyze", "summarize")
  .addEdge("summarize", "__end__");

const agent = new ServerAgent({
  model: models.gpt,
  system:
    "You are a research pipeline. Follow your current role instructions precisely.",
  graph,
});

export const POST = ({ request }: { request: Request }): Promise<Response> =>
  agent.handle(request);
