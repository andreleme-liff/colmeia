# Colméia — gestão de atividades e pipeline comercial

Atividade comercial, execução operacional, cadastros, receita, faturamento e despesas,
organizados por produto, com permissão por papel e log de alterações em tudo.

Next.js 16 (App Router) + Postgres (Supabase), driver `postgres`, sessão em cookie httpOnly.

```bash
cp .env.example .env.local   # preencha DATABASE_URL e ADMIN_EMAIL
npm install
npm run dev
```

> **Nunca aponte `DATABASE_URL` local para o banco de produção.** Use um projeto separado.

## Banco

A migração é idempotente e roda sozinha no primeiro acesso ao banco, dentro de uma transação
protegida por `pg_advisory_xact_lock` (vários cold starts sobem ao mesmo tempo e
`CREATE TABLE IF NOT EXISTS` não é atômico contra um criador concorrente).

- **Conexão:** Transaction Pooler da Supabase, porta 6543, com `prepare: false`.
- **Base vazia:** sem `SEED_DEMO=1` nada é inserido além das categorias de despesa. Com
  `SEED_DEMO=1` entra um conjunto fictício de produtos, pessoas e cards, para desenvolvimento.
- **API REST da Supabase fechada:** a migração revoga os privilégios de `anon` e
  `authenticated` em todas as tabelas do app. Tabela nova entra na lista em `lib/db.ts`.

## Acesso

A pessoa digita o e-mail cadastrado em Cadastros → pessoas e entra — **sem senha e sem
confirmação, provisoriamente**. Isso identifica, não autentica: quem souber o e-mail de alguém
cadastrado entra como essa pessoa. O sistema de senha vem depois.

`ADMIN_EMAIL` (um ou mais e-mails, separados por vírgula) entra como admin sem cadastro, para
a base vazia ter quem cadastre os demais. Desativar ou excluir a pessoa corta o acesso na
requisição seguinte.

Não há segredo de sessão: o token é opaco (`randomBytes(32)` na tabela `sessions`), então
revogar é apagar a linha.

## Permissão

O papel decide: `leitura` vê todos os produtos e não edita; `membro` e `gestor` editam os
cards; `financeiro` opera receita, faturamento e despesas; `admin` também administra
cadastros. Toda leitura filtra no SQL e toda escrita reavalia a permissão no servidor — o
`podeEditar` que chega ao front só desenha o estado.

Quem não enxerga um registro recebe **404, não 403**. No pipeline o cliente manda a direção
(`-1`/`+1`), não o estágio de destino.

## Receita e faturamento

Uma receita é paga em **parcelas livres**: cada uma com a sua data e o seu valor, sem intervalo
fixo. Uma parcela = à vista; duas ou mais = parcelado. O valor da oportunidade no Comercial é um
número só; o detalhe das parcelas fica na Receita. Cada parcela de uma receita contratada vira
uma fatura a emitir no mês em que vence, e a fatura aponta para a parcela (`faturas.parcela_id`)
— por isso uma parcela já faturada não pode ser removida sem cancelar a fatura.

## Auditoria

`audit_log` é append-only. Cada linha guarda autor, horário, entidade, campo e o par valor
anterior/novo.

## Onde as coisas estão

| Caminho | Papel |
|---|---|
| `lib/db.ts` | Conexão, schema e conjunto de demonstração |
| `lib/auth.ts`, `lib/acesso.ts` | Sessão e login por e-mail |
| `lib/perms.ts` | Permissão por papel |
| `lib/ops/` | Núcleo de tarefas e oportunidades (interface e MCP gravam por aqui) |
| `lib/mcp/`, `lib/oauth/` | Servidor MCP e o OAuth 2.1 que o protege |
| `lib/domain.ts` | Status, estágios, papéis — compartilhado servidor/cliente |
| `app/api/` | Rotas, cada uma com sua checagem |
| `app/components/` | Casca (`Ops.tsx`), telas (`views.tsx`) e componentes (`ds.tsx`) |
| `_ds/design-system/tokens/` | Tokens CSS (cores, tipografia, espaçamento) |

## Servidor MCP

`/api/mcp` deixa assistentes de IA (Claude, ChatGPT) lerem e gravarem **em nome de uma
pessoa**, com as permissões dela.

| Variável | Para quê |
|---|---|
| `MCP_HABILITADO` | `1` liga. Sem isso, endpoint, consentimento e metadados respondem 404. |
| `MCP_URL_CANONICA` | O `resource` a que todo token fica preso. Mude ao trocar de domínio. |
| `MCP_CLIENTES_PERMITIDOS` | Hosts aceitos como cliente (padrão `claude.ai,chatgpt.com,amazon-quick`). |

Conectar: no claude.ai, Configurações → Conectores → Adicionar conector personalizado, com a
URL do `/api/mcp` e os campos de OAuth em branco. No Claude Code, `claude mcp add --transport
http colmeia <URL>` e depois `/mcp`.

- O app é o próprio servidor OAuth 2.1: PKCE S256, `redirect_uri` exato, tokens opacos
  guardados só como SHA-256, acesso de 1 h e refresh de 30 dias com rotação.
- O token carrega a pessoa, não a permissão: cada chamada recalcula o que ela pode.
- Gravar é opção explícita na tela de consentimento. Nada é excluído pelo MCP.
- Toda chamada fica em `mcp_chamadas`; gravações entram no `audit_log` com `origem = 'mcp'`.
- **O login do MCP é o mesmo da tela** — enquanto não houver senha, vale o mesmo aviso.

## Testes

`scripts/verificar-*.mjs` rodam sem banco (`node --experimental-strip-types scripts/verificar-ops.mjs`).
Os `scripts/e2e-*-local.mjs` rodam contra app e banco locais, com um Postgres em memória:

```bash
npx @electric-sql/pglite-socket --db=memory:// --port=5433 --max-connections=10
PGMAX=1 SEED_DEMO=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres npm run dev -- -p 3010
```

## Deploy

Vercel, a partir da `main`. Variáveis: `DATABASE_URL`, `ADMIN_EMAIL` e as do MCP.
