import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sql } from './db';

/** Retorna uma resposta 401 se o token do robô for inválido; caso contrário registra o contato. */
export async function exigirRobo(req: Request): Promise<NextResponse | null> {
  const esperado = process.env.ROBO_TOKEN ?? '';
  const recebido = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: 'Token do robô inválido' }, { status: 401 });
  }
  await sql`update robo set ultimo_contato = now() where id = 1`;
  return null;
}
