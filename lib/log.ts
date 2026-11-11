// Auditoria. Toda escrita do sistema passa por aqui — o registro guarda autor, horário,
// entidade, campo e o par valor anterior/novo, que é o que a tela de administração promete.
// A tabela é append-only: nada no app faz UPDATE ou DELETE em audit_log.
//
// `origem` e `concessaoId` dizem POR ONDE a escrita veio. Nulos: a interface, como sempre foi.
// `origem = 'mcp'`: um sistema externo (o Claude, por exemplo) agindo em nome da pessoa, por
// uma conexão que ela mesma autorizou — `concessaoId` aponta qual. Sem chave estrangeira, como
// `entidade`: revogar a conexão não pode apagar o rastro do que ela fez.

import type { Queryable } from "./db";

export type Mudanca = {
  /** Nulo quando quem age é o próprio sistema — ex.: revogação automática por token reusado. */
  actorUserId: number | null;
  area: string | null;
  entidade: string;
  campo?: string | null;
  de?: string | null;
  para?: string | null;
  texto: string;
  origem?: "mcp" | null;
  concessaoId?: number | null;
};

/**
 * Linhas de auditoria que só a administração vê: cadastros (verticais, origens, módulos /
 * produtos, pessoas e permissões), receita (R-), faturamento (F-) e funding (E-, ARQ-, PROG-). Casa
 * pela referência gravada em `entidade`. Efeitos desses cadastros nos cards (ex.: responsável
 * trocado ao excluir uma pessoa) ficam com a referência do card e continuam visíveis.
 */
export const ENTIDADES_SO_ADMIN = "^(AREA|ORIGEM|PROD|U|R|F|E|ARQ|PROG)-";

export async function registrar(sql: Queryable, m: Mudanca): Promise<void> {
  await sql`
    INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto, origem, concessao_id)
    VALUES (${m.actorUserId}, ${m.area}, ${m.entidade}, ${m.campo ?? null}, ${m.de ?? null}, ${m.para ?? null}, ${m.texto},
            ${m.origem ?? null}, ${m.concessaoId ?? null})
  `;
}
