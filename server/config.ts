import { resolve } from "node:path";
import { appRoot } from "./paths.ts";
/**
 * Everything the server reads from the environment, parsed once at boot.
 *
 * Two settings, both in the repository root's `.env`, neither prefixed
 * `VITE_` — that prefix is what would make a value reach the browser bundle,
 * and the address of the Mais Cidadão service must not. Vite's default
 * `envPrefix` drops anything without it, so one file safely serves both sides.
 *
 * Timeouts are deliberately **not** here. They are a design decision rather
 * than a per-machine setting, and the relationship between them matters — see
 * UPSTREAM_TIMEOUT_MS below and REQUEST_TIMEOUT_MS in src/lib/api.ts. As env
 * vars they could be set inconsistently on one machine and nowhere else; as
 * constants they cannot.
 */

/*
 * Node ≥ 20.12 loads a `.env` itself; `engines` already requires ≥ 20.19, so
 * there is no reason to add `dotenv`. A missing file is not an error here —
 * the check below is what actually refuses to continue.
 */
try {
  process.loadEnvFile(resolve(appRoot, ".env"));
} catch {
  // No .env. UPSTREAM_URL will be empty, and the check below will say so.
}

/** `--http` on the command line — see `https` below. */
const flags = new Set(process.argv.slice(2));

export const config = {
  /**
   * The single port serving both the app and the API.
   *
   * 4173 rather than something new: phones already have it bookmarked from
   * when `vite preview` lived here.
   */
  port: Number(process.env.PORT ?? 4173),

  /**
   * HTTPS unless explicitly turned off. It has to be on for a phone, because
   * `getUserMedia` needs a secure context and the phone reaches this over a LAN
   * IP.
   *
   * Off is for exactly one case: `http://localhost:4173` counts as a secure
   * context, so the camera *and* the service worker both work there with no
   * certificate at all.
   *
   * `npm run server:http` is the portable spelling. A flag rather than an env var
   * because `HTTPS=false cmd` means nothing in Windows' cmd or PowerShell, and
   * Windows is where this is deployed.
   */
  https: !flags.has("--http"),

  /** The Mais Cidadão service. Scheme and host, no trailing slash, no path. */
  upstream: (process.env.UPSTREAM_URL ?? "").trim().replace(/\/+$/, ""),
};

/**
 * How long to wait on the Mais Cidadão service.
 *
 * Deliberately **below** the client's own timeout (`REQUEST_TIMEOUT_MS` in
 * src/lib/api.ts, 25s). The server should always be the one that gives up
 * first, so the phone receives a definite 504 rather than timing out on its own
 * and never learning whether the submission landed — which, for an operation
 * with no undo, is the worst answer available.
 */
export const UPSTREAM_TIMEOUT_MS = 20_000;

/*
 * Refuse to boot rather than defaulting.
 *
 * There is no safe default. A guessed URL either fails every request or — far
 * worse — silently points a batch of real submissions somewhere nobody
 * intended. Failing loudly at boot is the cheapest possible moment to find out.
 */
if (!config.upstream) {
  throw new Error(
    "UPSTREAM_URL não está definido no .env — o servidor não sabe para onde " +
      "encaminhar. Veja .env.example.",
  );
}
