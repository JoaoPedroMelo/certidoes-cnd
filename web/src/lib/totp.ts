// TOTP (RFC 6238) compatível com Google Authenticator, Microsoft Authenticator, Authy etc.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODO = 30;

export function gerarSegredo(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let saida = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) saida += ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
  return saida;
}

function base32ParaBuffer(segredo: string): Buffer {
  let bits = '';
  for (const c of segredo.replace(/=+$/, '').toUpperCase()) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) throw new Error('Segredo TOTP inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codigoDoPasso(chave: Buffer, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', chave).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const numero = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return numero.toString().padStart(6, '0');
}

/** Retorna o passo de tempo aceito (para impedir reuso do mesmo código) ou null se inválido. */
export function verificarCodigo(segredo: string, codigo: string): number | null {
  const limpo = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpo)) return null;
  const chave = base32ParaBuffer(segredo);
  const agora = Math.floor(Date.now() / 1000 / PERIODO);
  // Aceita o código atual e um passo antes/depois para tolerar relógio levemente desajustado.
  for (const passo of [agora, agora - 1, agora + 1]) {
    if (timingSafeEqual(Buffer.from(codigoDoPasso(chave, passo)), Buffer.from(limpo))) return passo;
  }
  return null;
}

export function uriOtpauth(segredo: string, conta: string, emissor: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PERIODO}`;
}
