// LIMPEZA DA FASE 2 — NEUTRALIZADO EM 29/10/2026.
//
// A limpeza foi executada e verificada: 1.333 registros de fixture apagados, resíduo zero,
// preservados intactos (users 9, sistema_config 1, metas 1, 3 políticas aprovadas,
// 1 definição de oportunidade aprovada).
//
// Por que o arquivo fica aqui em vez de ser apagado: apagar o arquivo JÁ falhou antes
// ("file not found on pod", apply quebrado) e deixou a rota VIVA em produção. Uma rota de
// limpeza viva é uma bomba armada — qualquer admin pode zerar a base por engano.
//
// Aqui a rota responde 410 e NÃO executa nada. Rotas de limpeza não voltam.
routerAdd(
  'POST',
  '/backend/v1/admin/limpeza-fase-2',
  (e) => {
    return e.json(410, {
      estado: 'removida',
      motivo:
        'Rota de limpeza neutralizada após o uso (29/10/2026). A base foi limpa e verificada. Ela não executa mais nada.',
      como_refazer:
        'Se precisar limpar novamente, crie um hook novo, rode em modo relatório primeiro e remova em seguida.',
    })
  },
  $apis.requireAuth(),
)
