// Cadastro da vertical: cor e rótulos. Restrito a admin — é configuração do sistema, não
// dado operacional, e muda como todo mundo enxerga o quadro.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { idDaPlanilha } from "@/lib/google-sheets";


type Body = { cor?: string; label?: string; short?: string; planilhaUrl?: string | null };

/** Só HEX de 6 dígitos: é o que o input de cor produz e o que vira variável CSS sem escape. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/areas/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const atuais = await sql<{ label: string; short: string; cor: string; planilha_url: string | null }[]>`
    SELECT label, short, cor, planilha_url FROM areas WHERE id = ${id}
  `;
  if (!atuais.length) return err("Vertical não encontrada.", 404);
  const atual = atuais[0];

  const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];

  if (body.cor !== undefined && body.cor !== atual.cor) {
    const cor = body.cor.trim();
    if (!HEX_RE.test(cor)) return err("Cor inválida — use HEX de 6 dígitos, como #4B6B9B.", 400);
    mudancas.push({
      campo: "cor",
      de: atual.cor,
      para: cor,
      texto: `Alterou a cor de ${atual.label} de ${atual.cor} para ${cor}`,
    });
    await sql`UPDATE areas SET cor = ${cor} WHERE id = ${id}`;
  }

  if (body.label !== undefined && body.label.trim() && body.label.trim() !== atual.label) {
    const label = body.label.trim().slice(0, 60);
    mudancas.push({
      campo: "label",
      de: atual.label,
      para: label,
      texto: `Renomeou a vertical ${atual.label} para ${label}`,
    });
    await sql`UPDATE areas SET label = ${label} WHERE id = ${id}`;
  }

  if (body.short !== undefined && body.short.trim() && body.short.trim() !== atual.short) {
    const short = body.short.trim().slice(0, 8).toUpperCase();
    mudancas.push({
      campo: "short",
      de: atual.short,
      para: short,
      texto: `Alterou a sigla de ${atual.label} de ${atual.short} para ${short}`,
    });
    await sql`UPDATE areas SET short = ${short} WHERE id = ${id}`;
  }

  if (body.planilhaUrl !== undefined) {
    const bruto = String(body.planilhaUrl ?? "").trim();
    const planilhaId = bruto ? idDaPlanilha(bruto) : null;
    if (bruto && !planilhaId) {
      return err("Endereço de planilha não reconhecido. Cole a URL do Google Sheets.", 400);
    }
    // Guarda a forma canônica, não a URL colada: ela vem com /edit, #gid e às vezes
    // parâmetros de sessão. O que importa para ler é o id, e só ele é estável.
    const nova = planilhaId ? `https://docs.google.com/spreadsheets/d/${planilhaId}` : null;
    if (nova !== atual.planilha_url) {
      mudancas.push({
        campo: "planilha",
        de: atual.planilha_url ?? "—",
        para: nova ?? "—",
        texto: nova
          ? `Definiu a planilha de sincronização de ${atual.label}`
          : `Removeu a planilha de sincronização de ${atual.label}`,
      });
      await sql`UPDATE areas SET planilha_url = ${nova} WHERE id = ${id}`;
    }
  }

  for (const m of mudancas) {
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: id,
      entidade: `AREA-${id}`,
      campo: m.campo,
      de: m.de,
      para: m.para,
      texto: m.texto,
    });
  }

  return json({ ok: true, mudancas: mudancas.length });
}

/**
 * Exclusão. Recusa se a vertical ainda tem atividade ou oportunidade — a chave estrangeira
 * já barraria, mas aqui a mensagem diz quantos registros seguram, que é o que a pessoa
 * precisa saber para decidir.
 *
 * As permissões concedidas naquela área caem junto (ON DELETE CASCADE): permissão sobre
 * área inexistente não significa nada. A auditoria sobrevive — ela guarda o texto da área,
 * sem chave estrangeira, de propósito: histórico não deve sumir porque a estrutura mudou.
 */
export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/areas/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const sql = await getDb();

  const alvos = await sql<{ label: string }[]>`SELECT label FROM areas WHERE id = ${id}`;
  if (!alvos.length) return err("Vertical não encontrada.", 404);

  const [{ atividades, oportunidades }] = await sql<{ atividades: number; oportunidades: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM activities WHERE area = ${id}) AS atividades,
      (SELECT COUNT(*)::int FROM deals      WHERE area = ${id}) AS oportunidades
  `;
  if (atividades > 0 || oportunidades > 0) {
    const partes = [
      atividades > 0 ? `${atividades} atividade${atividades > 1 ? "s" : ""}` : null,
      oportunidades > 0 ? `${oportunidades} oportunidade${oportunidades > 1 ? "s" : ""}` : null,
    ].filter(Boolean);
    return err(`${alvos[0].label} ainda tem ${partes.join(" e ")}. Mova ou exclua antes.`, 409);
  }

  const [{ perms }] = await sql<{ perms: number }[]>`
    SELECT COUNT(*)::int AS perms FROM user_area_perms WHERE area = ${id}
  `;

  await sql`DELETE FROM areas WHERE id = ${id}`;
  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area: null,
    entidade: `AREA-${id}`,
    campo: "exclusao",
    de: alvos[0].label,
    para: null,
    texto: `Excluiu a vertical ${alvos[0].label}${perms > 0 ? ` e ${perms} permissão(ões) nela` : ""}`,
  });

  return json({ ok: true });
}
