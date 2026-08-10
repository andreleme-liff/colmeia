import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Ops from "./components/Ops";

// A sessão é lida a cada requisição — nada aqui pode ser pré-renderizado no build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Ops />;
}
