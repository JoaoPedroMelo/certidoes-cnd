// Cria as tabelas e importa a lista inicial de empresas.
// Uso: npm run db:setup   (lê DATABASE_URL de .env.local)
import { neon } from '@neondatabase/serverless';
import { existsSync, readFileSync } from 'node:fs';

const sql = neon(process.env.DATABASE_URL);

await sql`
  create table if not exists usuario (
    id int primary key default 1 check (id = 1),
    senha_hash text not null,
    totp_secret text not null,
    totp_ultimo_passo bigint not null default 0,
    falhas int not null default 0,
    bloqueado_ate timestamptz,
    criado_em timestamptz not null default now()
  )`;

await sql`
  create table if not exists empresas (
    id serial primary key,
    cnpj varchar(14) not null unique,
    nome text not null,
    fila text,
    certidao_id int,
    certidao_em timestamptz,
    criado_em timestamptz not null default now()
  )`;

// Uma linha por consulta feita: é o histórico mês a mês de cada empresa (guardado por 6 meses).
await sql`
  create table if not exists consultas (
    id serial primary key,
    empresa_id int not null references empresas (id) on delete cascade,
    cnpj varchar(14) not null,
    resultado text not null,
    mensagem text,
    pdf text,
    consultado_em timestamptz not null default now()
  )`;
await sql`create index if not exists consultas_empresa_data on consultas (empresa_id, consultado_em desc)`;

await sql`
  create table if not exists execucoes (
    id serial primary key,
    estado text not null default 'aguardando',
    total int not null,
    mensagem text,
    iniciada_em timestamptz not null default now(),
    finalizada_em timestamptz
  )`;

await sql`
  create table if not exists robo (
    id int primary key default 1 check (id = 1),
    ultimo_contato timestamptz
  )`;
await sql`insert into robo (id) values (1) on conflict do nothing`;

const [{ total }] = await sql`select count(*)::int as total from empresas`;
const listaInicial = new URL('./empresas-iniciais.json', import.meta.url);
if (total === 0 && !existsSync(listaInicial)) {
  console.log('Lista inicial não encontrada (ela não vai para o repositório). Cadastre as empresas pelo painel.');
} else if (total === 0) {
  const empresas = JSON.parse(readFileSync(listaInicial, 'utf8'));
  for (const e of empresas) {
    await sql`insert into empresas (cnpj, nome) values (${e.cnpj}, ${e.nome}) on conflict (cnpj) do nothing`;
  }
  console.log(`${empresas.length} empresas importadas.`);
} else {
  console.log(`Tabela de empresas já tem ${total} registros; importação inicial ignorada.`);
}

console.log('Banco pronto.');
