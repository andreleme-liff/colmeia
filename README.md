# LIFF tasks — gestão de atividades e pipeline comercial

Atividade comercial, execução operacional, cadastros e administração da LIFF, organizados
por área, com permissão por usuário e log de alterações em tudo.

Next.js 16 (App Router) + Supabase Postgres, na mesma stack do `mini-todos`: driver
`postgres`, connection string no servidor, sessão em cookie httpOnly.

> ⚠️ **Nunca aponte `DATABASE_URL` local para o projeto Supabase de produção.** Use sempre um
> projeto Supabase separado para desenvolvimento (um segundo projeto gratuito resolve).

```bash
cp .env.example .env.local   # preencha DATABASE_URL e as credenciais do Google
npm install
npm run dev
```

A migração é idempotente e roda sozinha no primeiro acesso ao banco: cria as tabelas e, se a
base estiver vazia, insere o conjunto de demonstração. `SEED_DEMO=0` sobe a base limpa.

### Pooler ou conexão direta?

**Pooler, porta 6543 (Transaction mode).** Uma só string, inclusive para a migração.

A regra "migration precisa da conexão direta" vem de ferramentas como o Prisma, que usam
advisory lock de **sessão** e prepared statements — nada disso sobrevive ao pgbouncer em modo
transaction. Aqui não se usa nenhum dos dois: a migração é DDL simples pelo driver `postgres`
com `prepare: false`, e a serialização usa `pg_advisory_xact_lock`, que morre no commit e é
exatamente o tipo compatível com o pooler.

A direta (5432) funcionaria, mas esgota conexões em serverless. Não use.

### Por que a migração tem um lock

Ela roda no primeiro acesso ao banco, e em serverless vários cold starts sobem ao mesmo
tempo. `CREATE TABLE IF NOT EXISTS` **não é atômico** contra um criador concorrente: dois
processos simultâneos conseguem produzir `relation already exists` ou violar
`pg_type_typname_nsp_index`. O seed tinha a mesma corrida — dois processos liam `COUNT(*) = 0`
e ambos inseriam. Por isso tudo acontece dentro de uma transação protegida por advisory lock.

Para um sistema maior, o mais convencional seria um passo de migração separado do boot. Aqui
o schema é pequeno e estável, e a migração no primeiro acesso segue a convenção do
`mini-todos`.

### A API REST da Supabase fica fechada

A Supabase expõe o schema `public` via PostgREST, atendendo com os papéis `anon` e
`authenticated`, e concede privilégios a eles por padrão em tabelas novas. Como a chave anon
é pública por definição, tabela sem restrição no `public` é tabela legível por quem tiver a
URL do projeto — e `sessions` guarda token de sessão, o que viraria sequestro de conta.

A migração revoga os privilégios desses dois papéis nas seis tabelas. Isso vale independente
de RLS e de atributo de papel, e é no-op em Postgres sem Supabase.

O painel da Supabase vai continuar mostrando o aviso "RLS disabled in public" — ele olha
`relrowsecurity`, não os privilégios. **Não é exposição**: pode conferir tentando ler
qualquer tabela com a chave anon, que volta permission denied. Ligar RLS também, como camada
extra, é possível, mas exige testar antes que o papel da connection string não seja barrado
junto.

### Sessão: não há segredo

Não existe `SESSION_SECRET`, `NEXTAUTH_SECRET` ou equivalente, e é de propósito. O token de
sessão é **opaco** — `randomBytes(32)` guardado na tabela `sessions` e conferido por consulta
— em vez de um cookie assinado tipo JWT. Não há nada para assinar, logo nada para rotacionar
ou vazar, e revogar acesso é apagar a linha (é assim que o interruptor "ativo" da
administração corta a sessão na requisição seguinte). O custo é uma consulta por requisição,
irrelevante nesta escala.

## Onde as coisas estão

| Caminho | Papel |
|---|---|
| `lib/db.ts` | Conexão, schema e seed |
| `lib/auth.ts` | Sessão em cookie; criação/vínculo de conta pelo Google |
| `lib/google-oauth.ts` | Authorization code flow, restrição de domínio |
| `lib/perms.ts` | **Permissão por área — o enforcement de verdade** |
| `lib/log.ts` | Escrita na auditoria |
| `lib/domain.ts` | Áreas, status, estágios, papéis — compartilhado servidor/cliente |
| `app/api/state` | Estado completo, já recortado pela permissão |
| `app/api/activities/[id]`, `deals/[id]`, `users/[id]` | Escritas, cada uma com sua checagem |
| `app/components/Ops.tsx` | Casca do sistema, estado de tela e handlers |
| `app/components/views.tsx` | As telas, puramente de apresentação |
| `app/components/ds.tsx` | Componentes do design system LIFF |
| `_ds/` | Design system original, intocado — tokens consumidos direto |

