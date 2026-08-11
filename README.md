# LIFF Ops — sistema de gestão de atividades

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
verticais somem no branco, então cada área sobe para o Core (Labs usa o Dark, porque seu Core
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

## Deploy

Produção: **https://liff-ops.vercel.app** (projeto `liff-ops`, time `liff-ai`).
Repositório: `andreleme-liff/liff-ops`, privado.

Durante um tempo todo deployment depois do primeiro travou em `UNKNOWN`, sem construir e sem
logs, e a Vercel recusava promovê-lo (`422 ... is not ready`). A causa era o **e-mail do autor
do commit**: os commits saíram com um endereço que a Vercel não reconhece como membro do time,
e ela não constrói commit de autor desconhecido. Corrigido reescrevendo a autoria para
`leme@getliff.ai` — os `git config` do repositório já estavam certos, bastava não sobrescrevê-los
na hora de commitar.

Separadamente, o time tem **Deployment Protection**: as URLs por deployment
(`liff-<hash>-liff-ai.vercel.app`, `liff-ops-git-<branch>-liff-ai.vercel.app`) respondem 302
para o SSO da Vercel e só abrem logado. Só o domínio de produção é público. Isso é esperado.

O projeto na Vercel nasceu como site estático, então `vercel.json` declara
`"framework": "nextjs"` — sem isso o build termina bem mas falha em
`No Output Directory named "public" found`.

Falta, antes de promover esta branch a produção: definir `DATABASE_URL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` e `ADMIN_EMAIL` no projeto da Vercel (hoje não há **nenhuma** variável
definida lá) e cadastrar o redirect URI de produção no Google Cloud Console.
