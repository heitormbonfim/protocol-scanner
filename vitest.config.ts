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
  },
})
