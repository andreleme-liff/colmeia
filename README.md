# LIFF Ops — sistema de gestão de atividades

Implementação do design `Sistema LIFF.dc.html` (projeto Claude Design
`bc1e3d7a-45c7-4125-a2ce-281f6f74e0e3`) como aplicação estática real.

Site estático puro: React 18 via CDN, sem build, sem bundler. Abrir `index.html`
por um servidor HTTP já roda tudo.

```bash
python3 -m http.server 4173
```

## Deploy

Produção: **https://liff-ops.vercel.app** (projeto `liff-ops`, time `liff-ai`).
Repositório: `andreleme-liff/liff-ops`, privado.

O repositório está conectado ao projeto e o push na `main` cria deployment,
mas **o domínio de produção não está sendo atualizado**. Todo deployment depois
do primeiro fica travado em `UNKNOWN` (nunca chega a `READY`), e por isso a
Vercel recusa promovê-lo:

```
Error: The provided deploymentId (...) is not ready and cannot be promoted. (422)
Error: The deployment https://... is not ready.
```

Não é erro de build — o projeto é estático, o build é `. [0ms]`, o `vercel.json`
é lido (as rotas aparecem no `inspect`) e o deployment até responde. Ele
simplesmente não sai desse estado, o que aponta para algo do lado da conta
(fila, cota ou limite do time) e precisa ser visto no dashboard da Vercel.

Enquanto isso, `liff-ops.vercel.app` continua servindo o **primeiro** deployment.
Para conferir o que está no ar, não confie no status do CLI — compare o conteúdo:

```bash
curl -s https://liff-ops.vercel.app/app.js | md5
```

O time também tem **Deployment Protection** ligada: as URLs por deployment
(`liff-<hash>-liff-ai.vercel.app`, `liff-ops-git-main-liff-ai.vercel.app`)
respondem 302 para o SSO da Vercel. Só o domínio de produção é público.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Shell: carrega o design system, o React e o app |
| `app.js` | Telas e regras (permissão, log, pipeline, kanban, resumo) |
| `data.js` | Constantes de domínio e carga inicial de dados |
| `app.css` | Layout, hover e breakpoints — o que não cabe em estilo inline |
| `_ds/liff-design-system-.../` | Design system LIFF, cópia intocada do projeto |

O design system é consumido como veio: `styles.css` importa os tokens
(`fonts`, `colors`, `typography`, `spacing`, `base`) e `_ds_bundle.js` expõe os
componentes React em `window.LIFFDesignSystem_064c9d`. Deste app são usados
`LiffMark`, `Button`, `Field`, `Input`, `Select` e `Switch`. Nenhum HEX é
escrito à mão fora dos tokens — `app.js` referencia `var(--liff-*)`.

## O que o sistema faz

**Acesso.** Tela de SSO (protótipo) com quatro contas `@getliff.ai`. A conta
escolhida define o que se vê e o que se edita.

**Permissão por área.** Cada usuário tem, por vertical (Law Firms, Corporate,
Public Sector, Tax, Labs, Social), um de três níveis: sem acesso, ver ou
editar. `Admin` tem edição em tudo. A permissão filtra listas, contadores,
chips de área, o log e a própria navegação — `administração` só aparece para
Admin.

**Visão geral.** KPIs do escopo do usuário, carga por área e as últimas
alterações.

**Comercial.** Pipeline em cinco estágios; as setas movem a oportunidade e só
funcionam em áreas com permissão de edição.

**Operações.** Kanban por status com arrastar e soltar (HTML5). Cards de áreas
sem permissão de edição não são arrastáveis — e a checagem se repete no `drop`,
então forçar o evento também não passa.

**Atividades.** Tabela plana do escopo; prazos críticos em vermelho. Clicar
abre o painel lateral com status, responsável, prioridade e o log daquela
atividade. Sem permissão de edição, o painel fica somente leitura com o aviso
correspondente.

**Cadastros.** Contas, pessoas, áreas e tipos, com o formulário de novo
registro montado com os primitivos de formulário do design system.

**Administração.** Matriz usuário × área; clicar em uma célula alterna
sem acesso → ver → editar. Linhas de Admin não são editáveis.

**Auditoria.** Todo movimento de card, mudança de status, troca de responsável
ou prioridade, avanço de estágio e alteração de permissão vira registro com
autor, horário, entidade e o que mudou.

**Resumo p/ WhatsApp.** Gera o texto de status (geral ou por área) já formatado
e copia para a área de transferência.

**Fundo escuro ou claro.** Seletor no rodapé da barra lateral (e na tela de
acesso). A escolha fica em `localStorage`; sem escolha, segue o
`prefers-color-scheme` do sistema. Um script inline no `index.html` aplica o
tema antes do primeiro paint para a página não piscar.

## Como o tema claro funciona

O design system LIFF é dark-first e não define um tema claro. O escuro aqui é
ele, intocado. O claro vive em `app.css` e reescreve **só os aliases
semânticos** (`--liff-canvas`, `--liff-surface*`, `--liff-text*`, `--liff-border`),
derivando cada tom por mistura das cores da marca — Floral White, Dust Grey,
Charcoal, Obsidiana. Nenhum HEX novo entra no sistema; `app.js` e `data.js` não
têm um HEX sequer.

Três pontos que não eram simples inversão de fundo:

- **Charcoal fazia dois papéis.** No escuro ele é a hairline *e* o texto mais
  apagado. No claro os dois precisam ir para lados opostos, então a hairline
  virou `--liff-border` e o texto apagado, `--liff-app-ghost`.
- **As cores de estado foram calibradas para o canvas escuro.** Success e
  Warning não têm contraste sobre Floral White. Existe uma variante de texto
  por estado (`--liff-app-*-ink`) que escurece por mistura com Obsidiana — o
  matiz é o mesmo. Os tokens originais seguem valendo para preenchimentos.
- **Os tons Mid das verticais somem sobre branco.** No claro cada área sobe
  para o Core da sua cascata. Labs é a exceção: seu Core é um teal luminoso
  que também não segura, então usa o Dark.

Duas concessões aos componentes do kit, que só existem para o canvas escuro:
o variant `ghost` do `Button` recebe um `style` corrigindo a cor, e
`Field`/`Input`/`Select` levam um patch com `!important` em `app.css`. O bundle
do design system continua sem uma linha alterada.

## Estado atual e limites

- Dados moram em memória (`data.js`); recarregar a página zera tudo. Nenhuma
  chamada de rede além das fontes do Google e do React na CDN.
- O login não é SSO de verdade — é a escolha de um perfil, como no design.
- Duas coisas estão desenhadas como display-only e ficaram assim:
  o switch **ATIVO** da administração não altera o usuário, e **cadastrar**
  não grava registro.
- Os prazos "críticos" são uma lista fixa de datas (`CRITICAL_DUE`), não um
  cálculo sobre a data de hoje.
- O design foi feito para 1440×900. Os breakpoints em `app.css` são adição
  desta implementação e não mudam a aparência em desktop.
