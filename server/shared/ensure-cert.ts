import { generateKeyPairSync, randomBytes, X509Certificate, createPrivateKey } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import forge from 'node-forge'

const DAY = 86_400_000
export function localAddresses(): string[] {
  return [...new Set(['127.0.0.1', '::1', ...Object.values(networkInterfaces()).flat()
    .filter((entry) => entry && !entry.internal && entry.family === 'IPv4')
    .map((entry) => entry!.address)])]
}

function keys() {
  // Native RSA generation works inside the executable without OpenSSL installed.
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' } })
  return { pem: pair.privateKey, privateKey: forge.pki.privateKeyFromPem(pair.privateKey),
    publicKey: forge.pki.publicKeyFromPem(pair.publicKey) }
}

function certificate(publicKey: forge.pki.PublicKey, days: number) {
  const cert = forge.pki.createCertificate()
  cert.publicKey = publicKey
  cert.serialNumber = '01' + randomBytes(19).toString('hex')
  cert.validity.notBefore = new Date(Date.now() - 5 * 60_000)
  cert.validity.notAfter = new Date(cert.validity.notBefore.getTime() + days * DAY)
  return cert
}

function write(path: string, value: string) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, value, { mode: 0o600 })
  renameSync(temporary, path)
}

/** Keep existing identities. Never downgrade to HTTP or silently replace a CA. */
export function ensureLocalCertificate(directory: string, addresses = localAddresses()) {
  const path = (name: string) => resolve(directory, name)
  const caPath = path('dev-ca.crt')
  const caKeyPath = path('dev-ca.key')
  const certPath = path('dev-server.crt')
  const keyPath = path('dev-server.key')
  const hasCa = existsSync(caPath)
  const hasCaKey = existsSync(caKeyPath)
  const hasCert = existsSync(certPath)
  const hasKey = existsSync(keyPath)

  if (hasCert && hasKey) {
    const cert = new X509Certificate(readFileSync(certPath))
    const key = readFileSync(keyPath)
    if (!cert.checkPrivateKey(createPrivateKey(key))) throw new Error('Certificado HTTPS e chave não correspondem.')
    const usable = Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now() + DAY &&
      cert.checkHost('localhost') && addresses.every((address) => cert.checkIP(address))
    if (usable) return { key, cert: readFileSync(certPath) }
  }

  // A public CA without its key is a supported deployment, until renewal is needed.
  if (hasCa !== hasCaKey || (!hasCa && (hasCert || hasKey))) {
    throw new Error(`HTTPS precisa de emissão/renovação, mas a CA está incompleta em ${directory}. Restaure dev-ca.crt e dev-ca.key da mesma CA, ou renove na máquina que guarda a chave. Nenhum arquivo foi substituído.`)
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  let ca: forge.pki.Certificate
  let caKey: forge.pki.PrivateKey
  if (hasCa) {
    const pem = readFileSync(caPath, 'utf8')
    const keyPem = readFileSync(caKeyPath, 'utf8')
    const parsed = new X509Certificate(pem)
    if (!parsed.ca || !parsed.checkPrivateKey(createPrivateKey(keyPem)) ||
      Date.parse(parsed.validFrom) > Date.now() || Date.parse(parsed.validTo) <= Date.now() + DAY) {
      throw new Error('CA inválida, vencida ou com chave incompatível. Restaure a CA; ela não será substituída automaticamente.')
    }
    ca = forge.pki.certificateFromPem(pem)
    caKey = forge.pki.privateKeyFromPem(keyPem)
  } else {
    const pair = keys()
    ca = certificate(pair.publicKey, 3650)
    ca.setSubject([{ name: 'commonName', value: 'Leitor de Protocolos Dev CA' }, { name: 'organizationName', value: 'Leitor de Protocolos' }])
    ca.setIssuer(ca.subject.attributes)
    ca.setExtensions([{ name: 'basicConstraints', cA: true, critical: true, pathLenConstraint: 0 },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }])
    ca.sign(pair.privateKey, forge.md.sha256.create())
    caKey = pair.privateKey
    write(caKeyPath, pair.pem)
    write(caPath, forge.pki.certificateToPem(ca))
    console.log(`CA local criada em ${caPath}. Instale e ative a confiança nos celulares uma vez.`)
  }
  const pair = keys()
  const cert = certificate(pair.publicKey, 397)
  cert.validity.notAfter = new Date(Math.min(cert.validity.notAfter.getTime(), ca.validity.notAfter.getTime()))
  cert.setSubject([{ name: 'commonName', value: 'Leitor de Protocolos dev server' }])
  cert.setIssuer(ca.subject.attributes)
  cert.setExtensions([{ name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, ...addresses.map((ip) => ({ type: 7, ip }))] }])
  cert.sign(caKey, forge.md.sha256.create())
  write(keyPath, pair.pem)
  write(certPath, forge.pki.certificateToPem(cert))
  console.log('Certificado HTTPS emitido para os endereços atuais da máquina.')
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) }
}
