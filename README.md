# LIFF Ops — sistema de gestão de atividades

Implementação do design `Sistema LIFF.dc.html` (projeto Claude Design
`bc1e3d7a-45c7-4125-a2ce-281f6f74e0e3`) como aplicação estática real.

Site estático puro: React 18 via CDN, sem build, sem bundler. Abrir `index.html`
por um servidor HTTP já roda tudo.

```bash
python3 -m http.server 4173
```

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

**Acesso.** Tela de SSO (protótipo) com quatro contas `@liff.com.br`. A conta
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
