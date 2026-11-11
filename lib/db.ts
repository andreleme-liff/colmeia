// Camada de banco (Postgres via Supabase), usando o driver `postgres` — o mesmo padrão do
// mini-todos: funciona bem com o Transaction Pooler via `prepare: false`.
// Migração idempotente no primeiro acesso + seed do conjunto de demonstração.

import postgres from "postgres";
import {
  BLOCKER_TIPO_KEYS, MOTIVO_PERDA_KEYS, ORIGENS_INICIAIS, PAPEIS, PRIORIDADES, STAGE_KEYS, STATUS_KEYS,
  hojeISO, refCanonica, separarDataDaSituacao, slugificar,
} from "./domain";
import { ARQUETIPOS_SEMENTE, PROGRAMAS_SEMENTE } from "./funding";

export type Db = ReturnType<typeof postgres>;

/** Aceita tanto o client normal quanto o de dentro de uma transação — o que basta para
 *  quem só executa queries (a migração, o seed, o log de auditoria). */
export type Queryable = Db | postgres.TransactionSql<Record<string, never>>;

let _sql: Db | null = null;
let _migrated: Promise<void> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_URL não configurada. Defina a connection string do Supabase (Settings → Database → Connection string)."
    );
  }
  return url;
}

/** De qual variável veio a string — útil quando a integração da Supabase injeta várias. */
function origemDaConexao(): string {
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  if (process.env.POSTGRES_URL) return "POSTGRES_URL";
  return "POSTGRES_URL_NON_POOLING";
}

function ehLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

function rawSql(): Db {
  if (_sql) return _sql;
  const url = connectionString();

  // Registra host, porta e origem — nunca usuário ou senha. Sem isto não dá para saber, a
  // partir dos logs, se a app está falando com o pooler ou com a conexão direta: a
  // integração da Supabase injeta as duas, e as duas funcionam (a direta só até esgotar
  // conexões sob carga, que é o modo de falha caro de descobrir em produção).
  try {
    const u = new URL(url);
    const pooled = u.hostname.includes("pooler.supabase.com");
    console.log(
      `[db] ${origemDaConexao()} → ${u.hostname}:${u.port || "5432"} (${pooled ? "pooler" : "conexão direta"})`
    );
  } catch {
    console.log(`[db] ${origemDaConexao()} → string não parseável`);
  }

  _sql = postgres(url, {
    // TLS obrigatório para qualquer host de rede. A exceção é só loopback: um Postgres
    // descartável na própria máquina (o teste de ponta a ponta local) não fala TLS, e o
    // tráfego nunca sai do computador.
    ssl: ehLoopback(url) ? false : "require",
    prepare: false, // compatível com o Transaction Pooler (pgbouncer) da Supabase
  });
  return _sql;
}

/** ISO 8601 com sufixo Z. */
export function nowIso(): string {
  return new Date().toISOString();
}

// As listas de valores válidos vivem em domain.ts; os CHECKs abaixo são gerados a partir
// delas para o banco e o app nunca discordarem sobre o que é um status válido.
const inList = (vals: readonly string[]) => vals.map((v) => `'${v}'`).join(",");

/** Identifica esta migração no espaço de advisory locks do Postgres. Valor arbitrário, fixo. */
const MIGRATION_LOCK = 811020261;

/**
 * Semente do cadastro de áreas. São os valores da cascata de cada produto no design system
 * — o tom Mid, exceto Labs, cujo Core é o que segura sobre os dois fundos. Ficam aqui como
 * HEX porque a partir da primeira subida viram DADO editável, não mais token de código: o
 * cliente os transforma em variáveis CSS, e o tema claro deriva a variante escurecida.
 */
const AREAS_SEMENTE = [
  { id: "law-firms", label: "Law Firms", short: "LAW", cor: "#4B6B9B" },
  { id: "corporate", label: "Corporate", short: "CORP", cor: "#8B6FA8" },
  { id: "public-sector", label: "Public Sector", short: "PUB", cor: "#809A6A" },
  { id: "tax", label: "Tax", short: "TAX", cor: "#C4774C" },
  { id: "labs", label: "Labs", short: "LABS", cor: "#00A3B5" },
  { id: "social", label: "Social", short: "SOC", cor: "#D38A9A" },
];

/**
 * A migração roda no primeiro acesso ao banco, dentro de UMA transação protegida por
 * advisory lock.
 *
 * O lock não é luxo: em serverless vários cold starts sobem ao mesmo tempo e
 * `CREATE TABLE IF NOT EXISTS` não é atômico contra um criador concorrente — dois processos
 * simultâneos conseguem produzir "relation already exists" ou violar
 * `pg_type_typname_nsp_index`. O seed tinha a mesma corrida: dois processos liam
 * `COUNT(*) = 0` e ambos inseriam.
 *
 * É `pg_advisory_xact_lock` e não o de sessão de propósito: o lock de transação morre no
 * commit, que é o único comportamento compatível com o Transaction Pooler da Supabase
 * (no modo transaction a conexão volta para o pool a cada commit, e um lock de sessão
 * ficaria preso numa conexão que não é mais nossa).
 */
