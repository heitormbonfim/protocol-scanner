import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { X509Certificate, createPrivateKey } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { ensureLocalCertificate } from '../server/shared/ensure-cert.ts'

test('first-launch HTTPS, stable identity, LAN renewal and incomplete CA protection', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scanner-https-'))
  try {
    const first = ensureLocalCertificate(dir, ['127.0.0.1', '::1', '192.168.1.5'])
    const caPem = readFileSync(join(dir, 'dev-ca.crt'))
    const ca = new X509Certificate(caPem)
    const cert = new X509Certificate(first.cert)
    assert.ok(ca.ca)
    assert.ok(cert.verify(ca.publicKey))
    assert.ok(cert.checkPrivateKey(createPrivateKey(first.key)))
    assert.equal(cert.checkIP('192.168.1.5'), '192.168.1.5')
    assert.equal(cert.checkHost('localhost'), 'localhost')
    assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.1'))
    assert.equal((Date.parse(cert.validTo)-Date.parse(cert.validFrom))/86400000,397)
    assert.deepEqual(ensureLocalCertificate(dir,['127.0.0.1']).cert,first.cert)
    const renewed = ensureLocalCertificate(dir,['127.0.0.1','192.168.1.6'])
    assert.notDeepEqual(renewed.cert,first.cert)
    assert.deepEqual(readFileSync(join(dir,'dev-ca.crt')),caPem)
    execFileSync('openssl',['verify','-CAfile',join(dir,'dev-ca.crt'),'-purpose','sslserver',join(dir,'dev-server.crt')])
    rmSync(join(dir,'dev-ca.key'))
    assert.deepEqual(ensureLocalCertificate(dir,['127.0.0.1']).cert,renewed.cert)
    assert.throws(()=>ensureLocalCertificate(dir,['192.168.1.7']),/CA está incompleta/)
    assert.deepEqual(readFileSync(join(dir,'dev-ca.crt')),caPem)
  } finally { rmSync(dir,{recursive:true,force:true}) }
})

test('preserves an existing OpenSSL CA when renewing', () => {
  const dir = mkdtempSync(join(tmpdir(),'scanner-openssl-'))
  try {
    execFileSync(process.execPath, [join(process.cwd(),'scripts/dev-cert.mjs')], {cwd:dir,stdio:'pipe'})
    const certDir=join(dir,'certs')
    const original=readFileSync(join(certDir,'dev-ca.crt'))
    const generated=ensureLocalCertificate(certDir,['192.0.2.12'])
    assert.deepEqual(readFileSync(join(certDir,'dev-ca.crt')),original)
    assert.ok(new X509Certificate(generated.cert).verify(new X509Certificate(original).publicKey))
  } finally { rmSync(dir,{recursive:true,force:true}) }
})
