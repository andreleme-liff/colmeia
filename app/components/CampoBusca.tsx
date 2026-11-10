"use client";

// Campo de busca do cabeçalho. Filtra na hora, a cada tecla (é tudo do lado do cliente); Esc
// ou o × limpam. A regra de casamento mora em `lib/domain.ts` (`pontuarBusca`).

export default function CampoBusca({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="liff-busca" role="search">
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
      <input
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && valor) {
            e.stopPropagation();
            onChange("");
          }
        }}
        placeholder="Buscar"
        aria-label="Buscar por termo nesta tela"
        title="Busca sem acento. Com dois termos, quem tem os dois (e a frase exata) vem primeiro; quem tem só um também aparece."
        spellCheck={false}
      />
      {valor && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar a busca" title="Limpar a busca">
          ×
        </button>
      )}
    </div>
  );
}
