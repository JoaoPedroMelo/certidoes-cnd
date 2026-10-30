import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { erroDuplicado, lerEmpresa } from './validar';

export async function POST(req: Request) {
  const dados = await lerEmpresa(req);
  if ('erro' in dados) return NextResponse.json(dados, { status: 400 });

  try {
    const [empresa] = await sql`insert into empresas (cnpj, nome) values (${dados.cnpj}, ${dados.nome}) returning id`;
    return NextResponse.json(empresa, { status: 201 });
  } catch (e) {
    if (erroDuplicado(e)) return NextResponse.json({ erro: 'Este CNPJ já está cadastrado.' }, { status: 409 });
    throw e;
  }
}
