import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createCaServer } from './serve-ca.mjs';

test('LAN certificates, stable CA, partial-state protection, and public-only download', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'scanner-cert-'));
  const generator = resolve('scripts/dev-cert.mjs');
  const generate = () => execFileSync(process.execPath, [generator], { cwd: directory, stdio: 'pipe' });
  let server;
  try {
    generate();
    const caPath = resolve(directory, 'certs/dev-ca.crt');
    const caPem = readFileSync(caPath);
    const ca = new X509Certificate(caPem);
    const leaf = new X509Certificate(readFileSync(resolve(directory, 'certs/dev-server.crt')));
    assert.ok(ca.ca);
    assert.ok(leaf.verify(ca.publicKey));
    assert.ok(leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
    assert.equal(leaf.checkIP('127.0.0.1'), '127.0.0.1');
    for (const address of Object.values(networkInterfaces()).flat()) {
      if (address && !address.internal && address.family === 'IPv4') {
        assert.equal(leaf.checkIP(address.address), address.address);
      }
    }
    assert.equal((Date.parse(leaf.validTo) - Date.parse(leaf.validFrom)) / 86400000, 397);
    execFileSync('openssl', ['verify', '-CAfile', caPath, '-purpose', 'sslserver', resolve(directory, 'certs/dev-server.crt')]);
    generate();
    assert.deepEqual(readFileSync(caPath), caPem);

    server = createCaServer(caPem);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/dev-ca.crt?download=1`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/x-x509-ca-cert');
    assert.equal(response.headers.get('content-disposition'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), ca.raw);
    for (const path of ['/', '/dev-ca.key', '/certs/dev-ca.key', '/dev-server.key', '/api/health', '/%2e%2e/dev-ca.key']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    const head = await fetch(`${base}/dev-ca.crt`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(`${base}/dev-ca.crt`, { method: 'POST' })).status, 405);

    rmSync(resolve(directory, 'certs/dev-ca.key'));
    assert.throws(generate, (error) => {
      assert.match(error.stderr.toString(), /Incomplete CA/);
      return true;
    });
    assert.deepEqual(readFileSync(caPath), caPem);
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    rmSync(directory, { recursive: true, force: true });
  }
});
