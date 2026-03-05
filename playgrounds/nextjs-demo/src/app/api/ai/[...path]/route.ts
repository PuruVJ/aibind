import { createStreamHandler } from "@aibind/nextjs/server";
import { models } from "@/lib/models.server";

const handler = createStreamHandler({ models });

export async function POST(request: Request) {
  return handler(request);
}
