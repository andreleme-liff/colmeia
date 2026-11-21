import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { caminhoInternoSeguro } from "@/lib/rotas";
import LoginScreen from "./LoginScreen";

export const dynamic = "force-dynamic";

export default async function Login(props: PageProps<"/login">) {
  // `voltar` é para onde ir depois de entrar (hoje, a tela de consentimento do OAuth). Só
  // caminho interno, senão isto viraria redirecionamento aberto.
  const { erro, voltar } = await props.searchParams;
  const destino = caminhoInternoSeguro(typeof voltar === "string" ? voltar : null, "/");

  const user = await getSessionUser();
  if (user) redirect(destino);

  return <LoginScreen erro={typeof erro === "string" ? erro : undefined} voltar={destino} />;
}
