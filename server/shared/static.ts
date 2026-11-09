import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { clientDirectory } from "../paths.ts";
import express, { type Request, type RequestHandler, type Response } from "express";
import { CERT_HINT, localCa } from "./cert.ts";

/**
 * Serving the built app, so the phone has exactly one origin to talk to.
 *
 * That single origin is what removes CORS and mixed-content from the problem
 * entirely: `https://192.168.1.57:4173` fetches `/api/protocolos` against
 * itself. It is also why there is only one certificate to install on a phone
 * rather than two.
 */

// From this file's location rather than the working directory — see the same
// note in cert.ts. A shortcut on the deployment machine has no reliable cwd.
const DIST = clientDirectory;

/** How to spell "run a script" for whoever started the server. */
const RUN = (process.env.npm_config_user_agent ?? "").startsWith("npm/")
  ? "npm run"
  : "npm run";

export const hasBuild = (): boolean => existsSync(resolve(DIST, "index.html"));

/**
 * Hands the CA to a phone, which installs it by visiting the URL.
 *
 * The `application/x-x509-ca-cert` content type is what makes Android and iOS
 * treat the response as a certificate to install rather than a file to
 * download. **No `Content-Disposition`**: on iOS an attachment disposition
 * sends it to Files instead of offering it as a configuration profile, and the
 * install flow dead-ends there. Same rule as `plugins/dev-cert.ts`.
 */
export const serveCa: RequestHandler = (_req, res) => {
  const ca = localCa();
  if (!ca) {
    res.status(404).type("text/plain; charset=utf-8").send(CERT_HINT);
    return;
  }
  res.setHeader("Content-Type", "application/x-x509-ca-cert");
  res.send(ca);
};

/**
 * `dist/`, with cache lifetimes that match how each file is named.
 *
 * `/assets/` filenames carry a content hash, so a year of immutable caching can
 * never serve something stale. `sw.js` and `index.html` keep their names across
 * every deploy, so they must be revalidated on each load — a cached service
 * worker is how an app gets stuck on an old build with no way to push a fix.
 */
export const serveStatic: RequestHandler = express.static(DIST, {
  // The SPA fallback below owns "/" — letting static serve index.html here
  // would skip the no-build check.
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith("sw.js") || filePath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-cache");
    } else if (filePath.includes(`${sep}assets${sep}`)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
});

/**
 * Everything that is not the API and not a file: hand back the app shell.
 *
 * Mounted with `app.use` rather than `app.get('*')` — under Express 5's
 * path-to-regexp a bare `'*'` pattern throws at boot rather than matching.
 *
 * This runs **after** the `/api` router, which ends in its own terminal 404.
 * That ordering is load-bearing: without it a mistyped API route would fall
 * through to here and answer 200 with HTML, which `submit()` in
 * `src/lib/api.ts` would report as a successful submission that never happened.
 */
export const spaFallback: RequestHandler = (_req: Request, res: Response) => {
  if (!hasBuild()) {
    res
      .status(503)
      .type("text/plain; charset=utf-8")
      .send(`O app ainda não foi construído. Rode: ${RUN} build`);
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile("index.html", { root: DIST });
};
