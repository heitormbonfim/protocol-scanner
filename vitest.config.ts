import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Kept separate from vite.config.ts on purpose: the tests want neither the
 * self-signed HTTPS plugin nor the React Compiler babel pass, and skipping the
 * compiler keeps the suite fast without changing behaviour under test.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Must mirror the alias in vite.config.ts, or components importing '@/...'
    // fail to resolve under test.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    /**
     * The suite's own environment, fixed here rather than read from `.env`.
     *
     * Vite loads `.env` under test too, so without this the tests run against
     * whatever host and token the developer happens to have configured — a
     * suite that passes on a fresh clone and fails for whoever is pointed at
     * production. These values take precedence over any `.env` file.
     *
     * An empty base URL on purpose: every request is answered by MSW on the
     * app's own origin, and no real token belongs in a test run.
     */
    env: {
      VITE_USE_MOCK: 'true',
      VITE_API_URL: '',
      VITE_AUTH_TOKEN: '',
      VITE_REQUEST_TIMEOUT_MS: '5000',
    },
  },
})
