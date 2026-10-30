import { NextResponse } from 'next/server';
import { ultimosMeses } from '@/lib/certidao';
import { execucaoAtiva, sql } from '@/lib/db';

/** Inicia uma consulta. Corpo opcional { ids: number[] } para consultar só algumas empresas. */
export async function POST(req: Request) {
  if (await execucaoAtiva()) {
    return NextResponse.json({ erro: 'Já existe uma consulta em andamento.' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: number[] | null = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : null;

  const marcadas = ids
    ? await sql`update empresas set fila = 'aguardando' where id = any(${ids}) returning id`
    : await sql`update empresas set fila = 'aguardando' returning id`;
  if (!marcadas.length) return NextResponse.json({ erro: 'Nenhuma empresa para consultar.' }, { status: 400 });

  // Ao entrar um mês novo, o mais antigo sai: ficam só os 6 meses mais recentes.
  const [primeiroMes] = ultimosMeses();
  await sql.transaction([
    sql`update empresas set certidao_id = null, certidao_em = null
        where certidao_id in (
          select id from consultas
          where to_char(consultado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') < ${primeiroMes}
        )`,
    sql`delete from consultas
        where to_char(consultado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') < ${primeiroMes}`,
  ]);

  const [execucao] = await sql`insert into execucoes (total) values (${marcadas.length}) returning id`;
  return NextResponse.json(execucao, { status: 201 });
}

/** Cancela a consulta em andamento (a empresa que estiver sendo consultada termina normalmente). */
export async function DELETE() {
  await sql.transaction([
    sql`update execucoes set estado = 'cancelada', finalizada_em = now()
        where estado in ('aguardando', 'rodando', 'captcha')`,
    sql`update empresas set fila = null where fila = 'aguardando'`,
  ]);
  return NextResponse.json({ ok: true });
}
