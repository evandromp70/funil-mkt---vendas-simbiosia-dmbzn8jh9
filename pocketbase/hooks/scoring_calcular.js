// SPEC-1-005 (task 3b93879f): calcular pontuação por produto — CA-1-005-01/02.
// POST /backend/v1/scoring/calcular { leadId, produtoId }
// O motor abaixo é CÓPIA INLINE de scripts/domain/scoring-core.js (fonte única; o gerador
// scripts/gerar-scoring-core.mjs mantém a correspondência — teste SCORE-FONTE confere).
// Verifica auth/papel/dono/ambiente/produto; usa a régua APROVADA mais recente (sem régua
// → pendente, sem régua genérica); persiste pontuacoes (idempotente por chave); a UI
// NUNCA envia valor/faixa — o servidor deriva tudo.
// (Gerado por scripts/gerar-scoring-core.mjs — não editar o motor inline à mão.)
