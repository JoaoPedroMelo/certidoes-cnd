'use server';

import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESSAO, criarTokenSessao, opcoesCookie } from '@/lib/sessao';
import { verificarCodigo } from '@/lib/totp';
import { autenticar, criarUsuario, trocarSenha, usuarioExiste, validarSenhaNova } from '@/lib/usuario';

export type EstadoForm = { erro?: string; sucesso?: string };

async function abrirSessao() {
  (await cookies()).set(COOKIE_SESSAO, await criarTokenSessao(), opcoesCookie);
}

export async function entrar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const senha = String(form.get('senha') ?? '');
  const codigo = String(form.get('codigo') ?? '');
  if (!senha || !codigo) return { erro: 'Informe a senha e o código do autenticador.' };

  const r = await autenticar(codigo, senha);
  if (!r.ok) return { erro: r.erro };

  await abrirSessao();
  redirect('/');
}

export async function recuperar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const codigo = String(form.get('codigo') ?? '');
  const senha = String(form.get('senha') ?? '');
  const confirmacao = String(form.get('confirmacao') ?? '');

  const erroSenha = validarSenhaNova(senha, confirmacao);
  if (erroSenha) return { erro: erroSenha };

  const r = await autenticar(codigo);
  if (!r.ok) return { erro: r.erro };

  await trocarSenha(senha);
  await abrirSessao();
  redirect('/');
}

function codigoInstalacaoOk(informado: string) {
  const esperado = process.env.SETUP_CODE ?? '';
  const a = Buffer.from(esperado);
  const b = Buffer.from(informado);
  return esperado.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export async function configurar(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  if (await usuarioExiste()) redirect('/login');

  const instalacao = String(form.get('instalacao') ?? '');
  const segredo = String(form.get('segredo') ?? '');
  const senha = String(form.get('senha') ?? '');
  const confirmacao = String(form.get('confirmacao') ?? '');
  const codigo = String(form.get('codigo') ?? '');

  if (!codigoInstalacaoOk(instalacao)) return { erro: 'Código de instalação incorreto.' };
  const erroSenha = validarSenhaNova(senha, confirmacao);
  if (erroSenha) return { erro: erroSenha };

  const passo = verificarCodigo(segredo, codigo);
  if (passo === null) return { erro: 'O código do autenticador não confere. Confira se escaneou o QR Code desta página.' };

  if (!(await criarUsuario(senha, segredo, passo))) redirect('/login');
  await abrirSessao();
  redirect('/');
}
