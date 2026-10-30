import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { gerarSegredo, uriOtpauth } from '@/lib/totp';
import { usuarioExiste } from '@/lib/usuario';
import { configurar } from '../acesso/actions';
import { CampoCodigo, FormAcesso } from '../acesso/FormAcesso';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await usuarioExiste()) redirect('/login');

  const segredo = gerarSegredo();
  const qr = await QRCode.toDataURL(uriOtpauth(segredo, 'contador', 'Certidões CND'), { margin: 1, width: 220 });
  const segredoLegivel = segredo.match(/.{1,4}/g)!.join(' ');

  return (
    <main className="tela-acesso">
      <div className="cartao-acesso cartao-largo">
        <h1>Configurar acesso</h1>
        <p className="sub">Isso é feito uma única vez.</p>

        <ol className="passos">
          <li>
            Abra o <strong>Google Authenticator</strong> ou o <strong>Microsoft Authenticator</strong> no celular, toque em
            “+” e escaneie o QR Code abaixo.
            <div className="qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR Code do autenticador" width={220} height={220} />
              <small>Sem câmera? Digite a chave: <code>{segredoLegivel}</code></small>
            </div>
          </li>
          <li>Preencha os campos e confirme com o código de 6 dígitos que aparecer no aplicativo.</li>
        </ol>

        <FormAcesso acao={configurar} botao="Concluir configuração">
          <input type="hidden" name="segredo" value={segredo} />
          <label className="campo">
            <span>Código de instalação</span>
            <input name="instalacao" type="password" autoComplete="off" required />
          </label>
          <label className="campo">
            <span>Crie uma senha</span>
            <input name="senha" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="campo">
            <span>Confirme a senha</span>
            <input name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <CampoCodigo />
        </FormAcesso>
      </div>
    </main>
  );
}
