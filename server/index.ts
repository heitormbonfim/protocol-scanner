import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { config } from "./config.ts";
import { createApp } from "./app.ts";
import { localCert } from "./shared/cert.ts";
import { hasBuild } from "./shared/static.ts";

/**
 * Boot.
 *
 * One process, one port, serving the built app and the API together. That is
 * what gives the phone a single origin — no CORS, no mixed content, and one
 * certificate to trust instead of two.
 */

/** Every LAN IPv4, so the banner can print the URL to type into a phone. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface && !iface.internal && iface.family === "IPv4")
    .map((iface) => iface!.address);
}

const cert = config.https ? localCert() : null;

if (config.https && !cert) {
  // Not fatal, but it does mean no phone can use this: `getUserMedia` needs a
  // secure context, so the camera simply will not start over plain HTTP on a
  // LAN address.
  console.warn(
    "⚠  Nenhum certificado em certs/ — subindo em HTTP.\n" +
      "   A câmera não funciona assim no celular. Rode: pnpm cert",
  );
}

const app = createApp();
const server = cert
  ? createHttpsServer({ key: cert.key, cert: cert.cert }, app)
  : createHttpServer(app);

server.listen(config.port, "0.0.0.0", () => {
  const scheme = cert ? "https" : "http";

  console.log(`\n  Leitor de Protocolos — servidor local`);
  console.log(`  ${scheme}://localhost:${config.port}`);
  for (const address of lanAddresses()) {
    console.log(`  ${scheme}://${address}:${config.port}   ← no celular`);
  }

  /*
   * Which mode, printed loudly and every time.
   *
   * This used to be visible in the app itself: with mocking on, the client
   * forced its base URL to its own origin, so it was structurally impossible to
   * reach a real service by accident. Now that the app always calls a relative
   * `/api`, that safety property lives here — which process you started, with
   * which settings, is the only thing deciding whether a submission is real.
   * So it gets said out loud, in the two places someone might look: here, and
   * `GET /api/health`.
   */
  if (config.mockUpstream) {
    console.log(`\n  ✓  MODO SIMULADO — nenhuma requisição sai desta máquina.`);
    console.log(`     Para valer: MOCK_UPSTREAM=false no .env (só na máquina autorizada).`);
  } else {
    console.log(`\n  ⚠  SUBMISSÕES REAIS → ${config.upstream}`);
    console.log(`     Cada protocolo enviado é definitivo. Não há desfazer.`);
  }

  if (!hasBuild()) {
    console.log(`\n  dist/ ausente — a API responde, mas o app não. Rode: pnpm build`);
  }
  console.log("");
});