## Permissão: o que mudou de verdade

No protótipo estático a regra de permissão morava no navegador. Isso se sustentava porque
não havia dados — nada a proteger. Com banco de verdade, permissão em JavaScript é
decoração: basta abrir o console.

Agora **toda leitura filtra pelas áreas visíveis no SQL** (`WHERE area = ANY($areas)`) e
**toda escrita reavalia a permissão a partir da área do registro no banco**, nunca de algo
que o cliente mandou junto. O `podeEditar` que chega em cada registro para o front existe só
para desenhar o estado — se o cliente ignorá-lo, o servidor recusa.

Duas decisões que valem registrar:

- Quem não enxerga a área recebe **404, não 403**, ao mexer num registro dela. Um 403
  confirmaria que aquele id existe.
- No pipeline o cliente manda a **direção** (`-1`/`+1`), não o estágio de destino. Assim não
  dá para pular etapas mandando um estágio arbitrário.

O papel define o teto e a matriz por área refina dentro dele: `admin` tem edição em tudo sem
depender da matriz, `leitura` nunca passa de `view` mesmo que a matriz diga `edit`.

## Acesso

Só existe um caminho de entrada: **SSO Google restrito a `getliff.ai`** (a lista de perfis
do protótipo sumiu — quem você é passa a ser definido pelo Google). Conta nova entra como
`membro` e **sem nenhuma área**, até a administração liberar — que é o que a tela sempre
prometeu. A exceção é `ADMIN_EMAIL`, que entra como admin para a primeira instalação não
ficar sem ninguém capaz de liberar acesso.

Desativar alguém na administração corta o acesso na requisição seguinte.

## Auditoria

`audit_log` é append-only — nada no app faz `UPDATE` ou `DELETE` nela. Cada linha guarda
autor, horário, entidade, campo e o par valor anterior/novo, que é exatamente o que a tela
de administração promete. Uma alteração que mexe em três campos vira três linhas.

## Temas

O design system é dark-first e não define tema claro. O escuro é ele, intocado. O claro vive
em `app/globals.css` e reescreve só os aliases semânticos, derivando cada tom por mistura das
cores da marca — nenhum HEX novo entra no sistema.

Três pontos que não eram simples inversão de fundo: Charcoal fazia dois papéis (hairline e
texto apagado) e precisou virar dois tokens; as cores de estado não contrastam sobre Floral
White e ganharam variante de texto escurecida por mistura com Obsidiana; e os tons Mid das
produtos somem no branco, então cada área sobe para o Core (Labs usa o Dark, porque seu Core
é um teal luminoso que também não segura).

## Design system

Os tokens CSS vêm direto de `_ds/`, sem cópia — `globals.css` os importa. A única exceção é
`fonts.css`, que faz `@import` do Google Fonts: no Next as mesmas duas famílias entram por
`next/font`.

Os componentes React são o ponto onde o kit não coube como está: `_ds_bundle.js` é um IIFE
que pendura tudo em `window.LIFFDesignSystem_064c9d` e depende de um React global, o que não
existe num build de módulos. Os seis componentes usados (`LiffMark`, `Button`, `Field`,
`Input`, `Select`, `Switch`) estão transcritos 1:1 em `app/components/ds.tsx` — mesmas props,
mesmos valores. O bundle segue no repositório como referência para conferir divergências.

`Field`/`Input`/`Select` e o variant `ghost` do `Button` fixam texto Floral White em estilo
inline: foram construídos só para o canvas escuro. No tema claro isso é corrigido por fora,
sem alterar o kit.

## Estado atual e limites

- **Cadastros é só leitura.** O formulário "novo registro" desenha, mas não grava — não havia
  rota de criação no desenho original e não inventei uma.
- Os tipos de atividade são texto livre (`Comercial`, `Operacional`, `Produto`,
  `Institucional`), não uma tabela.
- O conjunto de demonstração inclui três pessoas fictícias além do admin. Em base de verdade,
  suba com `SEED_DEMO=0`.
- Prazo crítico agora é calculado (vence nos próximos 7 dias e não está concluído), não mais
  uma lista fixa de datas.

## Conectar o Claude (servidor MCP)

O LIFF tasks expõe um servidor MCP em `/api/mcp` para o Claude (claude.ai, app desktop,
celular e Claude Code) ler e gravar **em nome de uma pessoa**, com as permissões dela.

