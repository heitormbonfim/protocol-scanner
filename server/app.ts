import express, { type NextFunction, type Request, type Response } from "express";
import { apiRoutes } from "./api.routes.ts";
import { serveCa, serveStatic, spaFallback } from "./shared/static.ts";

/**
 * The Express app, and — the reason this file exists — the **order** its
 * middleware runs in.
 *
 * That order is load-bearing, so it lives in one place rather than being spread
 * across the modules:
 *
 *   1. `/api` first, ending in its own terminal 404. Nothing below can ever see
 *      an API path, which is what stops a mistyped route being answered with
 *      200 + HTML by the fallback at step 4.
 *   2. `/dev-ca.crt` before the static handler, so it is served with the
 *      content type that makes a phone offer to install it rather than
 *      whatever `express.static` would infer.
 *   3. The built app.
 *   4. The SPA fallback, terminal.
 *
 * There is no `cors` middleware and there should not be one: the app is served
 * from this same origin, which is the entire point of the design.
 */
export function createApp() {
  const app = express();

  // Nothing gains from advertising the framework.
  app.disable("x-powered-by");

  // `express.json` is mounted on `/api` alone rather than globally: the two
  // submissions are bodyless PUTs, and parsing a body for them buys nothing.
  app.use("/api", express.json({ limit: "64kb" }), apiRoutes);

  app.get("/dev-ca.crt", serveCa);
  app.use(serveStatic);
  app.use(spaFallback);

  /*
   * The last resort.
   *
   * Express 5 forwards a rejected promise from an async handler here on its
   * own, so this catches anything a controller failed to. It must take four
   * arguments to be recognised as an error handler — hence `_next`, which the
   * underscore keeps `noUnusedParameters` quiet about.
   *
   * The error is logged, never sent: an upstream stack trace could carry the
   * request body with it, and that body is the citizen's record.
   */
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[erro não tratado]", error instanceof Error ? error.message : error);
    if (res.headersSent) return;
    res.status(500).json({ message: "Erro interno no servidor local" });
  });

  return app;
}
