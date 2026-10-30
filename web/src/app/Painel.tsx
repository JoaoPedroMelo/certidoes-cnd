'use client';

import { zipSync } from 'fflate';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nomeArquivoCertidao } from '@/lib/certidao';
import { cnpjValido, formatarCnpj } from '@/lib/cnpj';

type Resultado = 'emitida' | 'em_debito' | 'erro';

type RegistroMes = {
  consulta_id: number;
  resultado: Resultado;
  mensagem: string | null;
  consultado_em: string;
  tem_pdf: boolean;
};

type Empresa = {
  id: number;
  cnpj: string;
  nome: string;
  fila: 'aguardando' | 'processando' | null;
  certidao_id: number | null;
  certidao_em: string | null;
  historico: Record<string, RegistroMes>;
};

type Estado = {
  meses: string[];
  empresas: Empresa[];
  execucao: null | { id: number; estado: 'aguardando' | 'rodando' | 'captcha'; total: number; feitos: number; mensagem: string | null };
  ultimaExecucao: null | { estado: string; finalizada_em: string };
  robo: { online: boolean; ultimoContato: string | null };
};

type Filtro = 'todas' | 'emitida' | 'em_debito' | 'erro' | 'nunca';

const dataHora = (s: string) =>
  new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const data = (s: string) => new Date(s).toLocaleDateString('pt-BR');

/** '2026-10' -> 'out' */
function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

/** '2026-10' -> 'outubro de 2026' */
function nomeMesCompleto(mes: string) {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

const ROTULO_RESULTADO: Record<Resultado, string> = {
  emitida: 'Certidão emitida',
  em_debito: 'Em débito',
  erro: 'Não foi possível consultar',
};
const SIMBOLO_RESULTADO: Record<Resultado, string> = { emitida: '✓', em_debito: '✕', erro: '!' };

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (r.status === 401) {
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.erro ?? 'Erro inesperado');
  return body;
}

function avisarCaptcha() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {}
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Verificação necessária', {
      body: 'O site da Receita pediu um captcha. Vá até a janela do navegador do robô e resolva.',
      requireInteraction: true,
    });
  }
}

