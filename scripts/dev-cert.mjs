#!/usr/bin/env node
/**
 * Generates a development certificate that phones can actually trust.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `@vitejs/plugin-basic-ssl` issues a certificate valid only for `localhost`
 * and `127.0.0.1`. A phone reaches the dev server at its LAN address, which is
 * not in that certificate, so every browser flags the origin — and a browser
 * refuses to register a service worker on an origin with a certificate error.
 * That is why the app would only ever add a home-screen *shortcut* instead of
 * installing: no worker, no install. iOS is stricter still and may not offer to
 * proceed at all.
 *
 * This issues two things instead:
 *
 *   1. A local certificate authority (`dev-ca.crt`). Install this **once** on
 *      each phone. It is long-lived and never changes, so a device trusts it
 *      permanently.
 *   2. A server certificate signed by that CA, listing `localhost`, the
 *      loopback addresses, and every LAN address this machine currently has.
 *      Regenerated freely — re-running after your DHCP lease changes costs
 *      nothing and does *not* require re-trusting anything on the phone.
 *
 * The server certificate is issued for 397 days on purpose: it keeps renewals regular
 * and stays within conservative compatibility limits for Apple devices.
 *
 * Everything lands in `certs/`, which is git-ignored — these are secrets, and a
 * committed CA key would let anyone mint certificates your devices trust.
 *
 * Usage:  npm run cert   (or: npm run cert)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

/**
 * How to spell "run a script" for whoever invoked us, so the instructions
 * printed below are copy-pasteable under either package manager.
 */
const RUN = (process.env.npm_config_user_agent ?? "").startsWith("npm/")
  ? "npm run"
  : "npm run";

const CERT_DIR = resolve(process.cwd(), "certs");
const CA_KEY = resolve(CERT_DIR, "dev-ca.key");
const CA_CRT = resolve(CERT_DIR, "dev-ca.crt");
const SERVER_KEY = resolve(CERT_DIR, "dev-server.key");
const SERVER_CRT = resolve(CERT_DIR, "dev-server.crt");
const SERVER_CSR = resolve(CERT_DIR, "dev-server.csr");
const SERVER_EXT = resolve(CERT_DIR, "dev-server.ext");

/**
 * Where to find openssl.
 *
 * On Linux and macOS it is on PATH and there is nothing to think about. On
 * Windows it usually is **not** — but Git for Windows ships one, and this
 * project's deployment machine is a Windows box that will certainly have Git
 * installed. Looking there turns "openssl is not recognized as an internal or
 * external command" into a certificate, without asking anyone to install
 * anything or edit a PATH.
 *
 * `where`/`which` is not used: PATH is tried first anyway by execFileSync, and
 * the fallbacks are cheap to test directly.
 */
const OPENSSL_CANDIDATES = [
  "openssl",
  ...(process.platform === "win32"
    ? [
        // Git for Windows, 64- and 32-bit install locations.
        "C:/Program Files/Git/usr/bin/openssl.exe",
        "C:/Program Files (x86)/Git/usr/bin/openssl.exe",
        // Git installed per-user, which is the default the installer offers.
        resolve(process.env.LOCALAPPDATA ?? "", "Programs/Git/usr/bin/openssl.exe"),
        // Chocolatey and the Win32/Win64 OpenSSL installers.
        "C:/Program Files/OpenSSL-Win64/bin/openssl.exe",
        "C:/ProgramData/chocolatey/bin/openssl.exe",
      ]
    : []),
];

/** Resolved once by `requireOpenssl`, then reused by every call. */
let opensslPath = null;

