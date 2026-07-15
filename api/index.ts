import type { IncomingMessage, ServerResponse } from "http";
import app, { ready } from "../server/index";

// Vercel serverless entry point.
//
// Vercel sets process.env.VERCEL=1 automatically, so server/index.ts does NOT
// call httpServer.listen() in this environment. We instead await `ready` (a
// promise that resolves once registerRoutes has finished wiring the Express
// app) and then delegate the incoming request straight to the Express handler.
//
// All /api/(.*) requests are rewritten to this single function by vercel.json.
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await ready;
  (
    app as unknown as (req: IncomingMessage, res: ServerResponse) => void
  )(req, res);
}
