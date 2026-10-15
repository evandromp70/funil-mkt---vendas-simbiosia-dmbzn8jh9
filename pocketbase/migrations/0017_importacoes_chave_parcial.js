// SPEC-1-003 (task 899395c4, correção do teste humano): lote revertido libera a chave.
// O índice único idx_importacoes_chave bloqueava o reenvio de um arquivo cujo lote foi
// DESFEITO (o lote revertido continuava dono da chave_lote → violação de índice → 500 na
// confirmação). Migração ADITIVA: troca o índice por um PARCIAL — só lotes vivos
// (status != 'revertida') o ocupam. Lote revertido reprocessa como novo, como o admin espera.
// Nota: c.indexes é array JS imutável no PocketBase v0.36 — reconstruir com filter/spread.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('importacoes')
    const semVelho = c.indexes.filter((i) => !i.includes('idx_importacoes_chave'))
    const novo =
      "CREATE UNIQUE INDEX idx_importacoes_chave ON importacoes (chave_lote) WHERE status != 'revertida'"
    c.indexes = [...semVelho, novo]
    app.save(c)
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('importacoes')
      const semParcial = c.indexes.filter((i) => !i.includes("WHERE status != 'revertida'"))
      c.indexes = [
        ...semParcial,
        'CREATE UNIQUE INDEX idx_importacoes_chave ON importacoes (chave_lote)',
      ]
      app.save(c)
    } catch (_) {}
  },
)