function openssl(args) {
  return execFileSync(opensslPath ?? "openssl", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function requireOpenssl() {
  for (const candidate of OPENSSL_CANDIDATES) {
    // A bare "openssl" is resolved through PATH by execFileSync; an absolute
    // path has to exist first, or the error is about the file rather than
    // about openssl being unusable.
    if (candidate !== "openssl" && (!candidate || !existsSync(candidate))) continue;
    try {
      opensslPath = candidate;
      openssl(["version"]);
      return;
    } catch {
      opensslPath = null;
    }
  }

  console.error(
    "\n  openssl is required and was not found.\n\n" +
      "  Windows:        install Git for Windows — it bundles openssl, and this\n" +
      "                  script looks for it there. https://git-scm.com/download/win\n" +
      "  Debian/Ubuntu:  sudo apt install openssl\n" +
      "  macOS:          brew install openssl\n",
  );
  process.exit(1);
}

/** Every non-internal IPv4 address this machine answers on. */
function lanAddresses() {
  const found = [];
  for (const [iface, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // `family` is the number 4 on some Node versions and the string 'IPv4'
      // on others; accept both rather than depend on which.
      const isIPv4 = address.family === "IPv4" || address.family === 4;
      if (isIPv4 && !address.internal) {
        found.push({ iface, address: address.address });
      }
    }
  }
  return found;
}

function createCa() {
  if (existsSync(CA_KEY) !== existsSync(CA_CRT)) {
    throw new Error(
      "Incomplete CA: certs/dev-ca.key and certs/dev-ca.crt must both exist. " +
      "Restore the missing file from backup. To deliberately replace the CA, " +
      "move the remaining CA file aside and run again; every device must then trust the new CA.",
    );
  }
  if (existsSync(CA_KEY) && existsSync(CA_CRT)) {
    console.log("  CA          reusing certs/dev-ca.crt (already trusted on your devices)");
    return false;
  }

  openssl([
    "req",
    "-x509",
    "-newkey", "rsa:2048",
    "-sha256",
    "-days", "3650",
    "-nodes",
    "-keyout", CA_KEY,
    "-out", CA_CRT,
    "-subj", "/CN=Leitor de Protocolos Dev CA/O=Leitor de Protocolos",
    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ]);

  console.log("  CA          created certs/dev-ca.crt");
  return true;
}

function createServerCert(names) {
  const san = names.map((n) => (n.kind === "dns" ? `DNS:${n.value}` : `IP:${n.value}`)).join(",");

  writeFileSync(
    SERVER_EXT,
    [
      "basicConstraints=CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      // Required by iOS 13+ for any TLS server certificate.
      "extendedKeyUsage=serverAuth",
      `subjectAltName=${san}`,
      "",
    ].join("\n"),
  );

  openssl([
    "req",
    "-newkey", "rsa:2048",
    "-sha256",
    "-nodes",
    "-keyout", SERVER_KEY,
    "-out", SERVER_CSR,
    "-subj", "/CN=Leitor de Protocolos dev server",
  ]);

  openssl([
    "x509",
    "-req",
    "-in", SERVER_CSR,
    "-CA", CA_CRT,
    "-CAkey", CA_KEY,
    "-CAcreateserial",
    "-out", SERVER_CRT,
    // Conservative lifetime; Apple’s public-root 398-day cap does not apply to this private CA.
    "-days", "397",
    "-sha256",
    "-extfile", SERVER_EXT,
  ]);

  rmSync(SERVER_CSR, { force: true });
  rmSync(SERVER_EXT, { force: true });
}

function main() {
  requireOpenssl();
  mkdirSync(CERT_DIR, { recursive: true });

  const lan = lanAddresses();
  const names = [
    { kind: "dns", value: "localhost" },
    { kind: "ip", value: "127.0.0.1" },
    { kind: "ip", value: "::1" },
    ...lan.map((entry) => ({ kind: "ip", value: entry.address })),
  ];

  console.log("");
  const freshCa = createCa();
  createServerCert(names);
  console.log("  server      created certs/dev-server.crt (397 days)");

  console.log("\n  Covers:");
  for (const name of names) {
    console.log(`    ${name.value}`);
  }

  if (lan.length === 0) {
    console.log(
      "\n  No LAN address found — you are probably offline. The certificate\n" +
        "  covers localhost only; re-run once you are on the network.",
    );
  }

  console.log("\n  Next:");
  console.log(`    1. ${RUN} start   (build and serve the app + API; configure .env first)`);
  console.log(`    2. In another terminal: ${RUN} cert:serve   (temporary HTTP download, Ctrl+C when done)`);
  for (const entry of lan) {
    console.log(`       On the phone, open  http://${entry.address}:8080/dev-ca.crt  to install the CA`);
    break;
  }
  console.log("    3. Android: Settings > Security > Encryption & credentials > Install a certificate > CA");
  console.log("       iOS:     open the file, then Settings > General > VPN & Device Management > install,");
  console.log("                then Settings > General > About > Certificate Trust Settings > enable it");
  console.log("    4. Open the HTTPS app URL printed by the application server and allow camera access.");

  if (!freshCa) {
    console.log("\n  The CA was reused, so devices that already trust it need no change.");
  }
  console.log("");
}

main();
