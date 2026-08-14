import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/**
 * Node-side mocking for the test suite, wired up in `src/test/setup.ts`.
 *
 * `onUnhandledRequest: 'error'` here, unlike the browser worker's 'bypass': in
 * a test, a request nobody wrote a handler for is a bug worth failing on, not
 * something to quietly let through.
 */
export const server = setupServer(...handlers)
