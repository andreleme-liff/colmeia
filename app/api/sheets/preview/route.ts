// Lê a planilha configurada na área e devolve a prévia — as mesmas abas classificadas que a
// importação por arquivo produz, para a tela e a validação serem exatamente as mesmas.
//
// Esta rota SÓ LÊ. Nada é gravado aqui: a importação continua passando por
// /api/import/deals e /api/import/activities, que revalidam tudo. Sincronizar sem prévia
// gravaria no sistema o que ninguém olhou.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { normalizarConta, normalizarTexto } from "@/lib/domain";
import { lerAba, type Aba } from "@/lib/planilha";
import { SemAcessoSheets, idDaPlanilha, lerPlanilha, temAcessoSheets } from "@/lib/google-sheets";

export async function GET(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const area = new URL(req.url).searchParams.get("area") ?? "";
  if (!ctx.areasExistentes.includes(area)) return err("Vertical inválida.", 400);
  // Prévia de importação é passo de escrita, ainda que não grave: quem só lê a área não tem
  // o que fazer com ela, e a rota de importação recusaria em seguida.
  if (!ctx.podeEditar(area)) return err(`Sem permissão de edição em ${ctx.labelArea(area)}.`, 403);

  const sql = await getDb();
  const [linhaArea] = await sql<{ planilha_url: string | null }[]>`
    SELECT planilha_url FROM areas WHERE id = ${area}
  `;
  const planilhaId = idDaPlanilha(linhaArea?.planilha_url ?? "");
  if (!planilhaId) {
    return err(
      `${ctx.labelArea(area)} não tem planilha configurada. Cadastre o endereço em Cadastros → verticais.`,
      409
    );
  }

  if (!(await temAcessoSheets(ctx.user.userId))) {
    // 428: falta um passo anterior. A tela usa este código para oferecer o botão de conectar
    // em vez de mostrar um erro que a pessoa não sabe resolver.
    return err("Conecte sua conta Google para ler a planilha.", 428);
  }

  let abasBrutas;
  try {
    abasBrutas = await lerPlanilha(ctx.user.userId, planilhaId);
  } catch (e) {
    if (e instanceof SemAcessoSheets) return err(e.message, 428);
    return err("Não consegui ler a planilha no Google. Tente de novo em instantes.", 502);
  }

  // O que já existe NESTA área, para a prévia marcar o que atualiza em vez de criar.
  const [deals, atividades] = await Promise.all([
    sql<{ conta: string }[]>`SELECT conta FROM deals WHERE area = ${area}`,
    sql<{ titulo: string }[]>`SELECT titulo FROM activities WHERE area = ${area}`,
  ]);
  const jaExistem = {
    contas: new Set(deals.map((d) => normalizarConta(d.conta))),
    titulos: new Set(atividades.map((a) => normalizarTexto(a.titulo))),
  };

  const abas: Aba[] = abasBrutas.map((a) => lerAba(a.nome, a.linhas, jaExistem));
  return json({ ok: true, abas, planilhaId });
}
