import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioExiste } from '@/lib/usuario';
import { recuperar } from '../acesso/actions';
import { CampoCodigo, FormAcesso } from '../acesso/FormAcesso';

export const dynamic = 'force-dynamic';

export default async function RecuperarPage() {
  if (!(await usuarioExiste())) redirect('/setup');

  return (
    <main className="tela-acesso">
      <div className="cartao-acesso">
        <h1>Nova senha</h1>
        <p className="sub">Digite o código atual do aplicativo autenticador e escolha uma nova senha.</p>
        <FormAcesso acao={recuperar} botao="Salvar nova senha e entrar">
          <CampoCodigo />
          <label className="campo">
            <span>Nova senha</span>
            <input name="senha" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="campo">
            <span>Confirme a nova senha</span>
            <input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
          </label>
        </FormAcesso>
        <Link href="/login" className="link-discreto">Voltar ao login</Link>
      </div>
    </main>
  );
}
