import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioExiste } from '@/lib/usuario';
import { entrar } from '../acesso/actions';
import { CampoCodigo, FormAcesso } from '../acesso/FormAcesso';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (!(await usuarioExiste())) redirect('/setup');

  return (
    <main className="tela-acesso">
      <div className="cartao-acesso">
        <h1>Certidões CND</h1>
        <p className="sub">Entre com sua senha e o código do aplicativo autenticador.</p>
        <FormAcesso acao={entrar} botao="Entrar">
          <label className="campo">
            <span>Senha</span>
            <input name="senha" type="password" autoComplete="current-password" required autoFocus />
          </label>
          <CampoCodigo />
        </FormAcesso>
        <Link href="/recuperar" className="link-discreto">Esqueci minha senha</Link>
      </div>
    </main>
  );
}
