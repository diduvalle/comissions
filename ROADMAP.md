# COMISSIONS — Roadmap

App: https://comissions.cr0x.org · Código: github.com/diduvalle/comissions · BD: Supabase (bhurcadussdjohbngekq)
Fluxo: editar local → `git push` → Vercel publica automático.

## P0 — Feedback direto (em curso nesta sessão)
- [ ] **Navegação de meses (print 1)** — 28 botões é mau. Redesenhar: separador por **Ano** (2024/2025/2026) + meses só com dados; setas ◀ ▶; vista **"Em aberto / Por pagar"** que junta todas as não-pagas de todos os meses.
- [ ] **Tudo visível na mesma janela (print 2)** — tabela compacta a caber no ecrã sem scroll horizontal (reduzir colunas/padding, larguras fixas, observações truncadas com tooltip).
- [ ] **Bónus do diretor (print 3)** — o Marco pode adicionar um **bónus** (valor + nota) na página de validação, somado ao **Total a pagar**. (BD: colunas `bonus`, `bonus_descricao` em `envios`.)

## P1 — Fluxo mensal completo
- [ ] **Email automático ao Marco (Resend)** — botão "Enviar ao Marco" que dispara email com o link do mês.
      → **Requer:** conta em resend.com + **RESEND_API_KEY** + verificar domínio (cr0x.org ou hostpms.com).
      → Implementação: função serverless no Vercel (`api/enviar.ts`) que usa a key (secreta, server-side).
- [ ] **Estado do envio** — acompanhar cada mês: enviado → em revisão → concluído (tabela `envios`).
- [ ] **Link por mês reutilizável** — um link estável por mês (não criar vários).

## P2 — UX / qualidade
- [ ] Rever UX completo (estados vazios, validações, loading, erros, mobile).
- [ ] Vista "Por pagar" global + indicadores no topo (total em aberto, por mês).
- [ ] Ordenação/filtro por cliente, produto, estado.
- [ ] Editar/apagar linha (não só adicionar).

## P3 — Dados / segurança / limpeza
- [ ] **Rotar segredos** Supabase (sb_secret + DB password) — foram partilhados no chat.
- [ ] Fundir clientes duplicados (Vilarosa/VilaRosa/Hotel Vilarosa, Falesia/Falésia, Papa figo/Papa Figo, etc.).
- [ ] Apagar projeto Lovable (já feito *unpublish*).
- [ ] (Opcional) Login real em vez de PIN, se quiser segurança forte.
