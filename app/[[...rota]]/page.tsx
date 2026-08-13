import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { lerRota } from "@/lib/rotas";
import Ops from "../components/Ops";

// A sessão é lida a cada requisição — nada aqui pode ser pré-renderizado no build.
export const dynamic = "force-dynamic";

/**
 * Catch-all opcional: uma rota para toda a casca. O sistema é uma tela só que carrega o
 * estado inteiro de uma vez, então dividir em páginas de verdade duplicaria o shell sem
 * ganho — mas os caminhos precisam existir no servidor, senão um link colado dá 404 antes
 * de o JavaScript rodar.
 *
 * `/login` e `/api/*` continuam vencendo daqui: segmento estático tem precedência sobre
 * dinâmico no App Router.
 */
export default async function Home({ params }: PageProps<"/[[...rota]]">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { rota: segmentos } = await params;
  const rota = lerRota(segmentos);
  // Caminho que não existe é 404 de verdade, e não a visão geral disfarçada: quem recebeu
  // um link errado precisa saber que ele está errado.
  if (!rota) notFound();

  return <Ops rotaInicial={rota} />;
}
