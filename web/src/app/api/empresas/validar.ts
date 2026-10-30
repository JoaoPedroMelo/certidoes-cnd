import { cnpjValido, limparCnpj } from '@/lib/cnpj';

export async function lerEmpresa(req: Request): Promise<{ cnpj: string; nome: string } | { erro: string }> {
  const body = await req.json().catch(() => ({}));
  const cnpj = limparCnpj(String(body.cnpj ?? ''));
  const nome = String(body.nome ?? '').trim();
  if (!nome) return { erro: 'Informe o nome da empresa.' };
  if (!cnpjValido(cnpj)) return { erro: 'CNPJ inválido. Confira os números.' };
  return { cnpj, nome };
}

export function erroDuplicado(e: unknown) {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === '23505';
}
