# Certidões CND — painel + robô

Automatiza a emissão da **Certidão de Regularidade Fiscal (PJ)** da Receita Federal para uma lista de CNPJs.

```
┌──────────────────────────┐        HTTPS        ┌──────────────────────────────┐
│  Painel (Vercel + Neon)  │ ◄─────────────────► │  Robô (PC do escritório)     │
│  login + autenticador    │   pede a próxima    │  abre o Chrome, consulta no  │
│  lista de empresas       │   empresa e envia   │  site da Receita, captura o  │
│  "Iniciar consulta"      │   o resultado/PDF   │  PDF e devolve ao painel     │
│  baixar certidões / ZIP  │                     │                              │
└──────────────────────────┘                     └──────────────────────────────┘
```

O robô roda no computador do escritório porque o site da Receita usa **hCaptcha**. Num navegador
comum com IP brasileiro ele normalmente passa sozinho; quando a Receita pedir o desafio, o robô:

1. traz a janela do navegador para a frente e mostra um aviso do Windows com bipe;
2. o painel mostra uma faixa amarela piscando, toca um alerta e envia uma notificação do navegador;
3. a pessoa resolve o captcha na janela e a consulta continua sozinha.

Se ninguém resolver, o robô espera até 15 minutos. Se o desafio for fechado, ele tenta de novo
(até 3 tentativas por empresa).

## Os 3 cenários

| Situação na Receita                              | O que o robô faz                                           | No painel                              |
| ------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------- |
| Sem débitos e sem certidão emitida               | o site já emite; o robô captura o PDF                      | **Baixar certidão**                    |
| Sem débitos e com certidão válida                | clica em **Emitir Nova Certidão** e captura o PDF          | **Baixar certidão**                    |
| Com débitos/pendências ("informações insuficientes") | não há PDF                                             | nome em vermelho com **EM DÉBITO**     |
| Outros (CNPJ de filial, inapto, site fora do ar) | registra a mensagem da Receita                             | "Não foi possível consultar" + motivo  |

O robô lê a resposta da própria API do site (`/Emissao/verificar` e `/Emissao`), que traz o PDF
em base64, e envia direto ao painel. **Nada fica salvo no computador:** o download que o site
tenta fazer sozinho é descartado na hora.

---

## 1. Publicar o painel na Vercel

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório e, em **Root Directory**, escolha `web`.
3. Antes do deploy, em **Storage → Create → Neon (Postgres)**, crie o banco (região **São Paulo**,
   `aws-sa-east-1`) e conecte ao projeto. Isso cria a variável `DATABASE_URL`.
4. Em **Settings → Environment Variables**, adicione:

   | Variável         | Valor                                                                      |
   | ---------------- | -------------------------------------------------------------------------- |
   | `SESSION_SECRET` | texto aleatório longo (veja abaixo)                                        |
   | `SETUP_CODE`     | uma senha temporária só para o primeiro acesso                             |
   | `ROBO_TOKEN`     | texto aleatório longo, que também vai no `.env` do robô                    |

   Para gerar os valores aleatórios:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. Em **Settings → Functions → Function Region**, escolha **São Paulo (gru1)**, perto do banco.
6. Faça o deploy.

### Criar as tabelas e importar as empresas

No seu computador, dentro de `web/`:

```
npm install
npx vercel link            # vincula a pasta ao projeto da Vercel
npx vercel env pull .env.local
npm run db:setup
```

Isso cria as tabelas e importa as empresas de `web/scripts/empresas-iniciais.json`, se o arquivo
existir. Essa lista contém dados de clientes e **não vai para o repositório**: ela fica só na máquina
de quem faz a instalação. Sem ela, basta cadastrar as empresas pelo painel. A importação só acontece
se a tabela estiver vazia, então rodar o comando de novo é seguro.

### Primeiro acesso

