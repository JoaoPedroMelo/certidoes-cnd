import bcrypt from 'bcryptjs';
import { sql } from './db';
import { verificarCodigo } from './totp';

const MAX_FALHAS = 5;
const BLOQUEIO_MINUTOS = 15;

type Usuario = {
  senha_hash: string;
  totp_secret: string;
  totp_ultimo_passo: string; // bigint chega como string
  falhas: number;
  bloqueado_ate: string | null;
};

export async function buscarUsuario() {
  const rows = await sql`select senha_hash, totp_secret, totp_ultimo_passo, falhas, bloqueado_ate from usuario where id = 1`;
  return rows[0] as Usuario | undefined;
}

export async function usuarioExiste() {
  return Boolean(await buscarUsuario());
}

export function validarSenhaNova(senha: string, confirmacao: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha !== confirmacao) return 'As senhas não conferem.';
  return null;
}

type Resultado = { ok: true } | { ok: false; erro: string };

/**
 * Confere o código do autenticador (e a senha, se informada), com bloqueio após falhas
 * repetidas e proteção contra reuso do mesmo código.
 */
export async function autenticar(codigo: string, senha?: string): Promise<Resultado> {
  const u = await buscarUsuario();
  if (!u) return { ok: false, erro: 'Acesso ainda não configurado.' };

  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
    return { ok: false, erro: `Muitas tentativas inválidas. Tente novamente após ${new Date(u.bloqueado_ate).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` };
  }

  const passo = verificarCodigo(u.totp_secret, codigo);
  const senhaOk = senha === undefined ? true : await bcrypt.compare(senha, u.senha_hash);
  const codigoOk = passo !== null && passo > Number(u.totp_ultimo_passo);

  if (!senhaOk || !codigoOk) {
    const falhas = u.falhas + 1;
    if (falhas >= MAX_FALHAS) {
      await sql`update usuario set falhas = 0, bloqueado_ate = now() + make_interval(mins => ${BLOQUEIO_MINUTOS}) where id = 1`;
    } else {
      await sql`update usuario set falhas = ${falhas} where id = 1`;
    }
    return { ok: false, erro: senha === undefined ? 'Código inválido.' : 'Senha ou código inválido.' };
  }

  await sql`update usuario set falhas = 0, bloqueado_ate = null, totp_ultimo_passo = ${passo} where id = 1`;
  return { ok: true };
}

export async function trocarSenha(novaSenha: string) {
  const hash = await bcrypt.hash(novaSenha, 12);
  await sql`update usuario set senha_hash = ${hash} where id = 1`;
}

export async function criarUsuario(senha: string, segredoTotp: string, passo: number) {
  const hash = await bcrypt.hash(senha, 12);
  const rows = await sql`
    insert into usuario (id, senha_hash, totp_secret, totp_ultimo_passo)
    values (1, ${hash}, ${segredoTotp}, ${passo})
    on conflict (id) do nothing
    returning id`;
  return rows.length === 1;
}
