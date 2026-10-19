// Criptografia dos backups: AES-256-GCM com chave derivada da senha (scrypt). Cada arquivo tem sal e IV próprios.
// Formato: "CCB1" | sal(16) | iv(12) | tag(16) | dados
import { scryptSync, randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

const MAGICO = Buffer.from('CCB1');
const chave = (senha, sal) => scryptSync(String(senha), sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function cifrar(dados, senha) {
  const sal = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(senha, sal), iv);
  const corpo = Buffer.concat([c.update(dados), c.final()]);
  return Buffer.concat([MAGICO, sal, iv, c.getAuthTag(), corpo]);
}

export function decifrar(buf, senha) {
  if (!buf.subarray(0, 4).equals(MAGICO)) throw new Error('Arquivo não é um backup cifrado do Control Critic.');
  const sal = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48);
  const d = createDecipheriv('aes-256-gcm', chave(senha, sal), iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(48)), d.final()]); } catch { throw new Error('Senha errada ou arquivo corrompido.'); }
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