### Ligar

Desligado por padrão: sem `MCP_HABILITADO=1`, o endpoint, a tela de consentimento e os
metadados OAuth respondem 404. Variáveis:

| Variável | Padrão | Para quê |
|---|---|---|
| `MCP_HABILITADO` | — | `1` liga. Qualquer outro valor mantém desligado. |
| `MCP_URL_CANONICA` | `https://go.liff.tech/api/mcp` | O `resource` a que todo token fica preso. Em outro domínio, mude aqui. |
| `MCP_CLIENTES_PERMITIDOS` | `claude.ai` | Hosts aceitos como dono do documento do cliente (CIMD), separados por vírgula. |

### Conectar

- **claude.ai / desktop**: Configurações → Conectores → Adicionar conector personalizado →
  `https://go.liff.tech/api/mcp`. Deixe os campos de OAuth em branco.
- **Claude Code**: `claude mcp add --transport http liff-tasks https://go.liff.tech/api/mcp`
  e depois `/mcp` para entrar.

O login é o Google de sempre. A tela de consentimento mostra quem pede, para onde o acesso
volta e o que a conexão poderá; **gravar é opção explícita**, desmarcada.

### Modelo de segurança

- O app é o próprio servidor OAuth 2.1 (`lib/oauth/`). Só Client ID Metadata Document, **sem
  registro dinâmico**: o `client_id` tem de ser `https` num host de `MCP_CLIENTES_PERMITIDOS`.
- PKCE S256 obrigatório; `redirect_uri` exato (ou loopback com qualquer porta, para o Claude
  Code); `resource` preso ao MCP; tokens opacos guardados só como SHA-256; acesso de 1 h,
  refresh de 30 dias com rotação, reuso de refresh ou de código revoga a concessão.
- **O token carrega a pessoa, não a permissão.** Cada chamada recalcula as áreas com o mesmo
  `Ctx` da interface: tirar uma área ou desativar a pessoa corta o MCP na hora.
- Grava só atividades e oportunidades, só onde a pessoa tem `edit`. **Nada é excluído** e
  nada de cadastro, permissão ou preferência é alcançável.
- 60 chamadas e 20 gravações por minuto por conexão. `Origin` alheia → 403.

### Rastreabilidade

- Gravação pelo MCP passa pelo mesmo núcleo da interface (`lib/ops/`) e entra no
  `audit_log` com `origem = 'mcp'` e a concessão; o histórico mostra "via Claude".
- **Toda** chamada, leitura inclusive, fica em `mcp_chamadas`, na mesma transação da
  gravação quando há uma.
- Autorizar e revogar também entram no `audit_log`. Cada pessoa vê e revoga as próprias
  conexões em **Conexões** (menu); a administração vê e revoga todas.

### Referências e vínculo tarefa ↔ oportunidade

Oportunidade é **C-0000** (comercial), tarefa é **T-0000**. Até nov/2026 eram D-104 e A-1012;
a conversão manteve o número, e a forma antiga continua aceita na URL (redireciona), no
histórico e no MCP. A tarefa pode ser ligada a uma oportunidade (campo Oportunidade no card,
ou `oportunidade: "C-0104"` pelo MCP). Linha de histórico da tarefa só cita a conta quando a
oportunidade é da mesma área — quem lê o histórico da tarefa pode não enxergar a venda.

### Teste de ponta a ponta local

`scripts/e2e-mcp-local.mjs` faz o papel do Claude Code contra app e banco **locais** (recusa
qualquer outro host). Com um Postgres descartável em memória:

```bash
npx @electric-sql/pglite-socket --db=memory:// --port=5433 --max-connections=10
PGMAX=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
  MCP_HABILITADO=1 MCP_URL_CANONICA=http://localhost:3010/api/mcp npm run dev -- -p 3010
E2E_BASE=http://localhost:3010 node scripts/e2e-mcp-local.mjs
```

O script imprime a URL de consentimento e espera o clique. **`PGMAX=1` é obrigatório com o
PGlite**: o multiplexador dele divide uma única sessão entre conexões, e consultas paralelas
com parâmetro se embaralham (o statement sem nome é um só por sessão). Postgres de verdade não
tem isso — é limitação do banco de teste, não do app.

## Deploy

Destino: **https://go.liff.tech**, no **AWS Amplify Hosting**, a partir do GitHub
(`andreleme-liff/liff-ops`, privado — o nome do repositório segue `liff-ops`, só o produto
mudou de nome). Saindo da Vercel.

### O impedimento a resolver primeiro