1. Abra o endereço do painel. Ele vai direto para **/setup**.
2. Escaneie o QR Code com o Google Authenticator ou o Microsoft Authenticator.
3. Digite o `SETUP_CODE`, crie a senha e confirme com o código de 6 dígitos.

Depois disso, a tela de configuração deixa de existir. Se quiser, apague a variável `SETUP_CODE`.

**Login:** senha + código do autenticador.
**Esqueci a senha:** em "Esqueci minha senha", basta o código do autenticador para definir uma
senha nova.
**Proteção:** 5 tentativas erradas bloqueiam o acesso por 15 minutos, e cada código do
autenticador só vale uma vez.

> Se o celular com o autenticador for perdido, é preciso apagar a linha da tabela `usuario`
> no Neon (`delete from usuario;`) e refazer o /setup com um `SETUP_CODE` novo.

---

## 2. Instalar o robô no computador do escritório

Pré-requisitos: **Google Chrome** (ou o Edge, que já vem no Windows) e **Node.js LTS**
(https://nodejs.org).

1. Copie a pasta `robo/` para o computador, sem a pasta `node_modules`.
2. Copie `.env.example` para `.env` e preencha:
   ```
   PAINEL_URL=https://seu-painel.vercel.app
   ROBO_TOKEN=(o mesmo valor configurado na Vercel)
   ```
3. Dê dois cliques em **INICIAR-ROBO.bat**. Na primeira vez ele instala o que precisa.
4. Opcional: dê dois cliques em **INICIAR-COM-O-WINDOWS.bat** para o robô abrir sozinho ao ligar o PC.

Com o robô aberto, o painel mostra **"Robô conectado"** em verde. A janela do robô precisa
ficar aberta, mas pode ficar minimizada. Se ele travar ou fechar sozinho, o `.bat` reinicia.

---

## Uso no dia a dia

- **Iniciar consulta:** consulta todas as empresas, uma por vez (leva cerca de 15 a 30 s cada).
- **↻ na linha:** consulta só aquela empresa (útil para refazer as que deram erro).
- **Baixar certidão:** baixa o PDF daquela empresa.
- **Baixar últimas certidões (ZIP):** junta só a certidão mais recente de cada empresa, nunca o histórico. Empresa em débito não entra.
- **Nova empresa / editar / excluir:** mantém a lista. Aceita o CNPJ alfanumérico novo.
- Os cartões no topo (Emitidas / Em débito / Com erro) também servem de filtro.

## Histórico por mês

Os botões de mês no topo mudam a lista inteira. Em cada mês, a empresa em débito aparece em vermelho
e a que saiu certidão tem o download daquela certidão. Exemplo de uma mesma empresa:

| Mês       | Situação  | Na lista                   |
| --------- | --------- | -------------------------- |
| janeiro   | em débito | nome em vermelho           |
| fevereiro | em dia    | baixa a certidão de fevereiro |
| março     | em débito | nome em vermelho           |

A faixa de quadradinhos em cada linha mostra os 6 meses de uma vez (✓ emitida, ✕ em débito,
! erro, vazio = não consultada). Clicar num quadradinho vai para aquele mês.

- Se houver mais de uma consulta no mês, vale a mais recente que teve resposta da Receita (um erro
  não esconde um resultado real).
- **São guardados os 6 meses mais recentes.** Em julho, janeiro é apagado por completo (PDF e
  registro) e ficam fevereiro a julho. O mês antigo some da tela na virada e é apagado do servidor
  na primeira consulta iniciada no mês novo.
- **Excluir uma empresa apaga o histórico dela.** O painel avisa antes.

## Estrutura

```
web/    painel Next.js (Vercel)
  scripts/db-setup.mjs           cria as tabelas e importa a lista inicial
  scripts/empresas-iniciais.json lista inicial (local, fora do repositório)
  src/app/api/robo/*             endpoints usados pelo robô (protegidos por ROBO_TOKEN)
robo/   robô local (Node + Playwright usando o Chrome instalado)
```
