import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { exigirRobo } from '@/lib/robo-auth';

const RESULTADOS = ['emitida', 'em_debito', 'erro'] as const;

export async function POST(req: Request) {
  const negado = await exigirRobo(req);
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  const empresaId = Number(body.empresaId);
  const resultado = RESULTADOS.find((r) => r === body.resultado);
  const mensagem = typeof body.mensagem === 'string' ? body.mensagem.slice(0, 1000) : null;
  const pdf = typeof body.pdf === 'string' ? body.pdf : null;

  if (!Number.isInteger(empresaId) || !resultado) {
    return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 });
  }
  if (resultado === 'emitida' && !pdf?.startsWith('JVBER')) {
    return NextResponse.json({ erro: 'PDF ausente ou inválido' }, { status: 400 });
  }

  // Grava no histórico e atualiza a "última certidão" da empresa num único comando.
  // Em débito: ela deixa de ter última certidão (o ZIP não inclui).
  // Erro: a última certidão continua valendo, pois não sabemos a situação real.
  await sql`
    with nova as (
      insert into consultas (empresa_id, cnpj, resultado, mensagem, pdf)
      select id, cnpj, ${resultado}::text, ${mensagem}::text, ${resultado === 'emitida' ? pdf : null}::text
      from empresas where id = ${empresaId}
      returning id, consultado_em
    )
    update empresas e set
      fila = null,
      certidao_id = case ${resultado}::text when 'emitida' then nova.id when 'em_debito' then null else e.certidao_id end,
      certidao_em = case ${resultado}::text when 'emitida' then nova.consultado_em when 'em_debito' then null else e.certidao_em end
    from nova
    where e.id = ${empresaId}`;
  return NextResponse.json({ ok: true });
}