async function migrate(): Promise<void> {
  await rawSql().begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;

    // Cadastro dos produtos. Vem primeiro porque as demais tabelas apontam para ela: o
    // conjunto de áreas é aberto, e quem garante que um registro não aponte para área
    // inexistente é a chave estrangeira, não uma lista fixa no código.
    //
    // A semente entra SÓ quando a tabela nasce. Antes ela rodava a cada partida a frio com
    // `ON CONFLICT DO NOTHING`, e isso recriava toda área da semente que a administração
    // tivesse excluído — a exclusão "voltava" na próxima vez que o servidor subia.
    const [{ areasNova }] = await sql<{ areasNova: boolean }[]>`
      SELECT to_regclass('public.areas') IS NULL AS "areasNova"
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS areas (
        id     TEXT PRIMARY KEY,
        label  TEXT NOT NULL,
        short  TEXT NOT NULL,
        cor    TEXT NOT NULL,
        ordem  INTEGER NOT NULL DEFAULT 0,
        planilha_url TEXT
      )
    `;
    if (areasNova) {
      for (const [i, a] of AREAS_SEMENTE.entries()) {
        await sql`
          INSERT INTO areas (id, label, short, cor, ordem)
          VALUES (${a.id}, ${a.label}, ${a.short}, ${a.cor}, ${i})
          ON CONFLICT (id) DO NOTHING
        `;
      }
    }

    // Módulo é o que se vende dentro de um produto — "Regtrack Farma" dentro de
    // Regulatório. Vale para oportunidade E para atividade: o mesmo produto classifica a
    // venda e o trabalho de implantação que vem depois dela.
    await sql`
      CREATE TABLE IF NOT EXISTS produtos (
        id     TEXT PRIMARY KEY,
        label  TEXT NOT NULL,
        area   TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        ativo  BOOLEAN NOT NULL DEFAULT true,
        ordem  INTEGER NOT NULL DEFAULT 0
      )
    `;

    await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      nome        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      papel       TEXT NOT NULL DEFAULT 'membro' CHECK (papel IN (${inList(PAPEIS)})),
      iniciais    TEXT NOT NULL DEFAULT '',
      ativo       BOOLEAN NOT NULL DEFAULT true,
      google_sub  TEXT,
      avatar_url  TEXT,
      -- Escolhas da pessoa que devem sobreviver ao logout e valer em qualquer máquina:
      -- tema e filtro de produto. JSONB para não precisar de migração a cada preferência
      -- nova; quem valida as chaves é a rota, que ignora o que não conhece.
      preferencias JSONB NOT NULL DEFAULT '{}'::jsonb,
      -- Refresh token do Google, concedido SÓ por quem clicou em sincronizar planilha — o
      -- login não pede esse escopo. Fica em claro pelo mesmo motivo que o token de sessão:
      -- o banco não é alcançável pela API pública (ver o REVOKE no fim desta migração) e o
      -- app só fala com ele pelo servidor.
      google_refresh_token TEXT,
      criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    `);

    // Ausência de linha = sem acesso. É a matriz da tela de administração.
    await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS user_area_perms (
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      area     TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      nivel    TEXT NOT NULL CHECK (nivel IN ('view','edit')),
      PRIMARY KEY (user_id, area)
    )
    `);

    await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS activities (
      id                  SERIAL PRIMARY KEY,
      ref                 TEXT NOT NULL UNIQUE,
      titulo              TEXT NOT NULL,
      area                TEXT NOT NULL REFERENCES areas(id),
      -- Aposentada, não removida. Era um rótulo (Operacional/Comercial/Produto/Institucional)
      -- escolhido na criação, que o PATCH nunca aceitou alterar e que não governava nada:
      -- não filtrava, não roteava, não definia coluna de quadro. Saiu da interface e da API.
      -- A coluna fica, com default, para o que já foi classificado não se perder e para o
      -- caminho de volta ser barato caso a classificação ganhe uma função de verdade.
      tipo                TEXT NOT NULL DEFAULT 'Operacional',
      status              TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN (${inList(STATUS_KEYS)})),
      responsavel_user_id INTEGER REFERENCES users(id),
      prazo               DATE,
      prioridade          TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN (${inList(PRIORIDADES)})),
      situacao            TEXT NOT NULL DEFAULT '',
      proximo_passo       TEXT NOT NULL DEFAULT '',
      -- Quando o próximo passo acontece. Nulo é comum e não é erro: quem escreveu o passo
      -- nem sempre sabe a data. O cronograma trata nulo como fim da semana corrente.
      proximo_passo_em    DATE,
      produto_id          TEXT REFERENCES produtos(id) ON DELETE SET NULL,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em       TIMESTAMPTZ
    )
    `);

    await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS deals (
      id                  SERIAL PRIMARY KEY,
      ref                 TEXT NOT NULL UNIQUE,
      conta               TEXT NOT NULL,
      escopo              TEXT NOT NULL DEFAULT '',
      area                TEXT NOT NULL REFERENCES areas(id),
      estagio             TEXT NOT NULL DEFAULT 'prospeccao' CHECK (estagio IN (${inList(STAGE_KEYS)})),
      valor_centavos      BIGINT NOT NULL DEFAULT 0,
      responsavel_user_id INTEGER REFERENCES users(id),
      proximo_passo       TEXT NOT NULL DEFAULT '',
      situacao            TEXT NOT NULL DEFAULT '',
      proximo_passo_em    DATE,
      contato             TEXT NOT NULL DEFAULT '',
      responsavel_texto   TEXT NOT NULL DEFAULT '',
      produto_id          TEXT REFERENCES produtos(id) ON DELETE SET NULL,
      pausado             BOOLEAN NOT NULL DEFAULT false,
      -- Oportunidade já registrada no ACE do AWS Partner Central. Vive aqui e não numa
      -- integração porque o registro é feito à mão no portal da AWS: o sistema só precisa
      -- lembrar quem já foi, para ninguém registrar duas vezes nem esquecer de registrar.
      ace_aws             BOOLEAN NOT NULL DEFAULT false,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em       TIMESTAMPTZ
    )
    `);

    await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    )
    `;

    // Log append-only: quem, quando, o quê, e o par valor anterior/novo — exatamente o que a
    // tela de administração promete guardar. Nada aqui é atualizado ou apagado pelo app.
    await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id             SERIAL PRIMARY KEY,
      actor_user_id  INTEGER REFERENCES users(id),
      area           TEXT,
      entidade       TEXT NOT NULL,
      campo          TEXT,
      valor_anterior TEXT,
      valor_novo     TEXT,
      texto          TEXT NOT NULL,
      criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    `);

      // Bases criadas antes de o conjunto de áreas virar aberto têm CHECK com a lista fixa
    // dos seis produtos — o que impediria cadastrar o sétimo. Aqui o CHECK sai e a chave
    // estrangeira entra. Em base nova os DROPs não encontram nada e os IFs não disparam.
    await sql.unsafe(`
      DO $$
      BEGIN
        ALTER TABLE user_area_perms DROP CONSTRAINT IF EXISTS user_area_perms_area_check;
        ALTER TABLE activities      DROP CONSTRAINT IF EXISTS activities_area_check;
        ALTER TABLE deals           DROP CONSTRAINT IF EXISTS deals_area_check;
        ALTER TABLE audit_log       DROP CONSTRAINT IF EXISTS audit_log_area_check;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_area_perms_area_fkey') THEN
          ALTER TABLE user_area_perms
            ADD CONSTRAINT user_area_perms_area_fkey
            FOREIGN KEY (area) REFERENCES areas(id) ON DELETE CASCADE;
        END IF;

        -- Sem CASCADE de propósito: excluir um produto que ainda tem atividade ou
        -- oportunidade deve falhar, não apagar o trabalho junto.
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_area_fkey') THEN
          ALTER TABLE activities ADD CONSTRAINT activities_area_fkey FOREIGN KEY (area) REFERENCES areas(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_area_fkey') THEN
          ALTER TABLE deals ADD CONSTRAINT deals_area_fkey FOREIGN KEY (area) REFERENCES areas(id);
        END IF;
      END $$;
    `);

    // Colunas que nasceram depois: em base já criada o CREATE acima não as acrescenta.
    // `situacao` é a narrativa de onde a conversa está — o que a planilha guardava numa
    // célula só, misturada com histórico. Aqui o histórico fica no audit_log e a coluna
    // guarda apenas o estado atual.
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS contato TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS responsavel_texto TEXT NOT NULL DEFAULT ''`;
    // Estado paralelo ao estágio: "não é o momento" não é uma casa do funil, e sem isto a
    // oportunidade fica parada num estágio que mente sobre ela.
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS pausado BOOLEAN NOT NULL DEFAULT false`;
    // As mesmas duas colunas da oportunidade, agora na atividade: o quadro operacional tinha
    // título, responsável e prazo, mas nenhum lugar para "onde isto está" e "o que vem
    // depois" — que é justamente o que se pergunta olhando um card.
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_refresh_token TEXT`;
    // Planilha do Drive de onde o produto sincroniza. Fica na área e não numa configuração
    // global porque cada produto tem a sua, e o botão só aparece onde há uma.
    await sql`ALTER TABLE areas ADD COLUMN IF NOT EXISTS planilha_url TEXT`;
    await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS proximo_passo TEXT NOT NULL DEFAULT ''`;
    // Produto deixa de ser só de oportunidade: "Regtrack Farma" classifica tanto a venda
    // quanto o trabalho de implantação. ON DELETE SET NULL como em deals — perder a
    // classificação é recuperável, perder a atividade não seria.
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='produto_id'
        ) THEN
          ALTER TABLE activities ADD COLUMN produto_id TEXT REFERENCES produtos(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await sql`CREATE INDEX IF NOT EXISTS idx_activities_produto ON activities(produto_id)`;
    // A data do próximo passo é o que o cronograma ordena. Nas duas tabelas, porque ele
    // mistura oportunidade e atividade na mesma linha do tempo.
    await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS proximo_passo_em DATE`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS proximo_passo_em DATE`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS ace_aws BOOLEAN NOT NULL DEFAULT false`;
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='produto_id'
        ) THEN
          ALTER TABLE deals ADD COLUMN produto_id TEXT REFERENCES produtos(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_produto ON deals(produto_id)`;

    await reiniciarPipeline(sql);

    /**
     * Os CHECK de lista fechada são gerados a partir de domain.ts no CREATE TABLE — mas o
     * CREATE não roda de novo em base existente. Sem isto, acrescentar um valor à lista
     * (foi o caso de `validacao` no funil) passa no build, passa no tipo, e só falha na
     * primeira gravação em produção, com erro de constraint.
     *
     * Aqui o CHECK é comparado com a lista atual e recriado quando falta algum valor. Só o
     * DROP/ADD é caro (revalida a tabela), e ele só acontece quando de fato mudou.
     */
    for (const [tabela, coluna, valores] of [
      ["deals", "estagio", STAGE_KEYS],
      ["activities", "status", STATUS_KEYS],
      ["activities", "prioridade", PRIORIDADES as readonly string[]],
    ] as const) {
      const nome = `${tabela}_${coluna}_check`;
      const [atual] = await sql<{ def: string }[]>`
        SELECT pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = ${tabela}::regclass AND conname = ${nome}
      `;
      // Compara por valor presente e não por texto: o Postgres reescreve o CHECK na forma
      // canônica (`= ANY (ARRAY[...])`), que nunca bateria com a string que mandamos.
      if (atual && valores.every((v) => atual.def.includes(`'${v}'`))) continue;
      await sql.unsafe(`ALTER TABLE ${tabela} DROP CONSTRAINT IF EXISTS ${nome}`);
      await sql.unsafe(
        `ALTER TABLE ${tabela} ADD CONSTRAINT ${nome} CHECK (${coluna} IN (${inList(valores)}))`
      );
      console.log(`[db] CHECK ${nome} recriado com ${valores.length} valores`);
    }

    // Refs legíveis para registros novos (hoje C-0000 e T-0000, ver converterReferencias).
    // Começam acima das semeadas (A-101…A-602,
    // D-01…D-08) para nunca colidir com elas.
    await sql`CREATE SEQUENCE IF NOT EXISTS activities_ref_seq START 1000`;
    await sql`CREATE SEQUENCE IF NOT EXISTS deals_ref_seq START 100`;

    await sql`CREATE INDEX IF NOT EXISTS idx_activities_area ON activities(area, status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_area ON deals(area, estagio)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_recente ON audit_log(criado_em DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_perms_user ON user_area_perms(user_id)`;

    // A oportunidade comercial a que uma tarefa serve — o elo entre o pipeline e o quadro
    // operacional. Opcional. SET NULL na exclusão da oportunidade: a tarefa continua; quem
    // registra a perda do vínculo é a rota de exclusão, na mesma transação.
    await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS oportunidade_id INTEGER REFERENCES deals(id) ON DELETE SET NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activities_oportunidade ON activities(oportunidade_id)`;

    // ---- Card comercial v2 (nov/2026): os campos da planilha do LIFF Tax ----
    //
    // Origem é CADASTRO, não lista no código: parceiro e canal novos aparecem o tempo todo, e
    // quem administra cadastra sem esperar deploy. A semente só entra com a tabela vazia —
    // uma origem apagada pela administração não volta sozinha.
    await sql`
      CREATE TABLE IF NOT EXISTS origens (
        id    TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        ordem INTEGER NOT NULL DEFAULT 0,
        ativo BOOLEAN NOT NULL DEFAULT true
      )
    `;
    const [{ n: qtdOrigens }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM origens`;
    if (!qtdOrigens) {
      for (const [i, label] of ORIGENS_INICIAIS.entries()) {
        await sql`INSERT INTO origens (id, label, ordem) VALUES (${slugificar(label)}, ${label}, ${i}) ON CONFLICT DO NOTHING`;
      }
    }
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS origem_id TEXT REFERENCES origens(id) ON DELETE SET NULL`;
    // `contato` continua existindo e passa a ser "Contato / sponsor" — quem decide no cliente.
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS ponte TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS contato_operacional TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS dor TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS erp TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS ultima_interacao DATE`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS blocker TEXT NOT NULL DEFAULT ''`;
    await sql.unsafe(
      `ALTER TABLE deals ADD COLUMN IF NOT EXISTS blocker_tipo TEXT CHECK (blocker_tipo IN (${inList(BLOCKER_TIPO_KEYS)}))`
    );
    // Quem, do lado da LIFF, resolve o blocker. Na planilha, "Dono interno LIFF" só aparece
    // junto de um blocker — não é um segundo dono da oportunidade.
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS blocker_dono_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
    await sql.unsafe(
      `ALTER TABLE deals ADD COLUMN IF NOT EXISTS motivo_perda TEXT CHECK (motivo_perda IN (${inList(MOTIVO_PERDA_KEYS)}))`
    );
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS motivo_perda_detalhe TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS notas TEXT NOT NULL DEFAULT ''`;
    // Pessoa excluída do cadastro. A linha NÃO some: `audit_log.actor_user_id` aponta para ela,
    // e o histórico precisa continuar dizendo quem fez o quê. Excluída = sem acesso, sem
    // permissões, fora de todo seletor e de toda lista — só o nome sobrevive no histórico.
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ`;

    // Data da situação atual: o card mostra "SITUAÇÃO · 19/OUT". Gravada pelo núcleo toda vez
    // que a situação muda. As que vieram antes disso (planilha importada) traziam a data no
    // começo do texto ("19/Out: …"): ela sai do texto e vem para cá. Sem data no texto, vale a
    // última alteração da situação no histórico, ou a criação do card. Idempotente: só toca
    // quem ainda não tem data.
    await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS situacao_em DATE`;
    const semData = await sql<{ id: number; situacao: string; em: Date }[]>`
      SELECT d.id, d.situacao,
             COALESCE((SELECT max(a.criado_em) FROM audit_log a WHERE a.entidade = d.ref AND a.campo IN ('situacao', 'criacao')), d.criado_em) AS em
      FROM deals d WHERE d.situacao_em IS NULL AND d.situacao <> ''
    `;
    const hoje = hojeISO();
    let tirouDoTexto = 0;
    for (const d of semData) {
      if (separarDataDaSituacao(d.situacao, hoje).data) tirouDoTexto++;
      const { data, texto } = separarDataDaSituacao(d.situacao, hoje);
      await sql`
        UPDATE deals SET situacao_em = ${data ?? hojeISO(new Date(d.em))}, situacao = ${data ? texto : d.situacao}
        WHERE id = ${d.id}
      `;
    }
    // O texto de alguns cards mudou (perdeu o prefixo de data) sem passar pelo núcleo: uma linha
    // de auditoria diz quando e quantos, para ninguém estranhar a diferença.
    if (tirouDoTexto) {
      await sql`
        INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
        VALUES (NULL, NULL, 'migracao', 'situacao_em', NULL, ${String(tirouDoTexto)},
                ${`Data da situação tirada do começo do texto e gravada à parte em ${tirouDoTexto} oportunidade(s)`})
      `;
    }

    // Módulos de interesse: vários por oportunidade, cada um um produto da área. Tabela de
    // ligação com chave estrangeira dos dois lados — produto excluído sai das oportunidades
    // em vez de deixar um id órfão numa lista.
    await sql`
      CREATE TABLE IF NOT EXISTS oportunidade_modulos (
        deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        produto_id TEXT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        PRIMARY KEY (deal_id, produto_id)
      )
    `;

    // ---- Acesso por sistemas externos (MCP + OAuth 2.1) ----
    //
    // De onde veio cada escrita. Nulo é a interface, como sempre foi. Sem chave estrangeira
    // para a concessão, pelo mesmo motivo de `entidade`: revogar a conexão não pode apagar o
    // rastro do que ela fez.
    await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS origem TEXT`;
    await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS concessao_id INTEGER`;

    // Uma concessão é "esta pessoa autorizou este cliente (o Claude no claude.ai, o Claude
    // Code) a agir em nome dela, com estes escopos". O token não carrega permissão: carrega a
    // pessoa, e a permissão por área é recalculada a cada chamada. Revogar = marcar aqui.
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_concessoes (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id        TEXT NOT NULL,
        client_nome      TEXT NOT NULL,
        redirect_uri     TEXT NOT NULL,
        resource         TEXT NOT NULL,
        escopos          TEXT NOT NULL,
        criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
        ultimo_uso_em    TIMESTAMPTZ,
        revogado_em      TIMESTAMPTZ,
        revogado_por     INTEGER REFERENCES users(id),
        motivo_revogacao TEXT
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_concessoes_user ON oauth_concessoes(user_id)`;

    // Códigos de autorização e tokens guardam SÓ o hash SHA-256. O valor em claro existe uma
    // vez, na resposta ao cliente; um vazamento desta tabela não dá acesso a nada.
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_codigos (
        hash           TEXT PRIMARY KEY,
        concessao_id   INTEGER NOT NULL REFERENCES oauth_concessoes(id) ON DELETE CASCADE,
        code_challenge TEXT NOT NULL,
        redirect_uri   TEXT NOT NULL,
        expira_em      TIMESTAMPTZ NOT NULL,
        usado_em       TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        hash         TEXT PRIMARY KEY,
        concessao_id INTEGER NOT NULL REFERENCES oauth_concessoes(id) ON DELETE CASCADE,
        tipo         TEXT NOT NULL CHECK (tipo IN ('acesso','refresh')),
        expira_em    TIMESTAMPTZ NOT NULL,
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Refresh já trocado por um novo. Reaparecer depois disso é sinal de roubo, e a
        -- concessão inteira cai (rotação com detecção de reuso, OAuth 2.1 §4.3.1).
        usado_em     TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_tokens_concessao ON oauth_tokens(concessao_id)`;

    // Toda chamada de ferramenta, leitura inclusive — é o que responde "o que o Claude leu
    // da carteira e quando". Append-only, como audit_log, e sem chave estrangeira pelo mesmo
    // motivo. A gravação feita pela chamada entra na MESMA transação que esta linha.
    await sql`
      CREATE TABLE IF NOT EXISTS mcp_chamadas (
        id                 BIGSERIAL PRIMARY KEY,
        concessao_id       INTEGER NOT NULL,
        user_id            INTEGER NOT NULL,
        ferramenta         TEXT NOT NULL,
        argumentos         JSONB NOT NULL DEFAULT '{}'::jsonb,
        escrita            BOOLEAN NOT NULL DEFAULT false,
        ok                 BOOLEAN NOT NULL,
        erro               TEXT,
        ref                TEXT,
        chave_idempotencia TEXT,
        duracao_ms         INTEGER,
        criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_chamadas_recente ON mcp_chamadas(concessao_id, criado_em DESC)`;
    // Repetir uma criação com a mesma chave devolve o registro já criado: o cliente reenvia
    // depois de um timeout e a oportunidade não pode nascer duas vezes.
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chamadas_idempotencia
      ON mcp_chamadas(concessao_id, chave_idempotencia)
      WHERE chave_idempotencia IS NOT NULL AND ok
    `;

    // Forecast de receita (nov/2026, só admin por enquanto). Um contrato por cliente, com
    // até três linhas: customização e implantação (total em N parcelas) e assinatura
    // (valor mensal). O cronograma de parcelas sai daqui, e no futuro vira o faturamento.
    // `deal_id` liga ao card do pipeline: excluir o card não apaga a receita (SET NULL), e
    // um card tem no máximo um contrato.
    await sql`
      CREATE TABLE IF NOT EXISTS contratos (
        id                 SERIAL PRIMARY KEY,
        ref                TEXT UNIQUE,
        deal_id            INTEGER UNIQUE REFERENCES deals(id) ON DELETE SET NULL,
        conta              TEXT NOT NULL,
        area               TEXT NOT NULL REFERENCES areas(id),
        situacao           TEXT NOT NULL CHECK (situacao IN ('contratada', 'prevista')),
        chance             TEXT CHECK (chance IN ('alta', 'baixa')),
        inicio_faturamento DATE NOT NULL,
        notas              TEXT NOT NULL DEFAULT '',
        criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em      TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS contrato_receitas (
        contrato_id    INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
        tipo           TEXT NOT NULL CHECK (tipo IN ('assinatura', 'implantacao', 'customizacao')),
        valor_centavos BIGINT NOT NULL CHECK (valor_centavos >= 0),
        parcelas       INTEGER NOT NULL DEFAULT 1 CHECK (parcelas >= 1),
        inicio_mes     INTEGER NOT NULL DEFAULT 0 CHECK (inicio_mes >= 0),
        duracao_meses  INTEGER CHECK (duracao_meses IS NULL OR duracao_meses >= 1),
        PRIMARY KEY (contrato_id, tipo)
      )
    `;

    // Faturamento (contas a receber), nov/2026. Dados de cobrança no contrato, e uma linha por
    // fatura emitida. "A emitir" não é gravado: sai do cronograma do contrato. Ao emitir, a
    // fatura guarda o próprio valor — mexer no contrato depois não muda o que foi faturado.
    // `contrato_id` SET NULL: a fatura (e o histórico fiscal) sobrevive ao contrato excluído,
    // por isso cliente e produto vão copiados nela.
    await sql`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS cnpj TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS email_cobranca TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER NOT NULL DEFAULT 10`;
    await sql`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS forma_cobranca TEXT NOT NULL DEFAULT 'boleto'`;
    await sql`
      CREATE TABLE IF NOT EXISTS faturas (
        id                    SERIAL PRIMARY KEY,
        ref                   TEXT UNIQUE,
        contrato_id           INTEGER REFERENCES contratos(id) ON DELETE SET NULL,
        conta                 TEXT NOT NULL,
        area                  TEXT NOT NULL REFERENCES areas(id),
        tipo                  TEXT NOT NULL CHECK (tipo IN ('assinatura', 'implantacao', 'customizacao', 'avulsa')),
        parcela               TEXT NOT NULL DEFAULT '',
        competencia           TEXT NOT NULL,
        descricao             TEXT NOT NULL DEFAULT '',
        valor_centavos        BIGINT NOT NULL CHECK (valor_centavos > 0),
        status                TEXT NOT NULL CHECK (status IN ('emitida', 'paga', 'cancelada')),
        emitida_em            DATE,
        vencimento            DATE,
        nf_numero             TEXT NOT NULL DEFAULT '',
        forma                 TEXT,
        retencoes_centavos    BIGINT NOT NULL DEFAULT 0 CHECK (retencoes_centavos >= 0),
        pago_em               DATE,
        valor_pago_centavos   BIGINT,
        cancelada_em          DATE,
        motivo_cancelamento   TEXT NOT NULL DEFAULT '',
        notas                 TEXT NOT NULL DEFAULT '',
        criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em         TIMESTAMPTZ
      )
    `;
    // Funding AWS (nov/2026, só admin): arquétipos de implantação com as calculadoras oficiais
    // da AWS, catálogo de programas, e por oportunidade a estimativa de consumo (conta LIFF e
    // conta do cliente) com as linhas de funding. As sementes entram só quando a tabela nasce,
    // como os produtos: depois disso o cadastro é de quem administra.
    const [{ fundingNovo }] = await sql<{ fundingNovo: boolean }[]>`
      SELECT to_regclass('public.funding_arquetipos') IS NULL AS "fundingNovo"
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS funding_programas (
        id        TEXT PRIMARY KEY,
        label     TEXT NOT NULL,
        forma     TEXT NOT NULL CHECK (forma IN ('credito', 'cash')),
        descricao TEXT NOT NULL DEFAULT '',
        ativo     BOOLEAN NOT NULL DEFAULT true,
        ordem     INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS funding_arquetipos (
        id        SERIAL PRIMARY KEY,
        nome      TEXT NOT NULL,
        modelo    TEXT NOT NULL CHECK (modelo IN ('saas_liff', 'dedicado_liff', 'hibrido', 'cliente')),
        descricao TEXT NOT NULL DEFAULT '',
        ativo     BOOLEAN NOT NULL DEFAULT true,
        ordem     INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS funding_calculadoras (
        id                    SERIAL PRIMARY KEY,
        arquetipo_id          INTEGER NOT NULL REFERENCES funding_arquetipos(id) ON DELETE CASCADE,
        regiao                TEXT NOT NULL,
        conta                 TEXT NOT NULL CHECK (conta IN ('liff', 'cliente')),
        porte                 TEXT NOT NULL DEFAULT '',
        url                   TEXT NOT NULL DEFAULT '',
        custo_mensal_centavos BIGINT NOT NULL DEFAULT 0 CHECK (custo_mensal_centavos >= 0),
        data_preco            DATE,
        notas                 TEXT NOT NULL DEFAULT ''
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS funding_estimativas (
        id                      SERIAL PRIMARY KEY,
        ref                     TEXT UNIQUE,
        conta                   TEXT NOT NULL,
        deal_id                 INTEGER REFERENCES deals(id) ON DELETE SET NULL,
        arquetipo_id            INTEGER REFERENCES funding_arquetipos(id) ON DELETE SET NULL,
        regiao                  TEXT NOT NULL,
        porte                   TEXT NOT NULL DEFAULT '',
        liff_mensal_centavos    BIGINT NOT NULL DEFAULT 0,
        cliente_mensal_centavos BIGINT NOT NULL DEFAULT 0,
        ia_mensal_centavos      BIGINT NOT NULL DEFAULT 0,
        ia_paga_por             TEXT NOT NULL DEFAULT 'liff' CHECK (ia_paga_por IN ('liff', 'cliente')),
        inicio                  TEXT,
        duracao_meses           INTEGER NOT NULL DEFAULT 12,
        notas                   TEXT NOT NULL DEFAULT '',
        criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em           TIMESTAMPTZ
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS funding_linhas (
        id             SERIAL PRIMARY KEY,
        estimativa_id  INTEGER NOT NULL REFERENCES funding_estimativas(id) ON DELETE CASCADE,
        programa_id    TEXT NOT NULL REFERENCES funding_programas(id),
        beneficiario   TEXT NOT NULL CHECK (beneficiario IN ('liff', 'cliente')),
        valor_centavos BIGINT NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
        status         TEXT NOT NULL,
        aws_id         TEXT NOT NULL DEFAULT '',
        solicitado_em  DATE,
        aprovado_em    DATE,
        expira_em      DATE,
        notas          TEXT NOT NULL DEFAULT ''
      )
    `;
    if (fundingNovo) {
      for (const [i, p] of PROGRAMAS_SEMENTE.entries()) {
        await sql`
          INSERT INTO funding_programas (id, label, forma, descricao, ordem)
          VALUES (${p.id}, ${p.label}, ${p.forma}, ${p.descricao}, ${i}) ON CONFLICT (id) DO NOTHING
        `;
      }
      for (const [i, a] of ARQUETIPOS_SEMENTE.entries()) {
        const [novo] = await sql<{ id: number }[]>`
          INSERT INTO funding_arquetipos (nome, modelo, descricao, ordem) VALUES (${a.nome}, ${a.modelo}, ${a.descricao}, ${i}) RETURNING id
        `;
        for (const c of a.calculadoras) {
          await sql`
            INSERT INTO funding_calculadoras (arquetipo_id, regiao, conta, porte, custo_mensal_centavos, data_preco, notas)
            VALUES (${novo.id}, ${c.regiao}, ${c.conta}, ${c.porte}, ${Math.round(c.usd * 100)}, '2026-10-29', ${c.nota})
          `;
        }
      }
    }

    // Pastas de arquétipos (nov/2026): um conjunto de arquétipos por Módulo. Na
    // criação da tabela, os arquétipos que já existem (todos do LIFF Tax Reform) vão para uma
    // pasta com esse nome. Depois disso as pastas são de quem administra: apagar não volta.
    const [{ pastasNovas }] = await sql<{ pastasNovas: boolean }[]>`
      SELECT to_regclass('public.funding_pastas') IS NULL AS "pastasNovas"
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS funding_pastas (
        id         SERIAL PRIMARY KEY,
        nome       TEXT NOT NULL,
        produto_id TEXT REFERENCES produtos(id) ON DELETE SET NULL,
        descricao  TEXT NOT NULL DEFAULT '',
        ordem      INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`ALTER TABLE funding_arquetipos ADD COLUMN IF NOT EXISTS pasta_id INTEGER REFERENCES funding_pastas(id) ON DELETE SET NULL`;
    if (pastasNovas) {
      const [pasta] = await sql<{ id: number }[]>`
        INSERT INTO funding_pastas (nome, descricao, ordem)
        VALUES ('LIFF Tax Reform', 'Arquétipos do documento "Estimativa de custo AWS · Liff Tax" (porte M, 29/10/2026).', 0)
        RETURNING id
      `;
      await sql`UPDATE funding_arquetipos SET pasta_id = ${pasta.id} WHERE pasta_id IS NULL`;
    }

    // Uma fatura viva por linha do cronograma: emitir duas vezes a mesma parcela é erro que a
    // tela não deve conseguir cometer. Cancelada sai da regra (reemissão).
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS faturas_linha_viva
      ON faturas (contrato_id, tipo, competencia)
      WHERE contrato_id IS NOT NULL AND tipo <> 'avulsa' AND status <> 'cancelada'
    `;

    // A Supabase expõe o schema `public` pela API REST (PostgREST), que atende usando os
    // papéis `anon` e `authenticated` — e concede privilégios a eles por padrão em tabelas
    // novas. A chave anon é pública por definição (nasceu para ir em código de navegador),
    // então tabela sem restrição no `public` é tabela legível por qualquer um que tenha a
    // URL do projeto.
    //
    // Este app fala com o banco só pelo servidor, com a connection string. Nada aqui deve
    // ser alcançável por aquela porta — e `sessions` guarda token de sessão, o que
    // transformaria a exposição em sequestro de conta.
    //
    // O REVOKE resolve independente de RLS e de atributos de papel. Em Postgres sem
    // Supabase os papéis não existem e o bloco não faz nada.
    await sql.unsafe(`
      DO $$
      DECLARE papel TEXT;
      BEGIN
        FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            -- Lista EXPLÍCITA, com todas as tabelas deste app. A anterior parava em audit_log:
            -- areas e produtos ficavam de fora, e as tabelas de OAuth guardam hash de token.
            -- Não é "ALL TABLES IN SCHEMA public" de propósito: o projeto da Supabase pode ter
            -- tabelas de outro sistema no mesmo schema, e cortar o acesso delas em silêncio
            -- não cabe a esta migração. TABELA NOVA NESTE APP ENTRA NESTA LISTA.
            EXECUTE format(
              'REVOKE ALL ON users, user_area_perms, activities, deals, sessions, audit_log, areas, produtos, '
              'oauth_concessoes, oauth_codigos, oauth_tokens, mcp_chamadas, origens, oportunidade_modulos, '
              'contratos, contrato_receitas, faturas, funding_programas, funding_arquetipos, funding_calculadoras, '
              'funding_estimativas, funding_linhas, funding_pastas FROM %I',
              papel
            );
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
          END IF;
        END LOOP;
      END $$;
    `);

    await seed(sql);

    // Depois do seed: base nova também nasce no formato C-/T-, pelo mesmo caminho.
    await converterReferencias(sql);
  });
}

/**
 * D-104 → C-0104 e A-1012 → T-1012 (nov/2026). O número fica, a letra muda: C de comercial,
 * T de tarefa. A referência anterior vai para `ref_antiga`, que é o que permite achar o
 * histórico — o audit_log é append-only e continua com a referência que valia quando cada
 * linha foi escrita, então quem lê histórico procura pelas duas.
 *
 * Idempotente: só toca linhas no formato antigo. Se duas referências fossem dar no mesmo
 * código (D-01 e D-1 coexistindo, por exemplo), não converte NADA daquela tabela e avisa no
 * log: falhar a migração por violação de unicidade derrubaria o app inteiro, e as referências
 * antigas continuam aceitas em todo lugar.
 */
async function converterReferencias(sql: Queryable): Promise<void> {
  await sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS ref_antiga TEXT`;
  await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS ref_antiga TEXT`;

  // A sequência tem de estar sempre ACIMA do maior número já usado. As referências nascem
  // dela, e um registro com número maior (inserido à mão, por exemplo) faria a próxima
  // criação colidir e falhar. Vale para qualquer letra, antiga ou nova.
  for (const [tabela, sequencia] of [["deals", "deals_ref_seq"], ["activities", "activities_ref_seq"]] as const) {
    await sql.unsafe(`
      SELECT setval('${sequencia}', GREATEST(
        (SELECT last_value FROM ${sequencia}),
        COALESCE((SELECT max(substring(ref FROM '[0-9]+$')::bigint) FROM ${tabela} WHERE ref ~ '^[A-Z]-[0-9]+$'), 0)
      ))
    `);
  }

  for (const [tabela, antigo, nome] of [
    ["deals", "^D-[0-9]+$", "oportunidade"],
    ["activities", "^A-[0-9]+$", "atividade"],
  ] as const) {
    const velhas = await sql.unsafe<{ id: number; ref: string }[]>(
      `SELECT id, ref FROM ${tabela} WHERE ref ~ $1`,
      [antigo]
    );
    if (!velhas.length) continue;

    const todas = await sql.unsafe<{ ref: string }[]>(`SELECT ref FROM ${tabela}`);
    const ocupadas = new Set(todas.map((r) => r.ref).filter((r) => !new RegExp(antigo).test(r)));
    const novas = velhas.map((v) => ({ ...v, nova: refCanonica(v.ref) as string }));
    let colisao: (typeof novas)[number] | undefined;
    const vistas = new Set<string>();
    for (const v of novas) {
      if (ocupadas.has(v.nova) || vistas.has(v.nova)) {
        colisao = v;
        break;
      }
      vistas.add(v.nova);
    }
    if (colisao) {
      console.error(`[db] conversão de referências de ${nome} ADIADA: ${colisao.ref} colidiria em ${colisao.nova}`);
      continue;
    }

    for (const v of novas) {
      await sql.unsafe(`UPDATE ${tabela} SET ref_antiga = ref, ref = $1 WHERE id = $2`, [v.nova, v.id]);
    }
    await sql`
      INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
      VALUES (NULL, NULL, 'SISTEMA', 'referencias', ${antigo.slice(1, 3)}, ${nome === "oportunidade" ? "C-" : "T-"},
              ${`Converteu ${novas.length} referência(s) de ${nome} para o formato ${nome === "oportunidade" ? "C-0000" : "T-0000"}; a antiga continua valendo`})
    `;
    console.log(`[db] ${novas.length} referência(s) de ${nome} convertidas`);
  }
}

/**
 * Estágios novos do pipeline (nov/2026): Prospecção → 1ª Reunião → Qualificado → Proposta →
 * Validação → Contrato → Ganho, mais On hold e Lost.
 *
 * 1. LIMPEZA, uma vez só. A decisão foi apagar todas as oportunidades e recarregar o pipeline
 *    do zero nos estágios novos, em vez de adivinhar para onde ia cada uma. Cada exclusão deixa
 *    a sua linha no audit_log (conta, valor, estágio) e o fim deixa uma MARCA; com a marca
 *    presente, a limpeza nunca mais roda — o que for carregado depois está a salvo. Roda ANTES
 *    do seed: base nova limpa zero oportunidades, grava a marca, e o seed entra normalmente.
 * 2. RESTO: se algo no formato antigo aparecer depois (uma instância com código velho gravando
 *    durante o deploy), o estágio é traduzido, com registro, e "Em pausa" vira On hold.
 * 3. O CHECK antigo cai ANTES da tradução — ele só aceita os estágios velhos e recusaria o
 *    UPDATE. O bloco de CHECKs logo depois recria com a lista nova.
 */
const MARCA_LIMPEZA = "limpeza-pipeline-2026-11";
const ESTAGIO_ANTIGO: Record<string, string> = {
  lead: "prospeccao",
  qualificacao: "qualificado",
  validacao: "validacao",
  proposta: "proposta",
  negociacao: "contrato",
  ganho: "ganho",
};

async function reiniciarPipeline(sql: Queryable): Promise<void> {
  const [feita] = await sql`SELECT 1 FROM audit_log WHERE entidade = 'SISTEMA' AND campo = ${MARCA_LIMPEZA} LIMIT 1`;
  if (!feita) {
    const alvos = await sql<{ id: number; ref: string; conta: string; area: string; estagio: string; valor_centavos: string }[]>`
      SELECT id, ref, conta, area, estagio, valor_centavos FROM deals ORDER BY id
    `;
    for (const d of alvos) {
      await sql`
        INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
        VALUES (NULL, ${d.area}, ${d.ref}, 'exclusao', ${d.conta}, NULL,
                ${`Excluiu a oportunidade ${d.conta} (${(Number(d.valor_centavos) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, estágio ${d.estagio}) na limpeza do pipeline para os novos estágios`})
      `;
    }
    if (alvos.length) await sql`DELETE FROM deals WHERE id = ANY(${alvos.map((d) => d.id)})`;
    await sql`
      INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
      VALUES (NULL, NULL, 'SISTEMA', ${MARCA_LIMPEZA}, NULL, ${String(alvos.length)},
              ${`Limpeza do pipeline comercial para os novos estágios: ${alvos.length} oportunidade(s) excluída(s); o histórico de cada uma continua na auditoria`})
    `;
    console.log(`[db] limpeza do pipeline: ${alvos.length} oportunidade(s) excluída(s)`);
  }

  await sql`ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_estagio_check`;
  await sql`ALTER TABLE deals ALTER COLUMN estagio SET DEFAULT 'prospeccao'`;

  const restos = await sql<{ id: number; ref: string; area: string; estagio: string; pausado: boolean }[]>`
    SELECT id, ref, area, estagio, pausado FROM deals
    WHERE pausado OR NOT (estagio = ANY(${STAGE_KEYS as string[]}))
  `;
  for (const d of restos) {
    const novo = d.pausado ? "on_hold" : (ESTAGIO_ANTIGO[d.estagio] ?? "prospeccao");
    await sql`UPDATE deals SET estagio = ${novo}, pausado = false WHERE id = ${d.id}`;
    await sql`
      INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
      VALUES (NULL, ${d.area}, ${d.ref}, 'estagio', ${d.estagio}, ${novo},
              ${`Estágio convertido para o pipeline novo: ${d.estagio}${d.pausado ? " (em pausa)" : ""} → ${novo}`})
    `;
  }
}

/**
 * Conjunto de demonstração — só entra em base vazia, e só se SEED_DEMO não estiver desligado.
 * São os mesmos dados que o protótipo estático carregava em memória, agora persistidos.
 */
async function seed(sql: Queryable): Promise<void> {
  if (process.env.SEED_DEMO === "0") return;
  const [{ c }] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM users`;
  if (Number(c) > 0) return;

  const adminEmail = (process.env.ADMIN_EMAIL ?? "leme@getliff.ai").trim().toLowerCase();

  const pessoas: {
    nome: string;
    email: string;
    papel: string;
    iniciais: string;
    perms: Record<string, "view" | "edit">;
  }[] = [
    {
      nome: "André Leme", email: "leme@getliff.ai", papel: "admin", iniciais: "AL",
      perms: {},
    },
    {
      nome: "Marina Duarte", email: "marina@getliff.ai", papel: "gestor", iniciais: "MD",
      perms: { "law-firms": "edit", corporate: "edit", "public-sector": "view", tax: "view" },
    },
    {
      nome: "Rafael Nunes", email: "rafael@getliff.ai", papel: "gestor", iniciais: "RN",
      perms: { "law-firms": "view", corporate: "view", tax: "edit", labs: "edit" },
    },
    {
      nome: "Clara Bastos", email: "clara@getliff.ai", papel: "membro", iniciais: "CB",
      perms: { "public-sector": "view", social: "view" },
    },
  ];

  const idPorEmail = new Map<string, number>();
  for (const p of pessoas) {
    const papel = p.email.toLowerCase() === adminEmail ? "admin" : p.papel;
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO users (nome, email, papel, iniciais) VALUES (${p.nome}, ${p.email}, ${papel}, ${p.iniciais})
      RETURNING id
    `;
    idPorEmail.set(p.email, row.id);
    for (const [area, nivel] of Object.entries(p.perms)) {
      await sql`INSERT INTO user_area_perms (user_id, area, nivel) VALUES (${row.id}, ${area}, ${nivel})`;
    }
  }

  const uid = (email: string) => idPorEmail.get(email) ?? null;

  // ref, título, área, status, e-mail do responsável, prazo, prioridade
  const atividades: [string, string, string, string, string, string, string][] = [
    ["A-101", "Implantação law-v no escritório Vieira & Costa", "law-firms", "andamento", "marina@getliff.ai", "2026-08-12", "alta"],
    ["A-102", "Migração de base processual — fase 2", "law-firms", "revisao", "rafael@getliff.ai", "2026-08-09", "alta"],
    ["A-103", "Proposta comercial Grupo Andrade", "law-firms", "backlog", "marina@getliff.ai", "2026-08-18", "media"],
    ["A-201", "Rollout Regtrack na área de compliance", "corporate", "andamento", "rafael@getliff.ai", "2026-08-15", "alta"],
    ["A-202", "Treinamento de governança — turma 3", "corporate", "concluido", "clara@getliff.ai", "2026-08-01", "baixa"],
    ["A-203", "Revisão de política de retenção documental", "corporate", "backlog", "leme@getliff.ai", "2026-08-22", "media"],
    ["A-301", "Pregão eletrônico — Tribunal de Contas MG", "public-sector", "andamento", "leme@getliff.ai", "2026-08-11", "alta"],
    ["A-302", "Integração com sistema de controle interno", "public-sector", "backlog", "rafael@getliff.ai", "2026-08-29", "baixa"],
    ["A-401", "Motor de cálculo da reforma — CBS/IBS", "tax", "andamento", "rafael@getliff.ai", "2026-08-20", "alta"],
    ["A-402", "DRE Impact para carteira industrial", "tax", "revisao", "leme@getliff.ai", "2026-08-08", "alta"],
    ["A-403", "Onboarding tributário — Nutrimax", "tax", "concluido", "marina@getliff.ai", "2026-07-31", "media"],
    ["A-501", "Deadline Agent — avaliação de precisão", "labs", "andamento", "rafael@getliff.ai", "2026-08-14", "alta"],
    ["A-502", "Evidence Graph — protótipo de grafo", "labs", "backlog", "leme@getliff.ai", "2026-08-26", "media"],
    ["A-503", "Benchmark de modelos para extração", "labs", "revisao", "rafael@getliff.ai", "2026-08-10", "media"],
    ["A-601", "Convênio com Defensoria — plano piloto", "social", "andamento", "clara@getliff.ai", "2026-08-19", "media"],
    ["A-602", "Relatório de impacto do 1º semestre", "social", "concluido", "clara@getliff.ai", "2026-08-04", "baixa"],
  ];
  for (const [ref, titulo, area, status, email, prazo, prio] of atividades) {
    await sql`
      INSERT INTO activities (ref, titulo, area, status, responsavel_user_id, prazo, prioridade)
      VALUES (${ref}, ${titulo}, ${area}, ${status}, ${uid(email)}, ${prazo}, ${prio})
    `;
  }

  // valor em centavos: 420000 reais → 42000000
  const oportunidades: [string, string, string, string, string, number, string, string][] = [
    ["D-01", "Vieira & Costa Advogados", "law-v · 80 usuários", "law-firms", "contrato", 420000, "marina@getliff.ai", "Reunião 08/08"],
    ["D-02", "Grupo Andrade", "law-v + Docflows", "law-firms", "proposta", 260000, "marina@getliff.ai", "Enviar proposta"],
    ["D-03", "Metalcorp S.A.", "Regtrack corporate", "corporate", "qualificado", 180000, "marina@getliff.ai", "Discovery 12/08"],
    ["D-04", "Instituto Vega", "Compliance ESG", "corporate", "prospeccao", 95000, "leme@getliff.ai", "Qualificar"],
    ["D-05", "Tribunal de Contas MG", "Controle interno", "public-sector", "proposta", 610000, "leme@getliff.ai", "Edital 11/08"],
    ["D-06", "Nutrimax Alimentos", "LIFF Tax · DRE Impact", "tax", "ganho", 340000, "marina@getliff.ai", "Kickoff feito"],
    ["D-07", "Cimentos Boa Vista", "Reforma tributária", "tax", "contrato", 275000, "leme@getliff.ai", "Ajuste de escopo"],
    ["D-08", "Rede Solidária Brasil", "Acesso à justiça", "social", "prospeccao", 60000, "clara@getliff.ai", "Primeiro contato"],
  ];
  for (const [ref, conta, escopo, area, estagio, reais, email, prox] of oportunidades) {
    await sql`
      INSERT INTO deals (ref, conta, escopo, area, estagio, valor_centavos, responsavel_user_id, proximo_passo)
      VALUES (${ref}, ${conta}, ${escopo}, ${area}, ${estagio}, ${reais * 100}, ${uid(email)}, ${prox})
    `;
  }

  await sql`
    INSERT INTO audit_log (actor_user_id, area, entidade, texto)
    VALUES (${uid(adminEmail) ?? uid("leme@getliff.ai")}, NULL, 'sistema', 'Base criada com o conjunto de demonstração')
  `;
}

/** Garante a migração (uma vez por processo) e devolve o client. */
export async function getDb(): Promise<Db> {
  if (!_migrated) _migrated = migrate();
  await _migrated;
  return rawSql();
}
