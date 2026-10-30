import { nomeArquivoCertidao } from '@/lib/certidao';
import { sql } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

/** Baixa o PDF de uma consulta do histórico (o id é o da consulta). */
export async function GET(_: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const [row] = await sql`
    select e.nome, c.cnpj, c.pdf, c.consultado_em
    from consultas c
    join empresas e on e.id = c.empresa_id
    where c.id = ${id}`;
  if (!row?.pdf) return new Response('Certidão não encontrada', { status: 404 });

  const nome = nomeArquivoCertidao(row.nome, row.cnpj, row.consultado_em);
  return new Response(Buffer.from(row.pdf, 'base64'), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
