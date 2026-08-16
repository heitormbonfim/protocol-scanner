/**
 * Blocks `npm install` and `yarn install` in this repo.
 *
 * Only pnpm-lock.yaml is committed, and only it pins the full transitive tree.
 * npm ignores it, resolves every range afresh, and writes a package-lock.json
 * whose versions nobody has tested — which is how an install that "worked
 * yesterday" breaks the build today.
 *
 * Runs from the "preinstall" script. Deliberately dependency-free: it has to
 * work before node_modules exists.
 */

const agent = process.env.npm_config_user_agent ?? "";
const manager = agent.split("/")[0];

// Run directly (`node scripts/only-pnpm.mjs`) with no agent set: nothing to check.
if (manager && manager !== "pnpm") {
  console.error(`
  This project uses pnpm. You ran ${manager}.

    pnpm install

  If you do not have pnpm:  corepack enable && corepack prepare --activate
  (The pinned version is in package.json under "packageManager".)
`);
  process.exit(1);
}
