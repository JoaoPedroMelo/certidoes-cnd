// Robô de Certidões CND
// Fica rodando no computador do escritório, conversa com o painel e faz as consultas no site
// da Receita Federal usando um navegador visível. Se o site pedir captcha, avisa e espera
// alguém resolver na janela do navegador.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const PAINEL_URL = (process.env.PAINEL_URL || '').replace(/\/+$/, '');
const ROBO_TOKEN = process.env.ROBO_TOKEN || '';
const NAVEGADOR = process.env.NAVEGADOR || 'chrome';

const URL_RECEITA = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj';
const INTERVALO_OCIOSO_MS = 5000;
const PAUSA_ENTRE_CNPJS_MS = 2500;
const ESPERA_SEM_CAPTCHA_MS = 90_000;
const ESPERA_CAPTCHA_MS = 15 * 60_000;
const TENTATIVAS = 3;
const ENVIOS = 6;

if (!PAINEL_URL || !ROBO_TOKEN) {
  console.error('Configure PAINEL_URL e ROBO_TOKEN no arquivo .env (veja .env.example).');
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString('pt-BR');
const log = (...a) => console.log(`[${hora()}]`, ...a);
const formatarCnpj = (c) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

class ErroConsulta extends Error {
  constructor(mensagem, { definitivo = false } = {}) {
    super(mensagem);
    this.definitivo = definitivo; // erro de cadastro/regra: não adianta tentar de novo
  }
}

// ---------------------------------------------------------------- painel

async function painel(caminho, corpo) {
  const r = await fetch(`${PAINEL_URL}${caminho}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ROBO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  });
  if (r.status === 401) throw new Error('ROBO_TOKEN recusado pelo painel. Confira o .env.');
  if (!r.ok) throw new Error(`Painel respondeu ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- avisos no Windows

function notificarWindows(titulo, texto) {
  if (process.platform !== 'win32') return;
  const esc = (s) => s.replace(/'/g, "''");
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Warning
    $n.Visible = $true
    $n.ShowBalloonTip(15000, '${esc(titulo)}', '${esc(texto)}', 'Warning')
    [console]::beep(880, 300); [console]::beep(880, 300)
    Start-Sleep -Seconds 15
    $n.Dispose()`;
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { stdio: 'ignore', detached: true }).unref();
}

async function trazerParaFrente(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await cdp.detach();
  } catch {}
  await page.bringToFront().catch(() => {});
}

// ---------------------------------------------------------------- receita

/** Verdadeiro quando o desafio do hCaptcha (a janelinha com imagens) está visível na tela. */
async function captchaVisivel(page) {
  return page
    .evaluate(() =>
      [...document.querySelectorAll('iframe')].some((f) => {
        if (!/hcaptcha/.test(f.src) || !/frame=challenge/.test(f.src)) return false;
        const r = f.getBoundingClientRect();
        return r.width > 50 && r.height > 50 && r.bottom > 0 && r.right > 0 && getComputedStyle(f).visibility !== 'hidden';
      }),
    )
    .catch(() => false);
}

function textoMensagem(m) {
  const t = typeof m === 'string' ? m : m?.texto ?? '';
  return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Espera a próxima resposta da API da Receita (já coletada em ctx.respostas) enquanto vigia o
 * captcha. Se o desafio aparecer, avisa o painel e o Windows e passa a esperar bem mais tempo,
 * porque alguém precisa resolver na janela do navegador.
 */
async function aguardarResposta(page, filtro, ctx) {
  try {
    const inicio = Date.now();
    let limite = ESPERA_SEM_CAPTCHA_MS;
    for (;;) {
      const i = ctx.respostas.findIndex(filtro);
      if (i >= 0) return ctx.respostas.splice(0, i + 1).pop();
      if (Date.now() - inicio > limite) throw new ErroConsulta('A Receita não respondeu a tempo.');
      if (await captchaVisivel(page)) {
        limite = ESPERA_CAPTCHA_MS;
        ctx.captchaVistoEm = Date.now();
        if (!ctx.captchaAvisado) {
          ctx.captchaAvisado = true;
          log('⚠  Captcha na tela. Aguardando alguém resolver na janela do navegador…');
          await trazerParaFrente(page);
          notificarWindows('Robô de Certidões', 'A Receita pediu uma verificação (captcha). Resolva na janela do navegador.');
          await painel('/api/robo/estado', { execucaoId: ctx.execucaoId, estado: 'captcha', mensagem: ctx.empresa.nome }).catch(() => {});
        }
      } else if (ctx.captchaAvisado && Date.now() - ctx.captchaVistoEm > 45_000) {
        // O desafio sumiu sem a Receita responder (fechado ou expirou): tenta de novo.
        throw new ErroConsulta('A verificação (captcha) não foi concluída.');
      }
      await dormir(700);
    }
  } finally {
    if (ctx.captchaAvisado) {
      ctx.captchaAvisado = false;
      log('✓  Captcha resolvido, seguindo.');
      await painel('/api/robo/estado', { execucaoId: ctx.execucaoId, estado: 'rodando' }).catch(() => {});
    }
  }
}

const caminhoApi = (r) => {
  try {
    return new URL(r.url()).pathname;
  } catch {
    return '';
  }
};
const ehVerificar = (r) => r.request().method() === 'POST' && /\/Emissao\/verificar$/i.test(caminhoApi(r));
const ehEmitir = (r) => r.request().method() === 'POST' && /\/Emissao$/i.test(caminhoApi(r));

async function lerJson(resposta) {
  try {
    return await resposta.json();
  } catch {
    return null;
  }
}

/**
 * Faz a consulta de um CNPJ no site da Receita. Retorna
 *   { resultado: 'emitida', pdf, mensagem } | { resultado: 'em_debito', mensagem }
 * ou lança ErroConsulta.
 */
async function consultarCnpj(page, ctx) {
  const { cnpj } = ctx.empresa;

  await page.goto('about:blank');
  ctx.respostas = [];
  const coletor = (r) => {
    if (ehVerificar(r) || ehEmitir(r)) ctx.respostas.push(r);
  };
  page.on('response', coletor);
  try {
    return await emitirCertidao(page, ctx, cnpj);
  } finally {
    page.off('response', coletor);
  }
}

async function emitirCertidao(page, ctx, cnpj) {
  await page.goto(URL_RECEITA, { waitUntil: 'domcontentloaded' });
  const campo = page.locator('input[formcontrolname="niContribuinte"]');
  await campo.waitFor({ state: 'visible', timeout: 60_000 });
  await campo.click();
  await campo.pressSequentially(cnpj, { delay: 40 });

  const botaoEmitir = page.getByRole('button', { name: 'Emitir Certidão', exact: true });
  await botaoEmitir.click();

  // 1) Verificação: diz se já existe certidão válida, se pode emitir, ou se há impedimento.
  const respVerificar = await aguardarResposta(page, (r) => ehVerificar(r) || ehEmitir(r), ctx);
  let respEmitir = ehEmitir(respVerificar) ? respVerificar : null;

  if (!respEmitir) {
    const v = await lerJson(respVerificar);
    if (!respVerificar.ok() || !v) {
      const msg = textoMensagem(v?.mensagem) || `A Receita respondeu com erro (${respVerificar.status()}).`;
      throw new ErroConsulta(msg, { definitivo: respVerificar.status() === 400 });
    }
    const status = v.status;

    if (status === 'Emitida') {
      // Cenário 3: já existe certidão válida → "Emitir Nova Certidão".
      const botaoNova = page.getByRole('button', { name: 'Emitir Nova Certidão' });
      await botaoNova.waitFor({ state: 'visible', timeout: 20_000 });
      await botaoNova.click();
    } else if (status === 'NaoEmitida' || status === 'ContinuarEmissao') {
      // Cenário 2: o próprio site segue para a emissão.
    } else if (status === 'SistemaIndisponivel') {
      throw new ErroConsulta(textoMensagem(v.mensagem) || 'Sistema da Receita indisponível no momento.');
    } else {
      // CertidaoNaoPermitida, NiNaoCadastrado, CnpjFilial etc.
      throw new ErroConsulta(textoMensagem(v.mensagem) || `A Receita não permitiu a emissão (${status}).`, { definitivo: true });
    }
  }

  // 2) Emissão: devolve o PDF em base64, ou o motivo de não emitir (débitos/pendências).
  //    Enquanto a Receita responder "EmProcessamento" o site repete a chamada sozinho.
  let e = null;
  for (let i = 0; i < 6; i++) {
    if (!respEmitir) respEmitir = await aguardarResposta(page, ehEmitir, ctx);
    e = await lerJson(respEmitir);
    if (!respEmitir.ok() || !e) {
      throw new ErroConsulta(textoMensagem(e?.mensagem) || `A Receita respondeu com erro (${respEmitir.status()}).`);
    }
    if (e.statusEmissao !== 'EmProcessamento') break;
    respEmitir = null;
  }

  switch (e.statusEmissao) {
    case 'Sucesso':
      if (!e.pdf) throw new ErroConsulta('A Receita confirmou a emissão mas não enviou o PDF.');
      return { resultado: 'emitida', pdf: e.pdf, mensagem: null };
    case 'SemDireitoCertidao':
      // Cenário 1: débitos/pendências ("informações insuficientes para emitir a certidão pela Internet").
      return { resultado: 'em_debito', mensagem: textoMensagem(e.mensagem) || 'Há pendências na Receita Federal.' };
    case 'EmProcessamento':
      throw new ErroConsulta('A Receita ainda está processando a certidão. Tente novamente mais tarde.');
    default:
      throw new ErroConsulta(textoMensagem(e.mensagem) || `A Receita não emitiu a certidão (${e.statusEmissao}).`, {
        definitivo: e.statusEmissao !== 'SistemaIndisponivel' && e.statusEmissao !== 'Erro',
      });
  }
}

/**
 * Envia o resultado ao painel, insistindo se a internet falhar: o PDF só existe em memória
 * e não fica salvo neste computador.
 */
async function enviarResultado(empresa, resultado) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await painel('/api/robo/resultado', { empresaId: empresa.id, ...resultado });
    } catch (err) {
      if (tentativa === ENVIOS) throw err;
      log(`   falha ao enviar ao painel (${err.message}). Tentando de novo…`);
      await dormir(5000 * tentativa);
    }
  }
}

async function processar(page, execucaoId, empresa) {
  log(`→ ${empresa.nome} (${formatarCnpj(empresa.cnpj)})`);
  const ctx = { execucaoId, empresa, captchaAvisado: false };
  let resultado;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      resultado = await consultarCnpj(page, ctx);
      break;
    } catch (err) {
      const definitivo = err instanceof ErroConsulta && err.definitivo;
      const msg = err instanceof ErroConsulta ? err.message : `Falha no navegador: ${err.message.split('\n')[0]}`;
      log(`   tentativa ${tentativa} falhou: ${msg}`);
      if (definitivo || tentativa === TENTATIVAS) {
        resultado = { resultado: 'erro', mensagem: msg };
        break;
      }
      await dormir(5000 * tentativa);
    }
  }

  if (resultado.resultado === 'emitida') {
    log('   ✓ certidão emitida');
  } else if (resultado.resultado === 'em_debito') {
    log(`   ✗ EM DÉBITO: ${resultado.mensagem}`);
  } else {
    log(`   ! erro: ${resultado.mensagem}`);
  }

  await enviarResultado(empresa, resultado);
}

// ---------------------------------------------------------------- loop principal

async function abrirNavegador() {
  const perfil = path.join(__dirname, 'perfil-navegador');
  const opcoes = { headless: false, viewport: null, acceptDownloads: true };
  for (const channel of [NAVEGADOR, 'chrome', 'msedge']) {
    try {
      const ctx = await chromium.launchPersistentContext(perfil, { ...opcoes, channel });
      log(`Navegador aberto (${channel}).`);
      return ctx;
    } catch (err) {
      log(`Não consegui abrir ${channel}: ${err.message.split('\n')[0]}`);
    }
  }
  throw new Error('Nenhum navegador disponível. Instale o Google Chrome.');
}

async function principal() {
  console.log('');
  console.log('  Robô de Certidões CND');
  console.log(`  Painel: ${PAINEL_URL}`);
  console.log('  Deixe esta janela aberta. Para encerrar, feche-a ou pressione Ctrl+C.');
  console.log('');

  // Sinal de vida independente do loop, para o painel saber que o robô está ligado
  // mesmo durante uma consulta demorada.
  setInterval(() => painel('/api/robo/sinal').catch(() => {}), 10_000);

  let navegador = null;
  let page = null;
  let primeiro = true;
  let avisouEspera = false;

  for (;;) {
    let tarefa;
    try {
      tarefa = await painel(`/api/robo/tarefa${primeiro ? '?inicio=1' : ''}`);
      if (primeiro) log('Conectado ao painel. Aguardando o comando "Iniciar consulta"…');
      primeiro = false;
      avisouEspera = false;
    } catch (err) {
      if (!avisouEspera) log(`Sem conexão com o painel (${err.message}). Tentando de novo…`);
      avisouEspera = true;
      await dormir(15000);
      continue;
    }

    if (!tarefa.empresa) {
      if (navegador) {
        log('Consulta finalizada. Aguardando o próximo comando…');
        await navegador.close().catch(() => {});
        navegador = page = null;
      }
      await dormir(INTERVALO_OCIOSO_MS);
      continue;
    }

    try {
      if (!navegador || !page || page.isClosed()) {
        navegador = await abrirNavegador();
        page = navegador.pages()[0] || (await navegador.newPage());
        // O site tenta baixar o PDF sozinho; o arquivo é descartado (o PDF vai só para o painel).
        page.on('download', (d) => d.delete().catch(() => {}));
      }
      await processar(page, tarefa.execucao.id, tarefa.empresa);
    } catch (err) {
      log('Erro inesperado:', err.message);
      // Devolve a empresa como erro para a consulta não travar.
      await painel('/api/robo/resultado', { empresaId: tarefa.empresa.id, resultado: 'erro', mensagem: 'Falha inesperada no robô.' }).catch(() => {});
      await navegador?.close().catch(() => {});
      navegador = page = null;
    }
    await dormir(PAUSA_ENTRE_CNPJS_MS);
  }
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
