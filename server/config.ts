/**
 * Everything the server reads from the environment, parsed once at boot.
 *
 * ## Why the names have no `VITE_` prefix
 *
 * That prefix is exactly what makes a variable visible to the browser bundle.
 * `UPSTREAM_URL` names the real government service, and nothing about it should
 * ever be inlined into JavaScript that a phone downloads — so it deliberately
 * does not carry the prefix, and Vite's default `envPrefix` (`['VITE_']`) drops
 * it on the floor when it builds. The same `.env` file therefore serves both
 * sides without either being able to read the other's half.
 *
 * See "The DTO boundary" in the README for why that separation matters.
 */

/*
 * Node ≥ 20.12 loads a `.env` itself; `engines` already requires ≥ 20.19, so
 * there is no reason to add `dotenv`. Missing file is not an error — the
 * defaults below cover a developer who has not written one yet, and the one
 * value that has no sensible default is checked explicitly.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env — fall through to the defaults and the check below.
}

/** `--http` / `--mock` on the command line, for Windows' sake — see below. */
const flags = new Set(process.argv.slice(2));

export const config = {
  /**
   * Whether to answer from `shared/mock-upstream.ts` instead of calling Mais
   * Cidadão.
   *
   * **Defaults to on, and that is the important part.** Permission to call the
   * real service belongs to a place and a person, not to whoever has this
   * checked out. Development happens on one machine and deployment on another,
   * and only the second is authorised — so "I just ran the server to see if it
   * works" must not be capable of filing a real protocol against a real
   * citizen's record. A submission has no undo.
   *
   * Turning it off is therefore a deliberate act, performed once, on the
   * machine that is allowed to do it: `MOCK_UPSTREAM=false` in that machine's
   * `.env`.
   *
   * This is the same reasoning as `VITE_USE_MOCK` on the client, and for the
   * same reason it is a separate switch: the client's mock only covers the
   * browser talking to us, this one covers us talking to the government.
   */
  mockUpstream: flags.has("--mock") || process.env.MOCK_UPSTREAM !== "false",

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
   * `pnpm server --http` is the portable spelling. The `HTTPS=false` env form
   * still works, but only on a shell where `VAR=value cmd` means anything —
   * which is not Windows' cmd or PowerShell, and Windows is where this is
   * deployed. Prefer the flag; it behaves the same everywhere.
   */
  https: !flags.has("--http") && process.env.HTTPS !== "false",

  /** The Mais Cidadão service. Scheme and host, no trailing slash, no path. */
  upstream: (process.env.UPSTREAM_URL ?? "").trim().replace(/\/+$/, ""),

  /**
   * How long to wait on the upstream service.
   *
   * Deliberately **below** the client's own timeout (`VITE_REQUEST_TIMEOUT_MS`,
   * 25s). The server should always be the one that gives up first, so the phone
   * receives a definite 504 rather than timing out on its own and never
   * learning whether the submission landed.
   */
  timeout: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 20_000),
};

/*
 * Refuse to boot rather than defaulting.
 *
 * Only when actually calling out: with the mock on there is nothing to point
 * at, and demanding the URL anyway would mean writing the address of a live
 * government service into the `.env` of every machine that will never contact
 * it.
 *
 * When the mock is off there is no safe default. A guessed URL either fails
 * every request or — far worse — silently points a batch of real submissions
 * somewhere nobody intended. Failing loudly at boot is the cheapest possible
 * moment to find that out.
 */
if (!config.mockUpstream && !config.upstream) {
  throw new Error(
    "MOCK_UPSTREAM=false mas UPSTREAM_URL não está definido no .env — o " +
      "servidor não sabe para onde encaminhar. Veja .env.example.",
  );
}
