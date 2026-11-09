import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import { devCa, localCert } from './plugins/dev-cert.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /*
   * The Express server's port, so the proxy below follows it.
   *
   * Loaded with an empty prefix because `PORT` deliberately carries no `VITE_`
   * one — that prefix is what would expose it to the bundle, and the server's
   * settings have no business there. See .env.example. This only affects what
   * this config file can read; what reaches the browser is governed by Vite's
   * `envPrefix`, which is untouched.
   */
  const serverPort = loadEnv(mode, process.cwd(), '').PORT || '4173'

  /**
   * HTTPS is the default, because `getUserMedia` needs a secure context and a
   * phone reaches this over the LAN IP.
   *
   * Read from `process.env` rather than `loadEnv` on purpose: it is a property
   * of how you are running the server, not app configuration. `server/` uses a
   * `--http` flag for the same thing — see server/config.ts.
   */
  const useHttps = process.env.HTTPS !== 'false'

  /**
   * A certificate from `npm run cert`, if one has been generated.
   *
   * This is what makes the app installable on a phone. `basicSsl()` below
   * covers only localhost, so a phone on the LAN address always sees a
   * certificate error — and a browser refuses to register a service worker on
   * such an origin, which is why the app could only ever add a home-screen
   * shortcut instead of installing. `npm run cert` issues one that covers the LAN
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
      // Only when `npm run cert` has not been run: a generated certificate is
      // supplied through `server.https` below and is strictly better, since it
      // is the one a phone can be made to trust.
      ...(useHttps && !cert ? [basicSsl()] : []),
      // Serves /dev-ca.crt so a phone can install the CA by visiting the URL.
      devCa(),
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

      /*
       * `/api` comes from the Express server in `server/`, which has to be
       * running (`npm run server:watch`) for the dev server to be of any use.
       *
       * Forwarded here rather than called directly so the browser still only
       * ever talks to one origin — no CORS, and no second certificate to
       * accept. `secure: false` because that server uses the same self-signed
       * certificate, and it is Node doing the TLS, not the browser.
       */
      proxy: {
        '/api': {
          target: `https://localhost:${serverPort}`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    /*
     * Preview, on 4174 rather than 4173.
     *
     * 4173 belongs to `npm run server`, which is what a phone actually connects
     * to. Leaving both here would be a trap: `strictPort` defaults to false for
     * preview, so with the server already running this would silently hop to
     * 4174 anyway — and whoever has 4173 bookmarked would get the Express copy
     * while believing they were testing a fresh build.
     */
    preview: {
      host: true,
      port: 4174,
      strictPort: true,
      ...(cert ? { https: cert } : {}),
    },
  }
})
