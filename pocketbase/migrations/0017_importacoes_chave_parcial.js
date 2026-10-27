// SPEC-1-003 (task 899395c4, correção do teste humano): lote revertido libera a chave.
// O índice único idx_importacoes_chave bloqueava o reenvio de um arquivo cujo lote foi
// DESFEITO. Migração ADITIVA: troca o índice por um PARCIAL — só lotes vivos
// (status != 'revertida') o ocupam.
// F2-T01: recuperada do Skip 50182 (fonte executável).
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
