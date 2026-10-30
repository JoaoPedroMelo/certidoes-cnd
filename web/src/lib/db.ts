import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

export type EstadoExecucao = 'aguardando' | 'rodando' | 'captcha' | 'concluida' | 'cancelada';

export async function execucaoAtiva() {
  const rows = await sql`
    select id, estado, total, mensagem, iniciada_em
    from execucoes
    where estado in ('aguardando', 'rodando', 'captcha')
    order by id desc
    limit 1`;
  return rows[0] as
    | { id: number; estado: EstadoExecucao; total: number; mensagem: string | null; iniciada_em: string }
    | undefined;
}
