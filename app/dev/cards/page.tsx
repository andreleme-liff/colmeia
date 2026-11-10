// Página de estados do card do kanban comercial — o "Storybook" do projeto, que não tem um.
// Só existe fora de produção: em produção responde 404.

import { notFound } from "next/navigation";
import EstadosDoCard from "./EstadosDoCard";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EstadosDoCard />;
}
