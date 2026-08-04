/**
 * Generates a proper Android PKCS12 keystore using node-forge.
 * Alias: vantage_alias
 * Password: vantage2026
 */
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const ALIAS = 'vantage_alias';
const PASSWORD = 'vantage2026';
const OUTPUT = path.join(__dirname, '..', 'vantage-keystore.p12');

console.log('Generating RSA 2048 key pair...');

// Generate RSA key pair
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();

cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 27);

const attrs = [
  { name: 'commonName', value: 'Vantage AI' },
  { name: 'organizationName', value: 'Vantage AI' },
  { shortName: 'OU', value: 'App Development' },
  { name: 'countryName', value: 'CM' },
];

cert.setSubject(attrs);
cert.setIssuer(attrs);

cert.setExtensions([
  { name: 'basicConstraints', cA: true },
  { name: 'keyUsage', keyCertSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
]);

cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('Certificate created. Building PKCS12...');

// Build PKCS12 with the alias set as the localKeyId / friendlyName
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  [cert],
  PASSWORD,
  {
    algorithm: '3des',
    friendlyName: ALIAS,
    generateLocalKeyId: true,
  }
);

const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
const p12Buffer = Buffer.from(p12Der, 'binary');

fs.writeFileSync(OUTPUT, p12Buffer);

console.log(`\n✅ Keystore written to: ${OUTPUT}`);
console.log(`   File size: ${p12Buffer.length} bytes`);
console.log(`\n📋 Codemagic upload details:`);
console.log(`   Reference name : vantage_keystore`);
console.log(`   Keystore password: ${PASSWORD}`);
console.log(`   Key alias       : ${ALIAS}`);
console.log(`   Key password    : ${PASSWORD}`);
