#!/usr/bin/env node
// Temporary onboarding server: only the public CA is available over HTTP.
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createCaServer(pem) {
  const ca = new X509Certificate(pem);
  if (!ca.ca) throw new Error('dev-ca.crt must be a CA certificate.');
  // DER contains only the certificate, even if the input PEM contains other data.
  return createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if ((req.url ?? '').split('?')[0] !== '/dev-ca.crt') {
      res.writeHead(404).end('Not found');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Length': ca.raw.length,
    });
    res.end(req.method === 'HEAD' ? undefined : ca.raw);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const port = Number(process.argv[2] ?? 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Port must be an integer between 1 and 65535.');
    }
    const pem = readFileSync(resolve('certs/dev-ca.crt'));
    const ca = new X509Certificate(pem);
    const server = createCaServer(pem);
    server.on('error', (error) => {
      console.error(`CA download server: ${error.message}. Try npm run cert:serve -- 8081`);
      process.exitCode = 1;
    });
    server.listen(port, '0.0.0.0', () => {
      console.log('\nTemporary CA download server (HTTP; no app or API).');
      for (const address of Object.values(networkInterfaces()).flat()) {
        if (address && !address.internal && address.family === 'IPv4') {
          console.log(`Safari: http://${address.address}:${port}/dev-ca.crt`);
        }
      }
      console.log(`CA SHA-256: ${ca.fingerprint256}`);
      console.log('Install the profile, then enable full trust in Settings > General > About > Certificate Trust Settings.');
      console.log('Return to the HTTPS app URL. Stop this download server with Ctrl+C when finished.');
    });
  } catch (error) {
    console.error(`Cannot serve CA: ${error.message}\nRun npm run cert first, from the project directory.`);
    process.exitCode = 1;
  }
}
