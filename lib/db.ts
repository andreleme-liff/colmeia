// Camada de banco (Postgres via Supabase), usando o driver `postgres` — o mesmo padrão do
// mini-todos: funciona bem com o Transaction Pooler via `prepare: false`.
// Migração idempotente no primeiro acesso + seed do conjunto de demonstração.

import postgres from "postgres";
import { PAPEIS, PRIORIDADES, STAGE_KEYS, STATUS_KEYS } from "./domain";

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
    ssl: "require",
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
 * Semente do cadastro de áreas. São os valores da cascata de cada vertical no design system
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

    // Cadastro das verticais. Vem primeiro porque as demais tabelas apontam para ela: o
    // conjunto de áreas é aberto, e quem garante que um registro não aponte para área
    // inexistente é a chave estrangeira, não uma lista fixa no código.
    await sql`
      CREATE TABLE IF NOT EXISTS areas (
        id     TEXT PRIMARY KEY,
        label  TEXT NOT NULL,
        short  TEXT NOT NULL,
        cor    TEXT NOT NULL,
        ordem  INTEGER NOT NULL DEFAULT 0
      )
    `;
    for (const [i, a] of AREAS_SEMENTE.entries()) {
      await sql`
        INSERT INTO areas (id, label, short, cor, ordem)
        VALUES (${a.id}, ${a.label}, ${a.short}, ${a.cor}, ${i})
        ON CONFLICT (id) DO NOTHING
      `;
    }

    // Produto é o que se vende dentro de uma vertical — "Regtrack Farma" dentro de
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
      -- tema e filtro de área. JSONB para não precisar de migração a cada preferência
      -- nova; quem valida as chaves é a rota, que ignora o que não conhece.
      preferencias JSONB NOT NULL DEFAULT '{}'::jsonb,
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
      estagio             TEXT NOT NULL DEFAULT 'lead' CHECK (estagio IN (${inList(STAGE_KEYS)})),
      valor_centavos      BIGINT NOT NULL DEFAULT 0,
      responsavel_user_id INTEGER REFERENCES users(id),
      proximo_passo       TEXT NOT NULL DEFAULT '',
      situacao            TEXT NOT NULL DEFAULT '',
      contato             TEXT NOT NULL DEFAULT '',
      responsavel_texto   TEXT NOT NULL DEFAULT '',
      produto_id          TEXT REFERENCES produtos(id) ON DELETE SET NULL,
      pausado             BOOLEAN NOT NULL DEFAULT false,
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
    // das seis verticais — o que impediria cadastrar a sétima. Aqui o CHECK sai e a chave
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

        -- Sem CASCADE de propósito: excluir uma vertical que ainda tem atividade ou
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

    // Refs legíveis para registros novos. Começam acima das semeadas (A-101…A-602,
    // D-01…D-08) para nunca colidir com elas.
    await sql`CREATE SEQUENCE IF NOT EXISTS activities_ref_seq START 1000`;
    await sql`CREATE SEQUENCE IF NOT EXISTS deals_ref_seq START 100`;

    await sql`CREATE INDEX IF NOT EXISTS idx_activities_area ON activities(area, status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_area ON deals(area, estagio)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_recente ON audit_log(criado_em DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_perms_user ON user_area_perms(user_id)`;

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
            EXECUTE format(
              'REVOKE ALL ON users, user_area_perms, activities, deals, sessions, audit_log FROM %I',
              papel
            );
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', papel);
          END IF;
        END LOOP;
      END $$;
    `);

    await seed(sql);
  });
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
    ["D-01", "Vieira & Costa Advogados", "law-v · 80 usuários", "law-firms", "negociacao", 420000, "marina@getliff.ai", "Reunião 08/08"],
    ["D-02", "Grupo Andrade", "law-v + Docflows", "law-firms", "proposta", 260000, "marina@getliff.ai", "Enviar proposta"],
    ["D-03", "Metalcorp S.A.", "Regtrack corporate", "corporate", "qualificacao", 180000, "marina@getliff.ai", "Discovery 12/08"],
    ["D-04", "Instituto Vega", "Compliance ESG", "corporate", "lead", 95000, "leme@getliff.ai", "Qualificar"],
    ["D-05", "Tribunal de Contas MG", "Controle interno", "public-sector", "proposta", 610000, "leme@getliff.ai", "Edital 11/08"],
    ["D-06", "Nutrimax Alimentos", "LIFF Tax · DRE Impact", "tax", "ganho", 340000, "marina@getliff.ai", "Kickoff feito"],
    ["D-07", "Cimentos Boa Vista", "Reforma tributária", "tax", "negociacao", 275000, "leme@getliff.ai", "Ajuste de escopo"],
    ["D-08", "Rede Solidária Brasil", "Acesso à justiça", "social", "lead", 60000, "clara@getliff.ai", "Primeiro contato"],
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
