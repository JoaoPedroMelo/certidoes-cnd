import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { exigirRobo } from '@/lib/robo-auth';

/** O robô avisa que está esperando alguém resolver o captcha (ou que voltou a rodar). */
export async function POST(req: Request) {
  const negado = await exigirRobo(req);
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  const estado = body.estado === 'captcha' ? 'captcha' : 'rodando';
  const mensagem = typeof body.mensagem === 'string' ? body.mensagem.slice(0, 500) : null;

  const rows = await sql`
    update execucoes set estado = ${estado}, mensagem = ${mensagem}
    where id = ${Number(body.execucaoId)} and estado in ('rodando', 'captcha')
    returning id`;
  return NextResponse.json({ ativa: rows.length === 1 });
}
