// Avisos push (Web Push estándar, el que usa Safari en iOS 16.4+) sin dependencias: firma VAPID (RFC 8292)
// y cifrado del mensaje aes128gcm (RFC 8291) con node:crypto. Prueba: node prueba-push.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createECDH, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, createCipheriv, sign } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');

// Claves VAPID: se generan solas la primera vez y se guardan junto al servidor (no son de ningún servicio externo)
export function loadVapid(file) {
  if (!existsSync(file)) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    writeFileSync(file, JSON.stringify(privateKey.export({ format: 'jwk' })), { mode: 0o600 });
  }
  const jwk = JSON.parse(readFileSync(file, 'utf8'));
  return { key: createPrivateKey({ key: jwk, format: 'jwk' }), publicKey: b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])) };
}

const hkdf = (ikm, salt, info, len) => Buffer.from(hkdfSync('sha256', ikm, salt, info, len));

// Cifra el texto para una suscripción concreta (solo ese navegador puede leerlo)
export function encrypt(sub, text) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64url'), auth = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const as = ecdh.getPublicKey(), salt = randomBytes(16);
  const ikm = hkdf(ecdh.computeSecret(ua), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head); head.writeUInt32BE(4096, 16); head[20] = as.length;
  return Buffer.concat([head, as, body]);
}

// Envía un aviso. Devuelve el código HTTP del servicio push (201 = entregado; 404/410 = suscripción caducada)
export async function sendPush(vapid, sub, payload, { urgent = false } = {}) {
  const jwt = [{ typ: 'JWT', alg: 'ES256' }, { aud: new URL(sub.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://harvey.srv2061704.hstgr.cloud' }]
    .map((p) => b64u(JSON.stringify(p))).join('.');
  const sig = b64u(sign('sha256', Buffer.from(jwt), { key: vapid.key, dsaEncoding: 'ieee-p1363' }));
  const r = await fetch(sub.endpoint, {
    method: 'POST', body: encrypt(sub, JSON.stringify(payload)), signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `vapid t=${jwt}.${sig}, k=${vapid.publicKey}`, TTL: '86400', Urgency: urgent ? 'high' : 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
  });
  if (r.status >= 300) console.error(`[push] ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status;
}
