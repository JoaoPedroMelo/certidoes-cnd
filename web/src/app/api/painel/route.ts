import { NextResponse } from 'next/server';
import { ultimosMeses } from '@/lib/certidao';
import { execucaoAtiva, sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ROBO_ONLINE_SEGUNDOS = 30;

export async function GET() {
  const meses = ultimosMeses();
  const [empresas, historico, execucao, [robo], [ultima]] = await Promise.all([
    sql`
      select id, cnpj, nome, fila, certidao_id, certidao_em
      from empresas
      order by nome`,
    // Um resultado por empresa/mês: o mais recente, e erro só aparece se o mês só teve erro.
    sql`
      select distinct on (c.empresa_id, mes)
        c.empresa_id,
        to_char(c.consultado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
        c.id as consulta_id,
        c.resultado,
        c.mensagem,
        c.consultado_em,
        c.pdf is not null as tem_pdf
      from consultas c
      join empresas e on e.id = c.empresa_id and e.cnpj = c.cnpj
      where to_char(c.consultado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') >= ${meses[0]}
      order by c.empresa_id, mes, (c.resultado = 'erro'), c.consultado_em desc`,
    execucaoAtiva(),
    sql`select ultimo_contato from robo where id = 1`,
    sql`select estado, finalizada_em from execucoes where finalizada_em is not null order by id desc limit 1`,
  ]);

  const porEmpresa = new Map<number, Record<string, unknown>>();
  for (const { empresa_id, mes, ...registro } of historico) {
    if (!porEmpresa.has(empresa_id)) porEmpresa.set(empresa_id, {});
    porEmpresa.get(empresa_id)![mes] = registro;
  }

  let progresso = null;
  if (execucao) {
    const [{ restantes }] = await sql`select count(*)::int as restantes from empresas where fila is not null`;
    progresso = { ...execucao, feitos: execucao.total - restantes };
  }

  const contato = robo?.ultimo_contato ? new Date(robo.ultimo_contato) : null;
  return NextResponse.json({
    meses,
    empresas: empresas.map((e) => ({ ...e, historico: porEmpresa.get(e.id) ?? {} })),
    execucao: progresso,
    ultimaExecucao: ultima ?? null,
    robo: {
      online: contato !== null && Date.now() - contato.getTime() < ROBO_ONLINE_SEGUNDOS * 1000,
      ultimoContato: contato,
    },
  });
}
