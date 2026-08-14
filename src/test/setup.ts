import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from '../mocks/server'

/**
 * `onUnhandledRequest: 'error'` deliberately: in a test, a request nobody wrote
 * a handler for means the code is calling something we did not intend, and
 * that should fail loudly rather than escape to the real network.
 */
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
