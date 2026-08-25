/**
 * Allows `pnpm install` and `npm install`; blocks the rest.
 *
 * A package manager is only safe here if its lockfile is committed — that is
 * what pins the full transitive tree, so an install today resolves what was
 * tested yesterday. Two are:
 *
 *   pnpm  → pnpm-lock.yaml
 *   npm   → package-lock.json
 *
 * pnpm is the primary; npm is supported because pnpm (really, corepack and
 * node_modules symlinks) is unreliable on some Windows machines. Keep both
 * lockfiles in step — see "Scripts" in the README.
 *
 * yarn and bun have no lockfile here, so they would resolve every range afresh
 * and produce a tree nobody has tested, which is how an install that "worked
 * yesterday" breaks the build today.
 *
 * Runs from the "preinstall" script. Deliberately dependency-free: it has to
 * work before node_modules exists.
 */

const SUPPORTED = new Set(["pnpm", "npm"]);

const agent = process.env.npm_config_user_agent ?? "";
const manager = agent.split("/")[0];

// Run directly (`node scripts/check-package-manager.mjs`) with no agent set:
// nothing to check.
if (manager && !SUPPORTED.has(manager)) {
  console.error(`
  This project supports pnpm and npm. You ran ${manager}.

    pnpm install     preferred — pnpm-lock.yaml is the reference tree
    npm install      supported — installs package-lock.json

  Only those two lockfiles are committed. ${manager} would resolve its own
  untested versions.
`);
  process.exit(1);
}
