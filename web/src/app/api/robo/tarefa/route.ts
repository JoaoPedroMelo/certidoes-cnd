import { NextResponse } from 'next/server';
import { execucaoAtiva, sql } from '@/lib/db';
import { exigirRobo } from '@/lib/robo-auth';

export const dynamic = 'force-dynamic';

/**
 * O robô chama este endpoint em loop. Serve de "sinal de vida" e entrega a próxima empresa
 * da fila, uma por vez. `?inicio=1` é enviado quando o robô acaba de abrir, para devolver à
 * fila qualquer empresa que tenha ficado presa em "processando" se ele foi fechado no meio.
 */
export async function POST(req: Request) {
  const negado = await exigirRobo(req);
  if (negado) return negado;

  if (new URL(req.url).searchParams.get('inicio')) {
    await sql`update empresas set fila = 'aguardando' where fila = 'processando'`;
  }

  const execucao = await execucaoAtiva();
  if (!execucao) return NextResponse.json({ execucao: null });

  const [empresa] = await sql`
    update empresas set fila = 'processando'
    where id = (
      select id from empresas where fila = 'aguardando'
      order by nome limit 1
      for update skip locked
    )
    returning id, cnpj, nome`;

  if (!empresa) {
    const [{ emAndamento }] = await sql`select count(*)::int as "emAndamento" from empresas where fila = 'processando'`;
    if (emAndamento === 0) {
      await sql`update execucoes set estado = 'concluida', mensagem = null, finalizada_em = now() where id = ${execucao.id}`;
    }
    return NextResponse.json({ execucao: null });
  }

  if (execucao.estado === 'aguardando') {
    await sql`update execucoes set estado = 'rodando' where id = ${execucao.id}`;
  }
  return NextResponse.json({ execucao: { id: execucao.id }, empresa });
}
