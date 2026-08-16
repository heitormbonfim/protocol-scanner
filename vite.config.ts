import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { mockApi } from './plugins/mock-api.ts'
import { devCa, localCert } from './plugins/dev-cert.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // Mirrors the default in src/lib/config.ts: mocked unless explicitly off.
  const useMock = env.VITE_USE_MOCK !== 'false'

  /**
   * HTTPS is the default, because `getUserMedia` needs a secure context and a
   * phone reaches this over the LAN IP.
   *
   * `HTTPS=false` serves plain HTTP instead, which is useful for exactly one
   * thing: exercising the installed PWA. A browser refuses to register a
   * service worker on an origin with a certificate error, so the self-signed
   * LAN server can never run one — but `http://localhost` counts as a secure
   * context, so there the worker *and* the camera both work. See the README,
   * "Testing the PWA", and `pnpm preview:pwa`.
   *
   * Read from `process.env` rather than `loadEnv` on purpose: it is a property
   * of how you are running the server, not app configuration, and it has no
   * business in a `.env` file that also carries endpoints and a token.
   */
  const useHttps = process.env.HTTPS !== 'false'

  /**
   * A certificate from `pnpm cert`, if one has been generated.
   *
   * This is what makes the app installable on a phone. `basicSsl()` below
   * covers only localhost, so a phone on the LAN address always sees a
   * certificate error — and a browser refuses to register a service worker on
   * such an origin, which is why the app could only ever add a home-screen
   * shortcut instead of installing. `pnpm cert` issues one that covers the LAN
   * address and is signed by a CA you install on the phone once.
   */
  const cert = useHttps ? localCert() : null

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
      //
      // Only when `pnpm cert` has not been run: a generated certificate is
      // supplied through `server.https` below and is strictly better, since it
      // is the one a phone can be made to trust.
      ...(useHttps && !cert ? [basicSsl()] : []),
      // Serves /dev-ca.crt so a phone can install the CA by visiting the URL.
      devCa(),
      // Answers the three mock endpoints from the dev server itself.
      mockApi({
        enabled: useMock,
        lookupUrl: env.VITE_LOOKUP_URL ?? '/api/protocols',
        protocolUrl: env.VITE_PROTOCOL_URL ?? '/api/protocols',
        protocolAsUrl: env.VITE_PROTOCOL_AS_URL ?? '/api/protocols-as',
        // When a token is configured, the mock demands it — so a request that
        // forgets the header fails here rather than in production.
        token: env.VITE_AUTH_TOKEN?.trim(),
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
      ...(cert ? { https: cert } : {}),

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
    // The PWA can only be exercised from a production build, so preview is
    // where a phone install is actually tested — it needs the certificate too.
    preview: {
      host: true,
      port: 4173,
      ...(cert ? { https: cert } : {}),
    },
  }
})
