# Templates de contrato

Um arquivo por versão, **nunca editado no lugar**. O nome carrega a versão e o
contrato gerado guarda qual usou — sem isso não há como responder, dois anos
depois, qual redação o cliente assinou.

O commit que adiciona uma versão é o registro de que o jurídico aprovou aquela
redação. Mudança de cláusula = arquivo novo (`-v2`), não edição do `-v1`.

| Arquivo | Origem | Revisado |
|---|---|---|
| `contrato-prestacao-servicos-v1.docx` | derivado do contrato Medley de 28/10/2026 | **pendente** |

## v1 — alterações em relação ao contrato Medley

Três correções de defeito, além da troca dos dados por campos:

1. **2.4** referenciava o "item 3.7", que não existe — a cláusula terceira vai
   até 3.3. A suspensão por atraso é a **3.3**.
2. **10.4** referenciava o "item 2.3" (remuneração mensal) querendo dizer **2.4**
   (encargos de mora).
3. Preâmbulo: "representada, neste ato, **a** forma" → "**na** forma".

As três precisam de confirmação do jurídico antes de a v1 sair de pendente.

## Campos

`node scripts/verificar-contrato.mjs` lista os campos do template, preenche com
os valores do contrato Medley e confere que o resultado reproduz o original.