export function Painel() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [editando, setEditando] = useState<Empresa | 'nova' | null>(null);
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [zipando, setZipando] = useState<string | null>(null);
  const captchaAnterior = useRef(false);

  const carregar = useCallback(async () => {
    try {
      setEstado(await api('/api/painel'));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  const ativa = Boolean(estado?.execucao);
  const emCaptcha = estado?.execucao?.estado === 'captcha';

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, ativa ? 3000 : 15000);
    return () => clearInterval(t);
  }, [carregar, ativa]);

  useEffect(() => {
    if (emCaptcha && !captchaAnterior.current) avisarCaptcha();
    captchaAnterior.current = emCaptcha;
    document.title = emCaptcha ? '⚠ Resolver captcha — Certidões CND' : 'Certidões CND';
  }, [emCaptcha]);

  const meses = estado?.meses ?? [];
  const mesAtual = meses[meses.length - 1];
  const mes = mesEscolhido && meses.includes(mesEscolhido) ? mesEscolhido : mesAtual;
  const noMesAtual = mes === mesAtual;

  const contagem = useMemo(() => {
    const c = { todas: 0, emitida: 0, em_debito: 0, erro: 0, nunca: 0 };
    for (const e of estado?.empresas ?? []) {
      c.todas++;
      c[e.historico[mes]?.resultado ?? 'nunca']++;
    }
    return c;
  }, [estado, mes]);

  const ultimasCertidoes = (estado?.empresas ?? []).filter((e) => e.certidao_id !== null);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/[^0-9a-z]/g, '');
    return (estado?.empresas ?? []).filter(
      (e) =>
        (filtro === 'todas' || (e.historico[mes]?.resultado ?? 'nunca') === filtro) &&
        (!termo || e.nome.toLowerCase().includes(termo) || (digitos && e.cnpj.toLowerCase().includes(digitos))),
    );
  }, [estado, busca, filtro, mes]);

  async function iniciar(ids?: number[]) {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    setMesEscolhido(null);
    try {
      await api('/api/execucoes', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) });
      await carregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function cancelar() {
    if (!confirm('Cancelar a consulta? A empresa que está sendo consultada agora termina normalmente.')) return;
    await api('/api/execucoes', { method: 'DELETE' }).catch((e) => alert(e.message));
    await carregar();
  }

  async function excluir(e: Empresa) {
    if (!confirm(`Excluir ${e.nome} (${formatarCnpj(e.cnpj)}) da lista?\n\nO histórico e as certidões guardadas desta empresa também serão apagados.`)) return;
    await api(`/api/empresas/${e.id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
    await carregar();
  }

  async function baixarTodas() {
    const comCertidao = ultimasCertidoes;
    if (!comCertidao.length) return;
    const arquivos: Record<string, Uint8Array> = {};
    try {
      for (let i = 0; i < comCertidao.length; i++) {
        const e = comCertidao[i];
        setZipando(`${i + 1}/${comCertidao.length}`);
        const r = await fetch(`/api/certidoes/${e.certidao_id}`);
        if (!r.ok) continue;
        arquivos[nomeArquivoCertidao(e.nome, e.cnpj, e.certidao_em!)] = new Uint8Array(await r.arrayBuffer());
      }
      const zip = zipSync(arquivos, { level: 0 });
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certidoes-CND-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipando(null);
    }
  }

  if (!estado) {
    return <main className="painel"><p className="vazio">{erro ?? 'Carregando…'}</p></main>;
  }

  const { execucao, robo, ultimaExecucao } = estado;
  const percentual = execucao ? Math.round((execucao.feitos / Math.max(execucao.total, 1)) * 100) : 0;

  return (
    <main className="painel">
      <header className="topo">
        <div>
          <h1>Certidões CND</h1>
          <p>Certidão de Regularidade Fiscal — Pessoa Jurídica (Receita Federal)</p>
        </div>
        <div className="topo-direita">
          <span className={`pill ${robo.online ? 'pill-online' : ''}`} title={robo.ultimoContato ? `Último sinal: ${dataHora(robo.ultimoContato)}` : 'O robô nunca se conectou'}>
            <span className="ponto" /> Robô {robo.online ? 'conectado' : 'desconectado'}
          </span>
          <form action="/api/sair" method="post">
            <button className="btn" type="submit">Sair</button>
          </form>
        </div>
      </header>

      {emCaptcha && (
        <div className="captcha" role="alert">
          <Icone nome="alerta" />
          <div>
            <strong>Verificação de segurança necessária</strong>
            <p>
              O site da Receita pediu um captcha. Vá até a janela do navegador do robô (ela foi trazida para a frente),
              resolva o desafio e a consulta continua sozinha.
            </p>
          </div>
        </div>
      )}

      {execucao ? (
        <section className="cartao execucao">
          <div className="execucao-linha">
            <strong>
              {execucao.estado === 'aguardando' ? 'Aguardando o robô começar…' : `Consultando ${Math.min(execucao.feitos + 1, execucao.total)} de ${execucao.total}`}
            </strong>
            <button className="btn btn-perigo" onClick={cancelar}>Cancelar consulta</button>
          </div>
          <div className="barra"><div style={{ width: `${percentual}%` }} /></div>
          {!robo.online && (
            <p className="nota nota-alerta">
              O robô está desconectado. Abra o “Robô de Certidões” no computador para a consulta andar.
            </p>
          )}
        </section>
      ) : (
        ultimaExecucao && (
          <p className="nota">
            Última consulta {ultimaExecucao.estado === 'cancelada' ? 'cancelada' : 'concluída'} em {dataHora(ultimaExecucao.finalizada_em)}.
          </p>
        )
      )}

      <nav className="seletor-meses" aria-label="Escolher o mês">
        {meses.map((m) => (
          <button key={m} aria-pressed={m === mes} onClick={() => setMesEscolhido(m)}>
            {nomeMes(m)}<small>{m.slice(0, 4)}</small>
          </button>
        ))}
      </nav>

      <section className="resumo" aria-label="Filtrar por situação">
        {([
          ['todas', 'Empresas', ''],
          ['emitida', 'Certidão emitida', 'r-verde'],
          ['em_debito', 'Em débito', 'r-vermelho'],
          ['erro', 'Com erro', 'r-ambar'],
        ] as const).map(([chave, rotulo, cls]) => (
          <button key={chave} className={cls} aria-pressed={filtro === chave} onClick={() => setFiltro(filtro === chave ? 'todas' : chave)}>
            <strong>{contagem[chave]}</strong>
            <span>{rotulo}</span>
          </button>
        ))}
      </section>

      <section className="cartao">
        <div className="ferramentas">
          <input className="busca" placeholder="Buscar por nome ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button className="btn" onClick={() => setEditando('nova')}>
            <Icone nome="mais" /> Nova empresa
          </button>
          <button className="btn" onClick={baixarTodas} disabled={!ultimasCertidoes.length || zipando !== null} title="Baixa só a certidão mais recente de cada empresa">
            <Icone nome="baixar" /> {zipando ? `Preparando ${zipando}…` : 'Baixar últimas certidões (ZIP)'}
          </button>
          <button className="btn btn-primario" onClick={() => iniciar()} disabled={ativa || !contagem.todas}>
            <Icone nome="play" /> Iniciar consulta
          </button>
        </div>

        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Situação em {nomeMesCompleto(mes)}</th>
                <th className="col-meses">
                  <div className="meses" title="Últimos 6 meses">
                    {meses.map((m) => <span key={m}>{nomeMes(m)}</span>)}
                  </div>
                </th>
                <th className="col-consulta">Consultada em</th>
                <th className="col-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const registro = e.historico[mes];
                return (
                  <tr key={e.id} className={registro?.resultado === 'em_debito' ? 'em-debito' : undefined}>
                    <td>
                      <div className="nome">
                        {registro?.resultado === 'em_debito' && <span className="tag-debito">EM DÉBITO</span>}
                        {e.nome}
                      </div>
                      <div className="cnpj">{formatarCnpj(e.cnpj)}</div>
                    </td>
                    <td><Situacao registro={registro} fila={noMesAtual ? e.fila : null} /></td>
                    <td className="col-meses">
                      <div className="meses">
                        {meses.map((m) => {
                          const r = e.historico[m]?.resultado;
                          return (
                            <button
                              key={m}
                              className={`mes ${r ? `mes-${r}` : ''} ${m === mes ? 'mes-selecionado' : ''}`}
                              title={`${nomeMes(m)}: ${r ? ROTULO_RESULTADO[r] : 'não consultada'}`}
                              onClick={() => setMesEscolhido(m)}
                            >
                              {r ? SIMBOLO_RESULTADO[r] : ''}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="col-consulta">{registro ? dataHora(registro.consultado_em) : '—'}</td>
                    <td className="col-acoes">
                      <div className="acoes">
                        {registro?.resultado === 'emitida' && registro.tem_pdf && (
                          <a className="btn btn-baixar" href={`/api/certidoes/${registro.consulta_id}`} title={`Emitida em ${dataHora(registro.consultado_em)}`}>
                            <Icone nome="baixar" /> Baixar certidão
                          </a>
                        )}
                        {noMesAtual && (
                          <button className="btn btn-icone" title="Consultar só esta empresa" disabled={ativa} onClick={() => iniciar([e.id])}>
                            <Icone nome="refazer" />
                          </button>
                        )}
                        <button className="btn btn-icone" title="Editar" onClick={() => setEditando(e)}>
                          <Icone nome="editar" />
                        </button>
                        <button className="btn btn-icone" title="Excluir" disabled={e.fila === 'processando'} onClick={() => excluir(e)}>
                          <Icone nome="lixo" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lista.length && <p className="vazio">Nenhuma empresa encontrada.</p>}
        </div>
      </section>

      {editando && (
        <ModalEmpresa
          empresa={editando === 'nova' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function Situacao({ registro, fila }: { registro?: RegistroMes; fila: Empresa['fila'] }) {
  if (fila === 'processando') return <span className="status s-processando"><span className="giro" /> Consultando…</span>;
  if (fila === 'aguardando') return <span className="status s-fila">Na fila</span>;
  switch (registro?.resultado) {
    case 'emitida':
      return <span className="status s-emitida">Certidão emitida em {data(registro.consultado_em)}</span>;
    case 'em_debito':
      return (
        <span className="status s-em_debito">
          <span>Pendências na Receita{registro.mensagem && <small>{registro.mensagem}</small>}</span>
        </span>
      );
    case 'erro':
      return (
        <span className="status s-erro">
          <span>Não foi possível consultar{registro.mensagem && <small>{registro.mensagem}</small>}</span>
        </span>
      );
    default:
      return <span className="status s-nunca">Não consultada neste mês</span>;
  }
}

function ModalEmpresa({ empresa, onFechar, onSalvo }: { empresa: Empresa | null; onFechar: () => void; onSalvo: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [nome, setNome] = useState(empresa?.nome ?? '');
  const [cnpj, setCnpj] = useState(empresa ? formatarCnpj(empresa.cnpj) : '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!cnpjValido(cnpj)) return setErro('CNPJ inválido. Confira os números.');
    setSalvando(true);
    try {
      await api(empresa ? `/api/empresas/${empresa.id}` : '/api/empresas', {
        method: empresa ? 'PUT' : 'POST',
        body: JSON.stringify({ nome, cnpj }),
      });
      onSalvo();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onFechar}>
      <form className="modal" onSubmit={salvar}>
        <h2>{empresa ? 'Editar empresa' : 'Nova empresa'}</h2>
        <label className="campo">
          <span>Nome / nome fantasia</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        </label>
        <label className="campo">
          <span>CNPJ</span>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} onBlur={() => setCnpj(formatarCnpj(cnpj))} placeholder="00.000.000/0000-00" required />
        </label>
        {erro && <p className="aviso aviso-erro">{erro}</p>}
        <div className="modal-botoes">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancelar</button>
          <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </dialog>
  );
}

const CAMINHOS = {
  mais: 'M12 5v14M5 12h14',
  baixar: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
  play: 'M8 5v14l11-7z',
  refazer: 'M4 12a8 8 0 0 1 13.7-5.7L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 4v-4h4',
  editar: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  lixo: 'M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  alerta: 'M12 3 2 20h20L12 3zm0 6v5m0 3v.01',
} as const;

function Icone({ nome }: { nome: keyof typeof CAMINHOS }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={nome === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
