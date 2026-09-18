// Application-layer encryption for provider tokens (AES-256-GCM). The key must come from the
// environment in production; a dev key is derived from the DB path so local runs still work
// but the server prints a loud warning.
import { createCipheriv, createDecipheriv, createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const RAW = process.env.MILO_ENCRYPTION_KEY;
export const ENCRYPTION_KEY_IS_DEV = !RAW;
const KEY = RAW ? createHash('sha256').update(RAW).digest() : createHash('sha256').update('milo-dev-key-do-not-use-in-production').digest();

export function encrypt(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}
export function decrypt(s) {
  if (!s) return null;
  const [iv, tag, ct] = s.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', KEY, iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

const SESSION_SECRET = process.env.MILO_SESSION_SECRET || 'milo-dev-session-secret';
export const SESSION_SECRET_IS_DEV = !process.env.MILO_SESSION_SECRET;
export function signValue(v) { return `${v}.${createHmac('sha256', SESSION_SECRET).update(v).digest('base64url')}`; }
export function verifyValue(signed) {
  if (!signed || !signed.includes('.')) return null;
  const i = signed.lastIndexOf('.'); const v = signed.slice(0, i); const sig = signed.slice(i + 1);
  const exp = createHmac('sha256', SESSION_SECRET).update(v).digest('base64url');
  if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  return v;
}
