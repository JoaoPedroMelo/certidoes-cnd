import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { erroDuplicado, lerEmpresa } from '../validar';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const dados = await lerEmpresa(req);
  if ('erro' in dados) return NextResponse.json(dados, { status: 400 });

  try {
    // Se o CNPJ mudou, o resultado e a certidão antigos deixam de valer.
    const rows = await sql`
      update empresas set
        nome = ${dados.nome},
        certidao_id = case when cnpj = ${dados.cnpj} then certidao_id else null end,
        certidao_em = case when cnpj = ${dados.cnpj} then certidao_em else null end,
        cnpj = ${dados.cnpj}
      where id = ${id}
      returning id`;
    if (!rows.length) return NextResponse.json({ erro: 'Empresa não encontrada.' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    if (erroDuplicado(e)) return NextResponse.json({ erro: 'Este CNPJ já está cadastrado.' }, { status: 409 });
    throw e;
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const rows = await sql`delete from empresas where id = ${id} and fila is distinct from 'processando' returning id`;
  if (!rows.length) {
    return NextResponse.json({ erro: 'Não foi possível excluir (a empresa está sendo consultada agora?).' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
