import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // getUserMedia only works in a secure context. Opening the dev server from
    // a phone over http://192.168.x.x would have the camera blocked outright,
    // so we serve the LAN dev server over (self-signed) HTTPS instead.
    basicSsl(),
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

    // Once the real protocol API host is known, uncomment this so browser
    // requests to /api are proxied server-side and never hit CORS.
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
})
