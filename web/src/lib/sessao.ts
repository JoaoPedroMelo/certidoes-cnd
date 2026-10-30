import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_SESSAO = 'sessao';
const DURACAO_HORAS = 12;

function chave() {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) throw new Error('SESSION_SECRET ausente ou curto (mínimo 32 caracteres)');
  return new TextEncoder().encode(segredo);
}

export async function criarTokenSessao() {
  return new SignJWT({ sub: 'contador' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_HORAS}h`)
    .sign(chave());
}

export async function sessaoValida(token: string | undefined) {
  if (!token) return false;
  try {
    await jwtVerify(token, chave(), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export const opcoesCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: DURACAO_HORAS * 60 * 60,
};
