import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The locally-issued development certificate, read from Node.
 *
 * Twin of `plugins/dev-cert.ts`, which does the same for Vite. Duplicated
 * rather than shared because that file lives in the Vite plugin world and
 * imports Vite's types; this one has to stay importable from a plain server
 * process. Both read the same files, written by `pnpm cert`
 * (`scripts/dev-cert.mjs`).
 *
 * The certificate matters more here than it used to: this server is now the
 * only thing a phone connects to, so its certificate is the one the phone must
 * trust. `scripts/dev-cert.mjs` already issues it with every LAN IPv4 in the
 * SAN, `extendedKeyUsage=serverAuth`, and a 397-day life — the three things iOS
 * insists on. See docs/IPHONE.md.
 */

/** How to spell "run a script" for whoever started the server. */
const RUN = (process.env.npm_config_user_agent ?? "").startsWith("npm/")
  ? "npm run"
  : "pnpm";

/*
 * Resolved from this file's own location, not `process.cwd()`.
 *
 * On the deployment machine this is started from a shortcut, a scheduled task
 * or a double-clicked .cmd, and none of those guarantee a working directory.
 * Resolving from the module means the server finds its certificate wherever it
 * was launched from — the difference between "it works" and "it silently falls
 * back to HTTP and the camera stops".
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CERT_DIR = resolve(ROOT, "certs");
const CA_CRT = resolve(CERT_DIR, "dev-ca.crt");
const SERVER_KEY = resolve(CERT_DIR, "dev-server.key");
const SERVER_CRT = resolve(CERT_DIR, "dev-server.crt");

/** The key/cert pair for `https.createServer`, or null when none was generated. */
export function localCert(): { key: Buffer; cert: Buffer } | null {
  if (!existsSync(SERVER_KEY) || !existsSync(SERVER_CRT)) return null;
  return { key: readFileSync(SERVER_KEY), cert: readFileSync(SERVER_CRT) };
}

/** The CA, for the `/dev-ca.crt` route. Null when `pnpm cert` has not been run. */
export function localCa(): Buffer | null {
  return existsSync(CA_CRT) ? readFileSync(CA_CRT) : null;
}

/** What to tell someone whose certificate is missing. */
export const CERT_HINT = `Nenhuma CA de desenvolvimento foi gerada. Rode: ${RUN} cert`;
