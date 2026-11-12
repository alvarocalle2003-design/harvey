// Autoprueba de push.mjs: hace de «iPhone» (descifra como el navegador, RFC 8291) y comprueba la firma VAPID.
import assert from 'node:assert';
import { createECDH, createDecipheriv, hkdfSync, randomBytes, createPublicKey, verify, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encrypt, loadVapid } from './push.mjs';

const ua = createECDH('prime256v1'); ua.generateKeys();
const auth = randomBytes(16);
const sub = { keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
const msg = JSON.stringify({ title: 'Harvey', body: 'Prueba ñ €' });
const rec = encrypt(sub, msg);

const salt = rec.subarray(0, 16), idlen = rec[20], as = rec.subarray(21, 21 + idlen), ct = rec.subarray(21 + idlen);
assert.equal(rec.readUInt32BE(16), 4096);
const hk = (ikm, s, info, n) => Buffer.from(hkdfSync('sha256', ikm, s, info, n));
const ikm = hk(ua.computeSecret(as), auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), as]), 32);
const d = createDecipheriv('aes-128-gcm', hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
d.setAuthTag(ct.subarray(-16));
const plain = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]);
assert.equal(plain.at(-1), 2);
assert.equal(plain.subarray(0, -1).toString(), msg);

const v = loadVapid(join(tmpdir(), `vapid-prueba-${Date.now()}.json`));
const pub = Buffer.from(v.publicKey, 'base64url');
assert.equal(pub.length, 65);
const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
const sig = sign('sha256', Buffer.from('a.b'), { key: v.key, dsaEncoding: 'ieee-p1363' });
assert.ok(verify('sha256', Buffer.from('a.b'), { key, dsaEncoding: 'ieee-p1363' }, sig));
console.log('push.mjs OK: cifrado descifrable y firma VAPID válida');