A documentação da Amplify diz, textualmente, que ela suporta apps "built with Next.js
versions up through Next.js 15", e que o compute "fully manages SSR for apps built with
Next.js versions 12 through 15". **Este app é Next.js 16.2.11.** Não há anúncio da AWS
adicionando a 16.

Isso não prova que não funciona — prova que é configuração não suportada. Então a ordem
importa: subir numa branch no Amplify e **confirmar que serve** antes de apontar DNS. O que
precisa passar nesse primeiro deploy:

1. o build termina (o adaptador de SSR aceita a saída do Next 16);
2. `GET /api/state` responde **401** e não 404 — 404 significa que subiu como estático e
   nenhuma rota de API existe;
3. o ciclo de login do Google fecha e a sessão persiste entre requests;
4. `POST`/`PATCH` gravam (é o que depende de Lambda com acesso ao pooler da Supabase).

Se o build recusar a 16, as saídas são: fixar o Next em 15 (downgrade com quebras próprias —
o `AGENTS.md` deste repo existe por causa delas), ou usar o Adapter API do Next 16 via
OpenNext, que é experimental. Nenhuma das duas é barata, e por isso o teste empírico vem
antes de qualquer trabalho de domínio.

### Recursos da Amplify que este app NÃO usa

Confirmado contra a lista de não suportados: não há `middleware.ts`, não há ISR sob demanda,
não há `unstable_after`. Next.js streaming aparece como não suportado — o app é um shell
cliente que busca `/api/state`, então não depende de streaming, mas é o item a observar se
alguma página começar a renderizar em partes.

### O que já está no repositório

`amplify.yml` com a plataforma de compute. O build roda `tsc --noEmit`, `eslint` e
`scripts/verificar-contrato.mjs` **antes** do `next build`: deploy que sobe com tipo quebrado
é pior que deploy que não sobe, porque o erro aparece no request de um usuário.

### O que precisa ser feito no console — não dá para fazer daqui

1. **Criar o app no Amplify** ligado ao GitHub, branch `main`, e garantir que a plataforma é
   **WEB_COMPUTE**, não WEB. Em WEB o app carrega a tela e todo `/api` devolve 404.
2. **Variáveis de ambiente**, no app do Amplify: `DATABASE_URL` (Transaction Pooler, porta
   6543), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAIL`, `SEED_DEMO=0`.
3. **Domínio**: `go.liff.tech` em Amplify → Domain management. Ele emite o certificado e
   pede um registro de validação.
4. **DNS no Cloudflare**: criar o CNAME que o Amplify indicar, com o proxy **desligado**
   (nuvem cinza). Com o proxy laranja a validação do certificado não fecha — é o erro mais
   comum nessa combinação. O proxy pode ser religado depois que o domínio ficar ativo.
5. **Google Cloud Console**, no mesmo OAuth client: adicionar
   `https://go.liff.tech/api/auth/google/callback` como Authorized redirect URI, e
   `https://go.liff.tech` como Authorized JavaScript origin. O código monta o redirect a
   partir do `origin` do request, então nada muda no app — mas o Google exige a URI exata
   registrada, e sem isso o login devolve `redirect_uri_mismatch`.

### Efeitos da troca de domínio

- **Todos perdem a sessão** e entram de novo. O cookie está no domínio antigo.
- **O `localStorage` zera** — origem nova. Tema e filtros voltam de `users.preferencias`, no
  banco, no primeiro login. Foi para isso que a preferência saiu do navegador.
- A URL da Vercel continua de pé até você desligar. Não desligue antes do passo 5 funcionar.

### Um ponto a observar em Lambda

A migração roda dentro do `getDb()`, em todo cold start: são cerca de 40 idas ao Postgres
antes do primeiro request completar. Na Vercel isso já acontece e passa, mas cold start é
mais frequente em Lambda. Se o primeiro acesso ficar lento depois da migração, o caminho é
gatear a migração por uma versão de esquema gravada numa tabela, em vez de reexecutar os
`ALTER ... IF NOT EXISTS` toda vez.

### Histórico: a Vercel

Durante um tempo todo deployment depois do primeiro travou em `UNKNOWN`, sem construir e sem
logs, e a Vercel recusava promovê-lo (`422 ... is not ready`). A causa era o **e-mail do autor
do commit**: os commits saíram com um endereço que a Vercel não reconhece como membro do time,
e ela não constrói commit de autor desconhecido. Corrigido reescrevendo a autoria para
`leme@getliff.ai`.

O time tem **Deployment Protection**: as URLs por deployment respondem 302 para o SSO da
Vercel e só abrem logado. Só o domínio de produção era público. Isso era esperado.
