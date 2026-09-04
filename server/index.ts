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
   * The upstream, printed loudly and every time.
   *
   * Every protocol this server files is real and cannot be taken back, and the
   * only thing saying where they go is a line in a `.env` nobody looks at
   * twice. So the server says it out loud on every start, and `GET /api/health`
   * answers the same question from anywhere on the network.
   */
  console.log(`\n  ⚠  SUBMISSÕES REAIS → ${config.upstream}`);
  console.log(`     Cada protocolo enviado é definitivo. Não há desfazer.`);

  if (!hasBuild()) {
    console.log(`\n  dist/ ausente — a API responde, mas o app não. Rode: pnpm build`);
  }
  console.log("");
});
