import { NextResponse } from 'next/server';
import { exigirRobo } from '@/lib/robo-auth';

/** Sinal de vida enviado pelo robô a cada poucos segundos (mostra "Robô conectado" no painel). */
export async function POST(req: Request) {
  const negado = await exigirRobo(req);
  return negado ?? NextResponse.json({ ok: true });
}
