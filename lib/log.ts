// Auditoria. Toda escrita do sistema passa por aqui — o registro guarda autor, horário,
// entidade, campo e o par valor anterior/novo, que é o que a tela de administração promete.
// A tabela é append-only: nada no app faz UPDATE ou DELETE em audit_log.

import type { Db } from "./db";

export type Mudanca = {
  actorUserId: number;
  area: string | null;
  entidade: string;
  campo?: string | null;
  de?: string | null;
  para?: string | null;
  texto: string;
};

export async function registrar(sql: Db, m: Mudanca): Promise<void> {
  await sql`
    INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
    VALUES (${m.actorUserId}, ${m.area}, ${m.entidade}, ${m.campo ?? null}, ${m.de ?? null}, ${m.para ?? null}, ${m.texto})
  `;
}
