// espelho de consulta — FONTE EXECUTÁVEL É O SKIP (projeto 50182, v0.0.122).
// Limpeza pós-SPEC-1-007 (22/10/2026): guarda da régua liberada em ambiente teste.
// Em produção a regra original permanece: só rascunho pode ser apagado.

onRecordDelete((e) => {
  const rec = e.record
  // limpeza pós-SPEC-1-007: em ambiente teste, fixtures podem ser apagadas
  if (rec.getString('ambiente') === 'teste') return e.next()
  if (rec.getString('status') !== 'rascunho')
    throw new BadRequestError(
      'Só rascunho pode ser apagado — versões aprovadas/arquivadas permanecem no histórico.',
    )
  return e.next()
}, 'regras_produto')
