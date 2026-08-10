import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { DOMINIO_PERMITIDO } from "@/lib/google-oauth";
import LoginScreen from "./LoginScreen";

export const dynamic = "force-dynamic";

export default async function Login(props: PageProps<"/login">) {
  const user = await getSessionUser();
  if (user) redirect("/");

  const { erro } = await props.searchParams;
  return <LoginScreen erro={typeof erro === "string" ? erro : undefined} dominio={DOMINIO_PERMITIDO} />;
}
