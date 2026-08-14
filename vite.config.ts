import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { mockApi } from './plugins/mock-api.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // Mirrors the default in src/lib/config.ts: mocked unless explicitly off.
  const useMock = env.VITE_USE_MOCK !== 'false'

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      // getUserMedia only works in a secure context. Opening the dev server
      // from a phone over http://192.168.x.x would have the camera blocked
      // outright, so we serve the LAN dev server over (self-signed) HTTPS.
      //
      // Note the certificate covers only localhost/127.0.0.1, so a phone on
      // the LAN IP always sees a certificate warning. That is expected and
      // harmless here — but it is also why mocking must not rely on a service
      // worker; see plugins/mock-api.ts.
      basicSsl(),
      // Answers the three mock endpoints from the dev server itself.
      mockApi({
        enabled: useMock,
        lookupUrl: env.VITE_LOOKUP_URL ?? '/api/protocols',
        protocolUrl: env.VITE_PROTOCOL_URL ?? '/api/protocols',
        protocolAsUrl: env.VITE_PROTOCOL_AS_URL ?? '/api/protocols-as',
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Bind to 0.0.0.0 so the phone can reach the dev server over the LAN.
      host: true,
      port: 5173,

      // Once the real protocol API host is known, set VITE_USE_MOCK=false and
      // uncomment this so browser requests to /api are proxied server-side and
      // never hit CORS.
      //
      // proxy: {
      //   '/api': {
      //     target: 'https://the-real-host.example.gov.br',
      //     changeOrigin: true,
      //     secure: false,
      //     rewrite: (path) => path.replace(/^\/api/, ''),
      //   },
      // },
    },
    preview: {
      host: true,
      port: 4173,
    },
  }
})
